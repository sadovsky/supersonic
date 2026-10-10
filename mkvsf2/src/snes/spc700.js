// The SNES sound CPU (Sony SPC700) with its 64 KB of RAM, IPL boot ROM and
// timers. The DSP is attached as `dsp` (read/write of $F2/$F3).

const IPL = [
  0xcd, 0xef, 0xbd, 0xe8, 0x00, 0xc6, 0x1d, 0xd0, 0xfc, 0x8f, 0xaa, 0xf4, 0x8f, 0xbb, 0xf5, 0x78,
  0xcc, 0xf4, 0xd0, 0xfb, 0x2f, 0x19, 0xeb, 0xf4, 0xd0, 0xfc, 0x7e, 0xf4, 0xd0, 0x0b, 0xe4, 0xf5,
  0xcb, 0xf4, 0xd7, 0x00, 0xfc, 0xd0, 0xf3, 0xab, 0x01, 0x10, 0xef, 0x7e, 0xf4, 0x10, 0xeb, 0xba,
  0xf6, 0xda, 0x00, 0xba, 0xf4, 0xc4, 0xf4, 0xdd, 0x5d, 0xd0, 0xdb, 0x1f, 0x00, 0x00, 0xc0, 0xff,
];

const CYCLES = [
  2,8,4,5,3,4,3,6,2,6,5,4,5,4,6,8, 2,8,4,5,4,5,5,6,5,5,6,5,2,2,4,6,
  2,8,4,5,3,4,3,6,2,6,5,4,5,4,5,4, 2,8,4,5,4,5,5,6,5,5,6,5,2,2,3,8,
  2,8,4,5,3,4,3,6,2,6,4,4,5,4,6,6, 2,8,4,5,4,5,5,6,5,5,4,5,2,2,4,3,
  2,8,4,5,3,4,3,6,2,6,4,4,5,4,5,5, 2,8,4,5,4,5,5,6,5,5,5,5,2,2,3,6,
  2,8,4,5,3,4,3,6,2,6,5,4,5,2,4,5, 2,8,4,5,4,5,5,6,5,5,5,5,2,2,12,5,
  3,8,4,5,3,4,3,6,2,6,4,4,5,2,4,4, 2,8,4,5,4,5,5,6,5,5,5,5,2,2,3,4,
  3,8,4,5,4,5,4,7,2,5,6,4,5,2,4,9, 2,8,4,5,5,6,6,7,4,5,5,5,2,2,6,3,
  2,8,4,5,3,4,3,6,2,4,5,3,4,3,4,3, 2,8,4,5,4,5,5,6,3,4,5,4,2,2,4,3,
];

export class SPC700 {
  constructor() {
    this.ram = new Uint8Array(0x10000);
    this.dsp = null;
    this.inPorts = new Uint8Array(4);  // written by the main CPU
    this.outPorts = new Uint8Array(4); // written by the SPC
    this.reset();
  }

  reset() {
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xef;
    this.n = 0; this.v = 0; this.p = 0; this.b = 0; this.h = 0; this.i = 0; this.z = 0; this.c = 0;
    this.iplEnabled = true;
    this.timerEnable = [0, 0, 0];
    this.timerTarget = [0, 0, 0];
    this.timerStage = [0, 0, 0];
    this.timerOut = [0, 0, 0];
    this.timerDiv = [0, 0, 0];
    this.cycles = 0;
    this.stopped = false;
    this.pc = IPL[0x3e] | (IPL[0x3f] << 8);
  }

