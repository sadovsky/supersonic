// A compact 6502 interpreter (official opcodes only, no decimal mode — the NES
// CPU has none). It runs SMB's game logic straight out of the user's ROM.
//
// Hooks let native code take over at a given address:
//   cpu.hooks.set(addr, fn)  — fn(cpu) is called before the instruction at
//   addr executes. Return HOOK_RTS to perform an RTS (the hook replaced the
//   subroutine), HOOK_CONTINUE to execute the original code, or a number to
//   jump there.

export const HOOK_CONTINUE = 0;
export const HOOK_RTS = -1;

const SENTINEL = 0x0000; // RAM address never executed by SMB; used as a return marker

export class CPU6502 {
  constructor(bus) {
    this.bus = bus;
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xfd; this.pc = 0;
    this.c = 0; this.z = 0; this.i = 1; this.d = 0; this.v = 0; this.n = 0;
    this.hooks = new Map();
    this.skipHookAt = -1;
    this.steps = 0;
  }

  read(a) { return this.bus.read(a & 0xffff); }
  write(a, v) { this.bus.write(a & 0xffff, v & 0xff); }
  read16(a) { return this.read(a) | (this.read(a + 1) << 8); }
  // 6502 indirect-jump page-wrap bug
  read16bug(a) { const hi = (a & 0xff00) | ((a + 1) & 0xff); return this.read(a) | (this.read(hi) << 8); }

  push(v) { this.bus.ram[0x100 | this.sp] = v & 0xff; this.sp = (this.sp - 1) & 0xff; }
  pull() { this.sp = (this.sp + 1) & 0xff; return this.bus.ram[0x100 | this.sp]; }
  push16(v) { this.push(v >> 8); this.push(v); }
  pull16() { const lo = this.pull(); return lo | (this.pull() << 8); }

  getP() {
    return (this.n << 7) | (this.v << 6) | 0x20 | (this.d << 3) | (this.i << 2) | (this.z << 1) | this.c;
  }
  setP(p) {
    this.n = (p >> 7) & 1; this.v = (p >> 6) & 1; this.d = (p >> 3) & 1;
    this.i = (p >> 2) & 1; this.z = (p >> 1) & 1; this.c = p & 1;
  }
  nz(v) { this.n = (v >> 7) & 1; this.z = v === 0 ? 1 : 0; return v; }

  // Run a subroutine at addr to completion (as if JSR'd from native code).
  call(addr, skipHook = false) {
    const sp0 = this.sp;
    const savedPc = this.pc;
    this.push16((SENTINEL - 1) & 0xffff);
    this.pc = addr;
    if (skipHook) this.skipHookAt = addr;
    this.runUntilSentinel(sp0);
    this.pc = savedPc;
  }

  // Simulate the NMI interrupt and run the handler until RTI.
  nmi(vector) {
    const sp0 = this.sp;
    this.push16(SENTINEL);
    this.push(this.getP() & ~0x10);
    this.i = 1;
    this.pc = vector;
    this.runUntilSentinel(sp0);
  }

  runUntilSentinel(sp0) {
    let guard = 0;
    while (!(this.pc === SENTINEL && this.sp === sp0)) {
      this.step();
      if (++guard > 5_000_000) throw new Error('CPU runaway at $' + this.pc.toString(16));
    }
  }

  runUntil(addr, maxSteps = 5_000_000) {
    let guard = 0;
    while (this.pc !== addr) {
      this.step();
      if (++guard > maxSteps) throw new Error('CPU runaway at $' + this.pc.toString(16));
    }
  }

  // --- addressing helpers -------------------------------------------------
  imm() { return this.pc++ & 0xffff; }
  zp() { return this.read(this.pc++); }
  zpx() { return (this.read(this.pc++) + this.x) & 0xff; }
  zpy() { return (this.read(this.pc++) + this.y) & 0xff; }
  abs() { const a = this.read16(this.pc); this.pc += 2; return a; }
  abx() { const a = this.read16(this.pc); this.pc += 2; return (a + this.x) & 0xffff; }
  aby() { const a = this.read16(this.pc); this.pc += 2; return (a + this.y) & 0xffff; }
  izx() { const z = (this.read(this.pc++) + this.x) & 0xff; return this.bus.ram[z] | (this.bus.ram[(z + 1) & 0xff] << 8); }
  izy() { const z = this.read(this.pc++); return ((this.bus.ram[z] | (this.bus.ram[(z + 1) & 0xff] << 8)) + this.y) & 0xffff; }