  // --- memory --------------------------------------------------------------
  read(a) {
    a &= 0xffff;
    if (a >= 0xf0 && a <= 0xff) {
      switch (a) {
        case 0xf2: return this.dspAddr;
        case 0xf3: return this.dsp ? this.dsp.read(this.dspAddr & 0x7f) : 0;
        case 0xf4: case 0xf5: case 0xf6: case 0xf7: return this.inPorts[a - 0xf4];
        case 0xfd: case 0xfe: case 0xff: { const t = a - 0xfd; const v = this.timerOut[t]; this.timerOut[t] = 0; return v; }
        case 0xf8: case 0xf9: return this.ram[a];
        default: return 0;
      }
    }
    if (a >= 0xffc0 && this.iplEnabled) return IPL[a - 0xffc0];
    return this.ram[a];
  }
  write(a, v) {
    a &= 0xffff; v &= 0xff;
    if (a >= 0xf0 && a <= 0xff) {
      switch (a) {
        case 0xf1:
          for (let t = 0; t < 3; t++) {
            const en = (v >> t) & 1;
            if (en && !this.timerEnable[t]) { this.timerStage[t] = 0; this.timerOut[t] = 0; }
            this.timerEnable[t] = en;
          }
          if (v & 0x10) { this.inPorts[0] = 0; this.inPorts[1] = 0; }
          if (v & 0x20) { this.inPorts[2] = 0; this.inPorts[3] = 0; }
          this.iplEnabled = (v & 0x80) !== 0;
          return;
        case 0xf2: this.dspAddr = v; return;
        case 0xf3: if (this.dsp && this.dspAddr < 0x80) this.dsp.write(this.dspAddr, v); return;
        case 0xf4: case 0xf5: case 0xf6: case 0xf7: this.outPorts[a - 0xf4] = v; return;
        case 0xfa: case 0xfb: case 0xfc: this.timerTarget[a - 0xfa] = v; return;
        case 0xf8: case 0xf9: this.ram[a] = v; return;
        default: return;
      }
    }
    this.ram[a] = v;
  }

  tickTimers(cyc) {
    for (let t = 0; t < 3; t++) {
      const period = t === 2 ? 16 : 128;
      this.timerDiv[t] += cyc;
      while (this.timerDiv[t] >= period) {
        this.timerDiv[t] -= period;
        if (!this.timerEnable[t]) continue;
        this.timerStage[t] = (this.timerStage[t] + 1) & 0xff;
        if (this.timerStage[t] === this.timerTarget[t]) {
          this.timerStage[t] = 0;
          this.timerOut[t] = (this.timerOut[t] + 1) & 0xf;
        }
      }
    }
  }