  adc(v) {
    const r = this.a + v + this.c;
    this.v = (~(this.a ^ v) & (this.a ^ r) & 0x80) ? 1 : 0;
    this.c = r > 0xff ? 1 : 0;
    this.a = this.nz(r & 0xff);
  }
  sbc(v) { this.adc(v ^ 0xff); }
  cmp(r, v) { const t = r - v; this.c = t >= 0 ? 1 : 0; this.nz(t & 0xff); }
  branch(cond) {
    const off = this.read(this.pc++);
    if (cond) this.pc = (this.pc + ((off ^ 0x80) - 0x80)) & 0xffff;
  }
  asl(v) { this.c = (v >> 7) & 1; return this.nz((v << 1) & 0xff); }
  lsr(v) { this.c = v & 1; return this.nz(v >> 1); }
  rol(v) { const r = ((v << 1) | this.c) & 0xff; this.c = (v >> 7) & 1; return this.nz(r); }
  ror(v) { const r = (v >> 1) | (this.c << 7); this.c = v & 1; return this.nz(r); }
  rmw(addr, f) { this.write(addr, f.call(this, this.read(addr))); }

  step() {
    const pc = this.pc;
    if (this.hooks.size && this.hooks.has(pc)) {
      if (this.skipHookAt === pc) {
        this.skipHookAt = -1;
      } else {
        const r = this.hooks.get(pc)(this);
        if (r === HOOK_RTS) { this.pc = (this.pull16() + 1) & 0xffff; return; }
        if (typeof r === 'number' && r > 0) { this.pc = r; return; }
      }
    }
    this.steps++;
    const op = this.read(this.pc++);
    let a;
    switch (op) {
      // LDA
      case 0xa9: this.a = this.nz(this.read(this.imm())); break;
      case 0xa5: this.a = this.nz(this.read(this.zp())); break;
      case 0xb5: this.a = this.nz(this.read(this.zpx())); break;
      case 0xad: this.a = this.nz(this.read(this.abs())); break;
      case 0xbd: this.a = this.nz(this.read(this.abx())); break;
      case 0xb9: this.a = this.nz(this.read(this.aby())); break;
      case 0xa1: this.a = this.nz(this.read(this.izx())); break;
      case 0xb1: this.a = this.nz(this.read(this.izy())); break;
      // LDX
      case 0xa2: this.x = this.nz(this.read(this.imm())); break;
      case 0xa6: this.x = this.nz(this.read(this.zp())); break;
      case 0xb6: this.x = this.nz(this.read(this.zpy())); break;
      case 0xae: this.x = this.nz(this.read(this.abs())); break;
      case 0xbe: this.x = this.nz(this.read(this.aby())); break;
      // LDY
      case 0xa0: this.y = this.nz(this.read(this.imm())); break;
      case 0xa4: this.y = this.nz(this.read(this.zp())); break;
      case 0xb4: this.y = this.nz(this.read(this.zpx())); break;
      case 0xac: this.y = this.nz(this.read(this.abs())); break;
      case 0xbc: this.y = this.nz(this.read(this.abx())); break;
      // STA
      case 0x85: this.write(this.zp(), this.a); break;
      case 0x95: this.write(this.zpx(), this.a); break;
      case 0x8d: this.write(this.abs(), this.a); break;
      case 0x9d: this.write(this.abx(), this.a); break;
      case 0x99: this.write(this.aby(), this.a); break;
      case 0x81: this.write(this.izx(), this.a); break;
      case 0x91: this.write(this.izy(), this.a); break;
      // STX / STY
      case 0x86: this.write(this.zp(), this.x); break;
      case 0x96: this.write(this.zpy(), this.x); break;
      case 0x8e: this.write(this.abs(), this.x); break;
      case 0x84: this.write(this.zp(), this.y); break;
      case 0x94: this.write(this.zpx(), this.y); break;
      case 0x8c: this.write(this.abs(), this.y); break;
      // transfers
      case 0xaa: this.x = this.nz(this.a); break;
      case 0xa8: this.y = this.nz(this.a); break;
      case 0x8a: this.a = this.nz(this.x); break;
      case 0x98: this.a = this.nz(this.y); break;
      case 0xba: this.x = this.nz(this.sp); break;
      case 0x9a: this.sp = this.x; break;
      // stack
      case 0x48: this.push(this.a); break;
      case 0x68: this.a = this.nz(this.pull()); break;
      case 0x08: this.push(this.getP() | 0x10); break;
      case 0x28: this.setP(this.pull()); break;
      // ADC
      case 0x69: this.adc(this.read(this.imm())); break;
      case 0x65: this.adc(this.read(this.zp())); break;
      case 0x75: this.adc(this.read(this.zpx())); break;
      case 0x6d: this.adc(this.read(this.abs())); break;
      case 0x7d: this.adc(this.read(this.abx())); break;
      case 0x79: this.adc(this.read(this.aby())); break;
      case 0x61: this.adc(this.read(this.izx())); break;
      case 0x71: this.adc(this.read(this.izy())); break;
      // SBC
      case 0xe9: this.sbc(this.read(this.imm())); break;
      case 0xe5: this.sbc(this.read(this.zp())); break;
      case 0xf5: this.sbc(this.read(this.zpx())); break;
      case 0xed: this.sbc(this.read(this.abs())); break;
      case 0xfd: this.sbc(this.read(this.abx())); break;
      case 0xf9: this.sbc(this.read(this.aby())); break;
      case 0xe1: this.sbc(this.read(this.izx())); break;
      case 0xf1: this.sbc(this.read(this.izy())); break;
      // AND
      case 0x29: this.a = this.nz(this.a & this.read(this.imm())); break;
      case 0x25: this.a = this.nz(this.a & this.read(this.zp())); break;
      case 0x35: this.a = this.nz(this.a & this.read(this.zpx())); break;
      case 0x2d: this.a = this.nz(this.a & this.read(this.abs())); break;
      case 0x3d: this.a = this.nz(this.a & this.read(this.abx())); break;
      case 0x39: this.a = this.nz(this.a & this.read(this.aby())); break;
      case 0x21: this.a = this.nz(this.a & this.read(this.izx())); break;
      case 0x31: this.a = this.nz(this.a & this.read(this.izy())); break;
      // ORA
      case 0x09: this.a = this.nz(this.a | this.read(this.imm())); break;
      case 0x05: this.a = this.nz(this.a | this.read(this.zp())); break;
      case 0x15: this.a = this.nz(this.a | this.read(this.zpx())); break;
      case 0x0d: this.a = this.nz(this.a | this.read(this.abs())); break;
      case 0x1d: this.a = this.nz(this.a | this.read(this.abx())); break;
      case 0x19: this.a = this.nz(this.a | this.read(this.aby())); break;
      case 0x01: this.a = this.nz(this.a | this.read(this.izx())); break;
      case 0x11: this.a = this.nz(this.a | this.read(this.izy())); break;
      // EOR
      case 0x49: this.a = this.nz(this.a ^ this.read(this.imm())); break;
      case 0x45: this.a = this.nz(this.a ^ this.read(this.zp())); break;
      case 0x55: this.a = this.nz(this.a ^ this.read(this.zpx())); break;
      case 0x4d: this.a = this.nz(this.a ^ this.read(this.abs())); break;
      case 0x5d: this.a = this.nz(this.a ^ this.read(this.abx())); break;
      case 0x59: this.a = this.nz(this.a ^ this.read(this.aby())); break;
      case 0x41: this.a = this.nz(this.a ^ this.read(this.izx())); break;
      case 0x51: this.a = this.nz(this.a ^ this.read(this.izy())); break;
      // CMP / CPX / CPY
      case 0xc9: this.cmp(this.a, this.read(this.imm())); break;
      case 0xc5: this.cmp(this.a, this.read(this.zp())); break;
      case 0xd5: this.cmp(this.a, this.read(this.zpx())); break;
      case 0xcd: this.cmp(this.a, this.read(this.abs())); break;
      case 0xdd: this.cmp(this.a, this.read(this.abx())); break;
      case 0xd9: this.cmp(this.a, this.read(this.aby())); break;
      case 0xc1: this.cmp(this.a, this.read(this.izx())); break;
      case 0xd1: this.cmp(this.a, this.read(this.izy())); break;
      case 0xe0: this.cmp(this.x, this.read(this.imm())); break;
      case 0xe4: this.cmp(this.x, this.read(this.zp())); break;
      case 0xec: this.cmp(this.x, this.read(this.abs())); break;
      case 0xc0: this.cmp(this.y, this.read(this.imm())); break;
      case 0xc4: this.cmp(this.y, this.read(this.zp())); break;
      case 0xcc: this.cmp(this.y, this.read(this.abs())); break;
      // BIT
      case 0x24: a = this.read(this.zp()); this.z = (this.a & a) ? 0 : 1; this.n = (a >> 7) & 1; this.v = (a >> 6) & 1; break;
      case 0x2c: a = this.read(this.abs()); this.z = (this.a & a) ? 0 : 1; this.n = (a >> 7) & 1; this.v = (a >> 6) & 1; break;
      // INC / DEC
      case 0xe6: a = this.zp(); this.write(a, this.nz((this.read(a) + 1) & 0xff)); break;
      case 0xf6: a = this.zpx(); this.write(a, this.nz((this.read(a) + 1) & 0xff)); break;
      case 0xee: a = this.abs(); this.write(a, this.nz((this.read(a) + 1) & 0xff)); break;
      case 0xfe: a = this.abx(); this.write(a, this.nz((this.read(a) + 1) & 0xff)); break;
      case 0xc6: a = this.zp(); this.write(a, this.nz((this.read(a) - 1) & 0xff)); break;
      case 0xd6: a = this.zpx(); this.write(a, this.nz((this.read(a) - 1) & 0xff)); break;
      case 0xce: a = this.abs(); this.write(a, this.nz((this.read(a) - 1) & 0xff)); break;
      case 0xde: a = this.abx(); this.write(a, this.nz((this.read(a) - 1) & 0xff)); break;
      case 0xe8: this.x = this.nz((this.x + 1) & 0xff); break;
      case 0xc8: this.y = this.nz((this.y + 1) & 0xff); break;
      case 0xca: this.x = this.nz((this.x - 1) & 0xff); break;
      case 0x88: this.y = this.nz((this.y - 1) & 0xff); break;
      // shifts
      case 0x0a: this.a = this.asl(this.a); break;
      case 0x06: this.rmw(this.zp(), this.asl); break;
      case 0x16: this.rmw(this.zpx(), this.asl); break;
      case 0x0e: this.rmw(this.abs(), this.asl); break;
      case 0x1e: this.rmw(this.abx(), this.asl); break;
      case 0x4a: this.a = this.lsr(this.a); break;
      case 0x46: this.rmw(this.zp(), this.lsr); break;
      case 0x56: this.rmw(this.zpx(), this.lsr); break;
      case 0x4e: this.rmw(this.abs(), this.lsr); break;
      case 0x5e: this.rmw(this.abx(), this.lsr); break;
      case 0x2a: this.a = this.rol(this.a); break;
      case 0x26: this.rmw(this.zp(), this.rol); break;
      case 0x36: this.rmw(this.zpx(), this.rol); break;
      case 0x2e: this.rmw(this.abs(), this.rol); break;
      case 0x3e: this.rmw(this.abx(), this.rol); break;
      case 0x6a: this.a = this.ror(this.a); break;
      case 0x66: this.rmw(this.zp(), this.ror); break;
      case 0x76: this.rmw(this.zpx(), this.ror); break;
      case 0x6e: this.rmw(this.abs(), this.ror); break;
      case 0x7e: this.rmw(this.abx(), this.ror); break;
      // jumps
      case 0x4c: this.pc = this.read16(this.pc); break;
      case 0x6c: this.pc = this.read16bug(this.read16(this.pc)); break;
      case 0x20: a = this.read16(this.pc); this.push16((this.pc + 1) & 0xffff); this.pc = a; break;
      case 0x60: this.pc = (this.pull16() + 1) & 0xffff; break;
      case 0x40: this.setP(this.pull()); this.pc = this.pull16(); break;
      // branches
      case 0x10: this.branch(!this.n); break;
      case 0x30: this.branch(this.n); break;
      case 0x50: this.branch(!this.v); break;
      case 0x70: this.branch(this.v); break;
      case 0x90: this.branch(!this.c); break;
      case 0xb0: this.branch(this.c); break;
      case 0xd0: this.branch(!this.z); break;
      case 0xf0: this.branch(this.z); break;
      // flags
      case 0x18: this.c = 0; break;
      case 0x38: this.c = 1; break;
      case 0x58: this.i = 0; break;
      case 0x78: this.i = 1; break;
      case 0xb8: this.v = 0; break;
      case 0xd8: this.d = 0; break;
      case 0xf8: this.d = 1; break;
      case 0xea: break;
      case 0x00: // BRK — SMB never uses it; treat as a fatal error
      default:
        throw new Error(`Unknown opcode $${op.toString(16)} at $${pc.toString(16)}`);
    }
  }
}