  fetch() { const v = this.read(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  push(v) { this.ram[0x100 | this.sp] = v & 0xff; this.sp = (this.sp - 1) & 0xff; }
  pull() { this.sp = (this.sp + 1) & 0xff; return this.ram[0x100 | this.sp]; }
  dpA(o) { return (this.p ? 0x100 : 0) | (o & 0xff); }
  rd(o) { return this.read(this.dpA(o)); }
  wd(o, v) { this.write(this.dpA(o), v); }
  rdw(o) { return this.rd(o) | (this.rd((o + 1) & 0xff) << 8); }
  wdw(o, v) { this.wd(o, v); this.wd((o + 1) & 0xff, v >> 8); }

  getPSW() { return (this.n << 7) | (this.v << 6) | (this.p << 5) | (this.b << 4) | (this.h << 3) | (this.i << 2) | (this.z << 1) | this.c; }
  setPSW(v) { this.n = (v >> 7) & 1; this.v = (v >> 6) & 1; this.p = (v >> 5) & 1; this.b = (v >> 4) & 1; this.h = (v >> 3) & 1; this.i = (v >> 2) & 1; this.z = (v >> 1) & 1; this.c = v & 1; }
  nz(v) { v &= 0xff; this.n = v >> 7; this.z = v === 0 ? 1 : 0; return v; }

  adc(a, b) {
    const r = a + b + this.c;
    this.v = (~(a ^ b) & (a ^ r) & 0x80) ? 1 : 0;
    this.h = ((a ^ b ^ r) & 0x10) ? 1 : 0;
    this.c = r > 0xff ? 1 : 0;
    return this.nz(r);
  }
  sbc(a, b) { return this.adc(a, b ^ 0xff); }
  cmp(a, b) { const r = a - b; this.c = r >= 0 ? 1 : 0; this.nz(r); }
  asl(v) { this.c = (v >> 7) & 1; return this.nz(v << 1); }
  lsr(v) { this.c = v & 1; return this.nz(v >> 1); }
  rol(v) { const c = this.c; this.c = (v >> 7) & 1; return this.nz((v << 1) | c); }
  ror(v) { const c = this.c; this.c = v & 1; return this.nz((v >> 1) | (c << 7)); }
  br(cond) { const o = this.fetch(); if (cond) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; this.cycles += 2; } }

  // addressing helpers (return absolute addresses)
  aD() { return this.dpA(this.fetch()); }
  aDX() { return this.dpA(this.fetch() + this.x); }
  aDY() { return this.dpA(this.fetch() + this.y); }
  aAbs() { return this.fetch16(); }
  aAbsX() { return (this.fetch16() + this.x) & 0xffff; }
  aAbsY() { return (this.fetch16() + this.y) & 0xffff; }
  aIX() { return this.dpA(this.x); }
  aIndX() { const o = this.fetch() + this.x; return this.rdw(o & 0xff); }
  aIndY() { const o = this.fetch(); return (this.rdw(o) + this.y) & 0xffff; }
  rd16(a) { return this.read(a) | (this.read((a & 0xff00) | ((a + 1) & 0xff)) << 8); }

  // ALU op on A with an operand source; op: 0 or,1 and,2 eor,3 cmp,4 adc,5 sbc
  alu(op, a, b) {
    switch (op) {
      case 0: return this.nz(a | b);
      case 1: return this.nz(a & b);
      case 2: return this.nz(a ^ b);
      case 3: this.cmp(a, b); return a;
      case 4: return this.adc(a, b);
      case 5: return this.sbc(a, b);
    }
  }

  run(cycles) {
    const end = this.cycles + cycles;
    while (this.cycles < end) {
      if (this.stopped) { const d = end - this.cycles; this.tickTimers(d); this.cycles = end; break; }
      const c0 = this.cycles;
      this.step();
      this.tickTimers(this.cycles - c0);
    }
  }

  step() {
    const op = this.fetch();
    this.cycles += CYCLES[op];
    // The ALU block: columns 4-9 of rows with op>>4 in 0,2,4,6,8,A and their +0x10 rows
    const row = op >> 4, col = op & 0xf;
    const aluRow = { 0x0: 0, 0x1: 0, 0x2: 1, 0x3: 1, 0x4: 2, 0x5: 2, 0x6: 3, 0x7: 3, 0x8: 4, 0x9: 4, 0xa: 5, 0xb: 5 }[row];
    if (aluRow !== undefined && col >= 4 && col <= 9) {
      const f = aluRow;
      let a;
      if (!(row & 1)) {
        switch (col) {
          case 4: this.a = this.alu(f, this.a, this.read(this.aD())); return;
          case 5: this.a = this.alu(f, this.a, this.read(this.aAbs())); return;
          case 6: this.a = this.alu(f, this.a, this.read(this.aIX())); return;
          case 7: this.a = this.alu(f, this.a, this.read(this.aIndX())); return;
          case 8: this.a = this.alu(f, this.a, this.fetch()); return;
          case 9: { const s = this.read(this.aD()); a = this.aD(); const r = this.alu(f, this.read(a), s); if (f !== 3) this.write(a, r); return; }
        }
      } else {
        switch (col) {
          case 4: this.a = this.alu(f, this.a, this.read(this.aDX())); return;
          case 5: this.a = this.alu(f, this.a, this.read(this.aAbsX())); return;
          case 6: this.a = this.alu(f, this.a, this.read(this.aAbsY())); return;
          case 7: this.a = this.alu(f, this.a, this.read(this.aIndY())); return;
          case 8: { const imm = this.fetch(); a = this.aD(); const r = this.alu(f, this.read(a), imm); if (f !== 3) this.write(a, r); return; }
          case 9: { const s = this.read(this.dpA(this.y)); a = this.dpA(this.x); const r = this.alu(f, this.read(a), s); if (f !== 3) this.write(a, r); return; }
        }
      }
    }
    // TCALL n (x1)
    if (col === 1) {
      const n = row;
      this.push(this.pc >> 8); this.push(this.pc);
      this.pc = this.rd16(0xffde - n * 2);
      return;
    }
    // SET1/CLR1 d.b (x2), BBS/BBC d.b,r (x3)
    if (col === 2) { const bit = row >> 1; const a = this.aD(); const v = this.read(a); this.write(a, row & 1 ? v & ~(1 << bit) : v | (1 << bit)); return; }
    if (col === 3) {
      const bit = row >> 1; const v = this.read(this.aD()); const o = this.fetch();
      const set = (v >> bit) & 1;
      if ((row & 1) ? !set : set) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; this.cycles += 2; }
      return;
    }
    let a, v, t;
    switch (op) {
      case 0x00: break;
      case 0x0f: this.push(this.pc >> 8); this.push(this.pc); this.push(this.getPSW()); this.b = 1; this.i = 0; this.pc = this.rd16(0xffde); break;
      case 0x0a: case 0x2a: case 0x4a: case 0x6a: case 0x8a: case 0xaa: case 0xca: case 0xea: {
        t = this.fetch16(); a = t & 0x1fff; const bit = t >> 13; v = (this.read(a) >> bit) & 1;
        switch (op) {
          case 0x0a: this.c |= v; break;
          case 0x2a: this.c |= v ^ 1; break;
          case 0x4a: this.c &= v; break;
          case 0x6a: this.c &= v ^ 1; break;
          case 0x8a: this.c ^= v; break;
          case 0xaa: this.c = v; break;
          case 0xca: { const m = this.read(a); this.write(a, this.c ? m | (1 << bit) : m & ~(1 << bit)); break; }
          case 0xea: this.write(a, this.read(a) ^ (1 << bit)); break;
        }
        break;
      }
      case 0x0b: a = this.aD(); this.write(a, this.asl(this.read(a))); break;
      case 0x0c: a = this.aAbs(); this.write(a, this.asl(this.read(a))); break;
      case 0x1b: a = this.aDX(); this.write(a, this.asl(this.read(a))); break;
      case 0x1c: this.a = this.asl(this.a); break;
      case 0x2b: a = this.aD(); this.write(a, this.rol(this.read(a))); break;
      case 0x2c: a = this.aAbs(); this.write(a, this.rol(this.read(a))); break;
      case 0x3b: a = this.aDX(); this.write(a, this.rol(this.read(a))); break;
      case 0x3c: this.a = this.rol(this.a); break;
      case 0x4b: a = this.aD(); this.write(a, this.lsr(this.read(a))); break;
      case 0x4c: a = this.aAbs(); this.write(a, this.lsr(this.read(a))); break;
      case 0x5b: a = this.aDX(); this.write(a, this.lsr(this.read(a))); break;
      case 0x5c: this.a = this.lsr(this.a); break;
      case 0x6b: a = this.aD(); this.write(a, this.ror(this.read(a))); break;
      case 0x6c: a = this.aAbs(); this.write(a, this.ror(this.read(a))); break;
      case 0x7b: a = this.aDX(); this.write(a, this.ror(this.read(a))); break;
      case 0x7c: this.a = this.ror(this.a); break;
      case 0x8b: a = this.aD(); this.write(a, this.nz(this.read(a) - 1)); break;
      case 0x8c: a = this.aAbs(); this.write(a, this.nz(this.read(a) - 1)); break;
      case 0x9b: a = this.aDX(); this.write(a, this.nz(this.read(a) - 1)); break;
      case 0x9c: this.a = this.nz(this.a - 1); break;
      case 0xab: a = this.aD(); this.write(a, this.nz(this.read(a) + 1)); break;
      case 0xac: a = this.aAbs(); this.write(a, this.nz(this.read(a) + 1)); break;
      case 0xbb: a = this.aDX(); this.write(a, this.nz(this.read(a) + 1)); break;
      case 0xbc: this.a = this.nz(this.a + 1); break;
      case 0x1d: this.x = this.nz(this.x - 1); break;
      case 0x3d: this.x = this.nz(this.x + 1); break;
      case 0xdc: this.y = this.nz(this.y - 1); break;
      case 0xfc: this.y = this.nz(this.y + 1); break;
      case 0x0d: this.push(this.getPSW()); break;
      case 0x2d: this.push(this.a); break;
      case 0x4d: this.push(this.x); break;
      case 0x6d: this.push(this.y); break;
      case 0x8e: this.setPSW(this.pull()); break;
      case 0xae: this.a = this.pull(); break;
      case 0xce: this.x = this.pull(); break;
      case 0xee: this.y = this.pull(); break;
      case 0x0e: case 0x4e: a = this.aAbs(); v = this.read(a); this.nz(this.a - v); this.write(a, op === 0x0e ? v | this.a : v & ~this.a); break;
      case 0x10: this.br(!this.n); break;
      case 0x30: this.br(this.n); break;
      case 0x50: this.br(!this.v); break;
      case 0x70: this.br(this.v); break;
      case 0x90: this.br(!this.c); break;
      case 0xb0: this.br(this.c); break;
      case 0xd0: this.br(!this.z); break;
      case 0xf0: this.br(this.z); break;
      case 0x2f: this.br(true); break;
      case 0x1a: a = this.fetch(); v = (this.rdw(a) - 1) & 0xffff; this.wdw(a, v); this.n = v >> 15; this.z = v === 0 ? 1 : 0; break;
      case 0x3a: a = this.fetch(); v = (this.rdw(a) + 1) & 0xffff; this.wdw(a, v); this.n = v >> 15; this.z = v === 0 ? 1 : 0; break;
      case 0x5a: { v = this.rdw(this.fetch()); const ya = (this.y << 8) | this.a; const r = ya - v; this.c = r >= 0 ? 1 : 0; this.n = (r >> 15) & 1; this.z = (r & 0xffff) === 0 ? 1 : 0; break; }
      case 0x7a: case 0x9a: {
        v = this.rdw(this.fetch()); const ya = (this.y << 8) | this.a;
        if (op === 0x9a) v = v ^ 0xffff;
        const cin = op === 0x9a ? 1 : 0;
        const r = ya + v + cin;
        this.v = (~(ya ^ v) & (ya ^ r) & 0x8000) ? 1 : 0;
        this.h = ((ya ^ v ^ r) & 0x1000) ? 1 : 0;
        this.c = r > 0xffff ? 1 : 0;
        const rr = r & 0xffff; this.a = rr & 0xff; this.y = rr >> 8; this.n = rr >> 15; this.z = rr === 0 ? 1 : 0;
        break;
      }
      case 0xba: v = this.rdw(this.fetch()); this.a = v & 0xff; this.y = v >> 8; this.n = v >> 15; this.z = v === 0 ? 1 : 0; break;
      case 0xda: a = this.fetch(); this.wdw(a, (this.y << 8) | this.a); break;
      case 0x1e: this.cmp(this.x, this.read(this.aAbs())); break;
      case 0x3e: this.cmp(this.x, this.read(this.aD())); break;
      case 0x5e: this.cmp(this.y, this.read(this.aAbs())); break;
      case 0x7e: this.cmp(this.y, this.read(this.aD())); break;
      case 0xc8: this.cmp(this.x, this.fetch()); break;
      case 0xad: this.cmp(this.y, this.fetch()); break;
      case 0x1f: t = this.fetch16(); this.pc = this.rd16((t + this.x) & 0xffff); break;
      case 0x5f: this.pc = this.fetch16(); break;
      case 0x3f: t = this.fetch16(); this.push(this.pc >> 8); this.push(this.pc); this.pc = t; break;
      case 0x4f: t = this.fetch(); this.push(this.pc >> 8); this.push(this.pc); this.pc = 0xff00 | t; break;
      case 0x6f: t = this.pull(); this.pc = t | (this.pull() << 8); break;
      case 0x7f: this.setPSW(this.pull()); t = this.pull(); this.pc = t | (this.pull() << 8); break;
      case 0x2e: { v = this.read(this.aD()); const o = this.fetch(); if (this.a !== v) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; this.cycles += 2; } break; }
      case 0xde: { v = this.read(this.aDX()); const o = this.fetch(); if (this.a !== v) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; this.cycles += 2; } break; }
      case 0x6e: { a = this.aD(); v = (this.read(a) - 1) & 0xff; this.write(a, v); const o = this.fetch(); if (v) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; this.cycles += 2; } break; }
      case 0xfe: { this.y = (this.y - 1) & 0xff; const o = this.fetch(); if (this.y) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; this.cycles += 2; } break; }
      case 0x20: this.p = 0; break;
      case 0x40: this.p = 1; break;
      case 0x60: this.c = 0; break;
      case 0x80: this.c = 1; break;
      case 0xa0: this.i = 1; break;
      case 0xc0: this.i = 0; break;
      case 0xe0: this.v = 0; this.h = 0; break;
      case 0xed: this.c ^= 1; break;
      case 0x5d: this.x = this.nz(this.a); break;
      case 0x7d: this.a = this.nz(this.x); break;
      case 0xdd: this.a = this.nz(this.y); break;
      case 0xfd: this.y = this.nz(this.a); break;
      case 0x9d: this.x = this.nz(this.sp); break;
      case 0xbd: this.sp = this.x; break;
      case 0x8d: this.y = this.nz(this.fetch()); break;
      case 0xcd: this.x = this.nz(this.fetch()); break;
      case 0xe8: this.a = this.nz(this.fetch()); break;
      case 0x8f: v = this.fetch(); this.write(this.aD(), v); break;
      case 0xfa: v = this.read(this.aD()); this.write(this.aD(), v); break;
      case 0xe4: this.a = this.nz(this.read(this.aD())); break;
      case 0xe5: this.a = this.nz(this.read(this.aAbs())); break;
      case 0xe6: this.a = this.nz(this.read(this.aIX())); break;
      case 0xe7: this.a = this.nz(this.read(this.aIndX())); break;
      case 0xf4: this.a = this.nz(this.read(this.aDX())); break;
      case 0xf5: this.a = this.nz(this.read(this.aAbsX())); break;
      case 0xf6: this.a = this.nz(this.read(this.aAbsY())); break;
      case 0xf7: this.a = this.nz(this.read(this.aIndY())); break;
      case 0xbf: this.a = this.nz(this.read(this.aIX())); this.x = (this.x + 1) & 0xff; break;
      case 0xf8: this.x = this.nz(this.read(this.aD())); break;
      case 0xf9: this.x = this.nz(this.read(this.aDY())); break;
      case 0xe9: this.x = this.nz(this.read(this.aAbs())); break;
      case 0xeb: this.y = this.nz(this.read(this.aD())); break;
      case 0xfb: this.y = this.nz(this.read(this.aDX())); break;
      case 0xec: this.y = this.nz(this.read(this.aAbs())); break;
      case 0xc4: this.write(this.aD(), this.a); break;
      case 0xc5: this.write(this.aAbs(), this.a); break;
      case 0xc6: this.write(this.aIX(), this.a); break;
      case 0xc7: this.write(this.aIndX(), this.a); break;
      case 0xd4: this.write(this.aDX(), this.a); break;
      case 0xd5: this.write(this.aAbsX(), this.a); break;
      case 0xd6: this.write(this.aAbsY(), this.a); break;
      case 0xd7: this.write(this.aIndY(), this.a); break;
      case 0xaf: this.write(this.aIX(), this.a); this.x = (this.x + 1) & 0xff; break;
      case 0xd8: this.write(this.aD(), this.x); break;
      case 0xd9: this.write(this.aDY(), this.x); break;
      case 0xc9: this.write(this.aAbs(), this.x); break;
      case 0xcb: this.write(this.aD(), this.y); break;
      case 0xdb: this.write(this.aDX(), this.y); break;
      case 0xcc: this.write(this.aAbs(), this.y); break;
      case 0xcf: { const r = this.y * this.a; this.a = r & 0xff; this.y = r >> 8; this.nz(this.y); break; }
      case 0x9e: {
        const ya = (this.y << 8) | this.a, x = this.x;
        this.v = this.y >= x ? 1 : 0;
        this.h = (this.y & 0xf) >= (x & 0xf) ? 1 : 0;
        if (this.y < (x << 1)) { this.a = Math.floor(ya / x); this.y = ya % x; }
        else { this.a = 255 - Math.floor((ya - (x << 9)) / (256 - x)); this.y = x + (ya - (x << 9)) % (256 - x); }
        this.a &= 0xff; this.y &= 0xff;
        this.nz(this.a);
        break;
      }
      case 0x9f: this.a = this.nz((this.a >> 4) | (this.a << 4)); break;
      case 0xdf: if (this.c || this.a > 0x99) { this.a = (this.a + 0x60) & 0xff; this.c = 1; } if (this.h || (this.a & 0xf) > 9) this.a = (this.a + 6) & 0xff; this.nz(this.a); break;
      case 0xbe: if (!this.c || this.a > 0x99) { this.a = (this.a - 0x60) & 0xff; this.c = 0; } if (!this.h || (this.a & 0xf) > 9) this.a = (this.a - 6) & 0xff; this.nz(this.a); break;
      case 0xef: case 0xff: this.stopped = true; break;
      default: throw new Error('SPC: unknown opcode ' + op.toString(16) + ' at ' + ((this.pc - 1) & 0xffff).toString(16));
    }
  }
}
