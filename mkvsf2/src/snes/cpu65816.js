// A 65C816 interpreter. Used to run the SNES games' own code (sound driver
// uploads, decompressors) and, in tools/, to trace how the games store their
// graphics. Cycle counts are approximate: good enough for frame timing.

const BASE_CYCLES = [
  7,6,7,4,5,3,5,6,3,2,2,4,6,4,6,5, 2,5,5,7,5,4,6,6,2,4,2,2,6,4,7,5,
  6,6,8,4,3,3,5,6,4,2,2,5,4,4,6,5, 2,5,5,7,4,4,6,6,2,4,2,2,4,4,7,5,
  6,6,2,4,7,3,5,6,3,2,2,3,3,4,6,5, 2,5,5,7,7,4,6,6,2,4,3,2,4,4,7,5,
  6,6,6,4,3,3,5,6,4,2,2,6,5,4,6,5, 2,5,5,7,4,4,6,6,2,4,4,2,6,4,7,5,
  3,6,4,4,3,3,3,6,2,2,2,3,4,4,4,5, 2,6,5,7,4,4,4,6,2,5,2,2,4,5,5,5,
  2,6,2,4,3,3,3,6,2,2,2,4,4,4,4,5, 2,5,5,7,4,4,4,6,2,4,2,2,4,4,4,5,
  2,6,3,4,3,3,5,6,2,2,2,3,4,4,6,5, 2,5,5,7,6,4,6,6,2,4,3,3,6,4,7,5,
  2,6,3,4,3,3,5,6,2,2,2,3,4,4,6,5, 2,5,5,7,5,4,6,6,2,4,4,2,8,4,7,5,
];

export class CPU65816 {
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.a = 0; this.x = 0; this.y = 0; this.s = 0x01ff; this.d = 0;
    this.dbr = 0; this.pbr = 0;
    this.e = 1; this.mf = 1; this.xf = 1;
    this.c = 0; this.z = 0; this.i = 1; this.dec = 0; this.v = 0; this.n = 0;
    this.waiting = false; this.stopped = false;
    this.nmiPending = false; this.irqLine = false;
    this.cycles = 0;
    this.pc = this.read16(0xfffc);
  }

  read(a) { return this.bus.read(a & 0xffffff); }
  write(a, v) { this.bus.write(a & 0xffffff, v & 0xff); }
  read16(a) { return this.read(a) | (this.read(a + 1) << 8); }
  read24(a) { return this.read(a) | (this.read(a + 1) << 8) | (this.read(a + 2) << 16); }
  // bank-0 reads that wrap within the bank (direct page, stack, pointers)
  read0(a) { return this.bus.read(a & 0xffff); }
  read0_16(a) { return this.read0(a) | (this.read0(a + 1) << 8); }

  fetch() { const v = this.read((this.pbr << 16) | this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  fetch24() { const lo = this.fetch16(); return lo | (this.fetch() << 16); }

  push(v) {
    this.bus.write(this.s, v & 0xff);
    this.s = this.e ? 0x100 | ((this.s - 1) & 0xff) : (this.s - 1) & 0xffff;
  }
  pull() {
    this.s = this.e ? 0x100 | ((this.s + 1) & 0xff) : (this.s + 1) & 0xffff;
    return this.bus.read(this.s);
  }
  push16(v) { this.push(v >> 8); this.push(v); }
  pull16() { const lo = this.pull(); return lo | (this.pull() << 8); }

  getP() {
    return (this.n << 7) | (this.v << 6) | (this.mf << 5) | (this.xf << 4) |
      (this.dec << 3) | (this.i << 2) | (this.z << 1) | this.c;
  }
  setP(p) {
    this.n = (p >> 7) & 1; this.v = (p >> 6) & 1;
    this.mf = (p >> 5) & 1; this.xf = (p >> 4) & 1;
    this.dec = (p >> 3) & 1; this.i = (p >> 2) & 1; this.z = (p >> 1) & 1; this.c = p & 1;
    if (this.e) { this.mf = 1; this.xf = 1; }
    if (this.xf) { this.x &= 0xff; this.y &= 0xff; }
  }

  // --- effective addresses -------------------------------------------------
  dp(off) { return (this.d + off) & 0xffff; }
  aDp() { return this.dp(this.fetch()); }
  aDpX() { return this.dp(this.fetch() + this.x); }
  aDpY() { return this.dp(this.fetch() + this.y); }
  aDpInd() { return (this.dbr << 16) | this.read0_16(this.aDp()); }
  aDpIndX() { return (this.dbr << 16) | this.read0_16(this.aDpX()); }
  aDpIndY() { return (((this.dbr << 16) | this.read0_16(this.aDp())) + this.y) & 0xffffff; }
  aDpIndL() { const p = this.aDp(); return this.read0_16(p) | (this.read0(p + 2) << 16); }
  aDpIndLY() { return (this.aDpIndL() + this.y) & 0xffffff; }
  aAbs() { return (this.dbr << 16) | this.fetch16(); }
  aAbsX() { return (((this.dbr << 16) | this.fetch16()) + this.x) & 0xffffff; }
  aAbsY() { return (((this.dbr << 16) | this.fetch16()) + this.y) & 0xffffff; }
  aLong() { return this.fetch24(); }
  aLongX() { return (this.fetch24() + this.x) & 0xffffff; }
  aSr() { return (this.fetch() + this.s) & 0xffff; }
  aSrIndY() { const p = this.aSr(); return (((this.dbr << 16) | this.read0_16(p)) + this.y) & 0xffffff; }

  // memory access at an effective address, sized by a flag
  rdM(a) { return this.mf ? this.read(a) : this.read(a) | (this.read(a + 1) << 8); }
  wrM(a, v) { this.write(a, v); if (!this.mf) this.write(a + 1, v >> 8); }
  rdX(a) { return this.xf ? this.read(a) : this.read(a) | (this.read(a + 1) << 8); }
  wrX(a, v) { this.write(a, v); if (!this.xf) this.write(a + 1, v >> 8); }
  immM() { return this.mf ? this.fetch() : this.fetch16(); }
  immX() { return this.xf ? this.fetch() : this.fetch16(); }

  nzM(v) { if (this.mf) { v &= 0xff; this.n = v >> 7; } else { v &= 0xffff; this.n = v >> 15; } this.z = v === 0 ? 1 : 0; return v; }
  nzX(v) { if (this.xf) { v &= 0xff; this.n = v >> 7; } else { v &= 0xffff; this.n = v >> 15; } this.z = v === 0 ? 1 : 0; return v; }

  getA() { return this.mf ? this.a & 0xff : this.a; }
  setA(v) { if (this.mf) this.a = (this.a & 0xff00) | (v & 0xff); else this.a = v & 0xffff; }

  // --- ALU -----------------------------------------------------------------
  adc(v) {
    const a = this.getA();
    let r;
    if (this.mf) {
      if (this.dec) {
        let lo = (a & 0xf) + (v & 0xf) + this.c; if (lo > 9) lo += 6;
        let hi = (a >> 4) + (v >> 4) + (lo > 0xf ? 1 : 0);
        r = (lo & 0xf) | ((hi & 0xf) << 4);
        this.v = (~(a ^ v) & (a ^ (hi << 4)) & 0x80) ? 1 : 0;
        if (hi > 9) hi += 6;
        this.c = hi > 0xf ? 1 : 0;
        r = (lo & 0xf) | ((hi & 0xf) << 4);
      } else {
        r = a + v + this.c;
        this.v = (~(a ^ v) & (a ^ r) & 0x80) ? 1 : 0;
        this.c = r > 0xff ? 1 : 0;
      }
    } else {
      if (this.dec) {
        let res = 0, c = this.c;
        for (let s = 0; s < 16; s += 4) {
          let d = ((a >> s) & 0xf) + ((v >> s) & 0xf) + c;
          if (s === 12) this.v = (~(a ^ v) & (a ^ ((d & 0xf) << 12)) & 0x8000) ? 1 : 0;
          c = 0; if (d > 9) { d += 6; c = 1; }
          res |= (d & 0xf) << s;
        }
        this.c = c; r = res;
      } else {
        r = a + v + this.c;
        this.v = (~(a ^ v) & (a ^ r) & 0x8000) ? 1 : 0;
        this.c = r > 0xffff ? 1 : 0;
      }
    }
    this.setA(this.nzM(r));
  }
  sbc(v) {
    const a = this.getA();
    if (this.dec) {
      const w = this.mf ? 8 : 16;
      let res = 0, borrow = this.c ? 0 : 1;
      for (let s = 0; s < w; s += 4) {
        let d = ((a >> s) & 0xf) - ((v >> s) & 0xf) - borrow;
        borrow = 0; if (d < 0) { d += 10; borrow = 1; }
        res |= (d & 0xf) << s;
      }
      const bin = a - v - (this.c ? 0 : 1);
      const sign = this.mf ? 0x80 : 0x8000;
      this.v = ((a ^ v) & (a ^ bin) & sign) ? 1 : 0;
      this.c = borrow ? 0 : 1;
      this.setA(this.nzM(res));
    } else {
      this.adc(this.mf ? v ^ 0xff : v ^ 0xffff);
    }
  }
  cmp(r, v, eight) {
    const t = r - v;
    this.c = t >= 0 ? 1 : 0;
    if (eight) { this.z = (t & 0xff) === 0 ? 1 : 0; this.n = (t >> 7) & 1; }
    else { this.z = (t & 0xffff) === 0 ? 1 : 0; this.n = (t >> 15) & 1; }
  }
  bit(v, imm) {
    const r = this.getA() & v;
    this.z = r === 0 ? 1 : 0;
    if (!imm) {
      if (this.mf) { this.n = (v >> 7) & 1; this.v = (v >> 6) & 1; }
      else { this.n = (v >> 15) & 1; this.v = (v >> 14) & 1; }
    }
  }
  asl(v) { const hb = this.mf ? 0x80 : 0x8000; this.c = v & hb ? 1 : 0; return this.nzM(v << 1); }
  lsr(v) { this.c = v & 1; return this.nzM(v >> 1); }
  rol(v) { const hb = this.mf ? 0x80 : 0x8000; const c = this.c; this.c = v & hb ? 1 : 0; return this.nzM((v << 1) | c); }
  ror(v) { const hb = this.mf ? 0x80 : 0x8000; const c = this.c; this.c = v & 1; return this.nzM((v >> 1) | (c ? hb : 0)); }
  rmw(a, fn) { this.wrM(a, fn.call(this, this.rdM(a))); }

  branch(cond) {
    const off = this.fetch();
    if (cond) { this.pc = (this.pc + ((off << 24) >> 24)) & 0xffff; this.cycles += 1; }
  }

  interrupt(nativeVec, emuVec, brk) {
    if (!this.e) this.push(this.pbr);
    this.push16(this.pc);
    this.push(this.e ? (this.getP() & ~0x10) | (brk ? 0x10 : 0) : this.getP());
    this.i = 1; this.dec = 0; this.pbr = 0;
    this.pc = this.read16(this.e ? emuVec : nativeVec);
    this.waiting = false;
    this.cycles += 8;
  }

  // Run one instruction (or take a pending interrupt). Returns cycles used.
  step() {
    const c0 = this.cycles;
    if (this.nmiPending) {
      this.nmiPending = false;
      this.interrupt(0xffea, 0xfffa, false);
      return this.cycles - c0;
    }
    if (this.irqLine && !this.i) {
      this.interrupt(0xffee, 0xfffe, false);
      return this.cycles - c0;
    }
    if (this.waiting) { if (this.irqLine) this.waiting = false; this.cycles += 4; return 4; }
    if (this.stopped) { this.cycles += 4; return 4; }
    const op = this.fetch();
    this.cycles += BASE_CYCLES[op] + (this.mf ? 0 : 1);
    this.exec(op);
    return this.cycles - c0;
  }

  exec(op) {
    let a, v, t;
    switch (op) {
      // ORA
      case 0x09: this.setA(this.nzM(this.getA() | this.immM())); break;
      case 0x05: this.setA(this.nzM(this.getA() | this.rdM(this.aDp()))); break;
      case 0x15: this.setA(this.nzM(this.getA() | this.rdM(this.aDpX()))); break;
      case 0x12: this.setA(this.nzM(this.getA() | this.rdM(this.aDpInd()))); break;
      case 0x01: this.setA(this.nzM(this.getA() | this.rdM(this.aDpIndX()))); break;
      case 0x11: this.setA(this.nzM(this.getA() | this.rdM(this.aDpIndY()))); break;
      case 0x07: this.setA(this.nzM(this.getA() | this.rdM(this.aDpIndL()))); break;
      case 0x17: this.setA(this.nzM(this.getA() | this.rdM(this.aDpIndLY()))); break;
      case 0x0d: this.setA(this.nzM(this.getA() | this.rdM(this.aAbs()))); break;
      case 0x1d: this.setA(this.nzM(this.getA() | this.rdM(this.aAbsX()))); break;
      case 0x19: this.setA(this.nzM(this.getA() | this.rdM(this.aAbsY()))); break;
      case 0x0f: this.setA(this.nzM(this.getA() | this.rdM(this.aLong()))); break;
      case 0x1f: this.setA(this.nzM(this.getA() | this.rdM(this.aLongX()))); break;
      case 0x03: this.setA(this.nzM(this.getA() | this.rdM(this.aSr()))); break;
      case 0x13: this.setA(this.nzM(this.getA() | this.rdM(this.aSrIndY()))); break;
      // AND
      case 0x29: this.setA(this.nzM(this.getA() & this.immM())); break;
      case 0x25: this.setA(this.nzM(this.getA() & this.rdM(this.aDp()))); break;
      case 0x35: this.setA(this.nzM(this.getA() & this.rdM(this.aDpX()))); break;
      case 0x32: this.setA(this.nzM(this.getA() & this.rdM(this.aDpInd()))); break;
      case 0x21: this.setA(this.nzM(this.getA() & this.rdM(this.aDpIndX()))); break;
      case 0x31: this.setA(this.nzM(this.getA() & this.rdM(this.aDpIndY()))); break;
      case 0x27: this.setA(this.nzM(this.getA() & this.rdM(this.aDpIndL()))); break;
      case 0x37: this.setA(this.nzM(this.getA() & this.rdM(this.aDpIndLY()))); break;
      case 0x2d: this.setA(this.nzM(this.getA() & this.rdM(this.aAbs()))); break;
      case 0x3d: this.setA(this.nzM(this.getA() & this.rdM(this.aAbsX()))); break;
      case 0x39: this.setA(this.nzM(this.getA() & this.rdM(this.aAbsY()))); break;
      case 0x2f: this.setA(this.nzM(this.getA() & this.rdM(this.aLong()))); break;
      case 0x3f: this.setA(this.nzM(this.getA() & this.rdM(this.aLongX()))); break;
      case 0x23: this.setA(this.nzM(this.getA() & this.rdM(this.aSr()))); break;
      case 0x33: this.setA(this.nzM(this.getA() & this.rdM(this.aSrIndY()))); break;
      // EOR
      case 0x49: this.setA(this.nzM(this.getA() ^ this.immM())); break;
      case 0x45: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDp()))); break;
      case 0x55: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDpX()))); break;
      case 0x52: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDpInd()))); break;
      case 0x41: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDpIndX()))); break;
      case 0x51: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDpIndY()))); break;
      case 0x47: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDpIndL()))); break;
      case 0x57: this.setA(this.nzM(this.getA() ^ this.rdM(this.aDpIndLY()))); break;
      case 0x4d: this.setA(this.nzM(this.getA() ^ this.rdM(this.aAbs()))); break;
      case 0x5d: this.setA(this.nzM(this.getA() ^ this.rdM(this.aAbsX()))); break;
      case 0x59: this.setA(this.nzM(this.getA() ^ this.rdM(this.aAbsY()))); break;
      case 0x4f: this.setA(this.nzM(this.getA() ^ this.rdM(this.aLong()))); break;
      case 0x5f: this.setA(this.nzM(this.getA() ^ this.rdM(this.aLongX()))); break;
      case 0x43: this.setA(this.nzM(this.getA() ^ this.rdM(this.aSr()))); break;
      case 0x53: this.setA(this.nzM(this.getA() ^ this.rdM(this.aSrIndY()))); break;
      // ADC
      case 0x69: this.adc(this.immM()); break;
      case 0x65: this.adc(this.rdM(this.aDp())); break;
      case 0x75: this.adc(this.rdM(this.aDpX())); break;
      case 0x72: this.adc(this.rdM(this.aDpInd())); break;
      case 0x61: this.adc(this.rdM(this.aDpIndX())); break;
      case 0x71: this.adc(this.rdM(this.aDpIndY())); break;
      case 0x67: this.adc(this.rdM(this.aDpIndL())); break;
      case 0x77: this.adc(this.rdM(this.aDpIndLY())); break;
      case 0x6d: this.adc(this.rdM(this.aAbs())); break;
      case 0x7d: this.adc(this.rdM(this.aAbsX())); break;
      case 0x79: this.adc(this.rdM(this.aAbsY())); break;
      case 0x6f: this.adc(this.rdM(this.aLong())); break;
      case 0x7f: this.adc(this.rdM(this.aLongX())); break;
      case 0x63: this.adc(this.rdM(this.aSr())); break;
      case 0x73: this.adc(this.rdM(this.aSrIndY())); break;
      // SBC
      case 0xe9: this.sbc(this.immM()); break;
      case 0xe5: this.sbc(this.rdM(this.aDp())); break;
      case 0xf5: this.sbc(this.rdM(this.aDpX())); break;
      case 0xf2: this.sbc(this.rdM(this.aDpInd())); break;
      case 0xe1: this.sbc(this.rdM(this.aDpIndX())); break;
      case 0xf1: this.sbc(this.rdM(this.aDpIndY())); break;
      case 0xe7: this.sbc(this.rdM(this.aDpIndL())); break;
      case 0xf7: this.sbc(this.rdM(this.aDpIndLY())); break;
      case 0xed: this.sbc(this.rdM(this.aAbs())); break;
      case 0xfd: this.sbc(this.rdM(this.aAbsX())); break;
      case 0xf9: this.sbc(this.rdM(this.aAbsY())); break;
      case 0xef: this.sbc(this.rdM(this.aLong())); break;
      case 0xff: this.sbc(this.rdM(this.aLongX())); break;
      case 0xe3: this.sbc(this.rdM(this.aSr())); break;
      case 0xf3: this.sbc(this.rdM(this.aSrIndY())); break;
      // CMP
      case 0xc9: this.cmp(this.getA(), this.immM(), this.mf); break;
      case 0xc5: this.cmp(this.getA(), this.rdM(this.aDp()), this.mf); break;
      case 0xd5: this.cmp(this.getA(), this.rdM(this.aDpX()), this.mf); break;
      case 0xd2: this.cmp(this.getA(), this.rdM(this.aDpInd()), this.mf); break;
      case 0xc1: this.cmp(this.getA(), this.rdM(this.aDpIndX()), this.mf); break;
      case 0xd1: this.cmp(this.getA(), this.rdM(this.aDpIndY()), this.mf); break;
      case 0xc7: this.cmp(this.getA(), this.rdM(this.aDpIndL()), this.mf); break;
      case 0xd7: this.cmp(this.getA(), this.rdM(this.aDpIndLY()), this.mf); break;
      case 0xcd: this.cmp(this.getA(), this.rdM(this.aAbs()), this.mf); break;
      case 0xdd: this.cmp(this.getA(), this.rdM(this.aAbsX()), this.mf); break;
      case 0xd9: this.cmp(this.getA(), this.rdM(this.aAbsY()), this.mf); break;
      case 0xcf: this.cmp(this.getA(), this.rdM(this.aLong()), this.mf); break;
      case 0xdf: this.cmp(this.getA(), this.rdM(this.aLongX()), this.mf); break;
      case 0xc3: this.cmp(this.getA(), this.rdM(this.aSr()), this.mf); break;
      case 0xd3: this.cmp(this.getA(), this.rdM(this.aSrIndY()), this.mf); break;
      // CPX / CPY
      case 0xe0: this.cmp(this.x, this.immX(), this.xf); break;
      case 0xe4: this.cmp(this.x, this.rdX(this.aDp()), this.xf); break;
      case 0xec: this.cmp(this.x, this.rdX(this.aAbs()), this.xf); break;
      case 0xc0: this.cmp(this.y, this.immX(), this.xf); break;
      case 0xc4: this.cmp(this.y, this.rdX(this.aDp()), this.xf); break;
      case 0xcc: this.cmp(this.y, this.rdX(this.aAbs()), this.xf); break;
      // BIT
      case 0x89: this.bit(this.immM(), true); break;
      case 0x24: this.bit(this.rdM(this.aDp()), false); break;
      case 0x34: this.bit(this.rdM(this.aDpX()), false); break;
      case 0x2c: this.bit(this.rdM(this.aAbs()), false); break;
      case 0x3c: this.bit(this.rdM(this.aAbsX()), false); break;
      // LDA
      case 0xa9: this.setA(this.nzM(this.immM())); break;
      case 0xa5: this.setA(this.nzM(this.rdM(this.aDp()))); break;
      case 0xb5: this.setA(this.nzM(this.rdM(this.aDpX()))); break;
      case 0xb2: this.setA(this.nzM(this.rdM(this.aDpInd()))); break;
      case 0xa1: this.setA(this.nzM(this.rdM(this.aDpIndX()))); break;
      case 0xb1: this.setA(this.nzM(this.rdM(this.aDpIndY()))); break;
      case 0xa7: this.setA(this.nzM(this.rdM(this.aDpIndL()))); break;
      case 0xb7: this.setA(this.nzM(this.rdM(this.aDpIndLY()))); break;
      case 0xad: this.setA(this.nzM(this.rdM(this.aAbs()))); break;
      case 0xbd: this.setA(this.nzM(this.rdM(this.aAbsX()))); break;
      case 0xb9: this.setA(this.nzM(this.rdM(this.aAbsY()))); break;
      case 0xaf: this.setA(this.nzM(this.rdM(this.aLong()))); break;
      case 0xbf: this.setA(this.nzM(this.rdM(this.aLongX()))); break;
      case 0xa3: this.setA(this.nzM(this.rdM(this.aSr()))); break;
      case 0xb3: this.setA(this.nzM(this.rdM(this.aSrIndY()))); break;
      // LDX / LDY
      case 0xa2: this.x = this.nzX(this.immX()); break;
      case 0xa6: this.x = this.nzX(this.rdX(this.aDp())); break;
      case 0xb6: this.x = this.nzX(this.rdX(this.aDpY())); break;
      case 0xae: this.x = this.nzX(this.rdX(this.aAbs())); break;
      case 0xbe: this.x = this.nzX(this.rdX(this.aAbsY())); break;
      case 0xa0: this.y = this.nzX(this.immX()); break;
      case 0xa4: this.y = this.nzX(this.rdX(this.aDp())); break;
      case 0xb4: this.y = this.nzX(this.rdX(this.aDpX())); break;
      case 0xac: this.y = this.nzX(this.rdX(this.aAbs())); break;
      case 0xbc: this.y = this.nzX(this.rdX(this.aAbsX())); break;
      // STA
      case 0x85: this.wrM(this.aDp(), this.a); break;
      case 0x95: this.wrM(this.aDpX(), this.a); break;
      case 0x92: this.wrM(this.aDpInd(), this.a); break;
      case 0x81: this.wrM(this.aDpIndX(), this.a); break;
      case 0x91: this.wrM(this.aDpIndY(), this.a); break;
      case 0x87: this.wrM(this.aDpIndL(), this.a); break;
      case 0x97: this.wrM(this.aDpIndLY(), this.a); break;
      case 0x8d: this.wrM(this.aAbs(), this.a); break;
      case 0x9d: this.wrM(this.aAbsX(), this.a); break;
      case 0x99: this.wrM(this.aAbsY(), this.a); break;
      case 0x8f: this.wrM(this.aLong(), this.a); break;
      case 0x9f: this.wrM(this.aLongX(), this.a); break;
      case 0x83: this.wrM(this.aSr(), this.a); break;
      case 0x93: this.wrM(this.aSrIndY(), this.a); break;
      // STX / STY / STZ
      case 0x86: this.wrX(this.aDp(), this.x); break;
      case 0x96: this.wrX(this.aDpY(), this.x); break;
      case 0x8e: this.wrX(this.aAbs(), this.x); break;
      case 0x84: this.wrX(this.aDp(), this.y); break;
      case 0x94: this.wrX(this.aDpX(), this.y); break;
      case 0x8c: this.wrX(this.aAbs(), this.y); break;
      case 0x64: this.wrM(this.aDp(), 0); break;
      case 0x74: this.wrM(this.aDpX(), 0); break;
      case 0x9c: this.wrM(this.aAbs(), 0); break;
      case 0x9e: this.wrM(this.aAbsX(), 0); break;
      // shifts
      case 0x0a: this.setA(this.asl(this.getA())); break;
      case 0x06: this.rmw(this.aDp(), this.asl); break;
      case 0x16: this.rmw(this.aDpX(), this.asl); break;
      case 0x0e: this.rmw(this.aAbs(), this.asl); break;
      case 0x1e: this.rmw(this.aAbsX(), this.asl); break;
      case 0x4a: this.setA(this.lsr(this.getA())); break;
      case 0x46: this.rmw(this.aDp(), this.lsr); break;
      case 0x56: this.rmw(this.aDpX(), this.lsr); break;
      case 0x4e: this.rmw(this.aAbs(), this.lsr); break;
      case 0x5e: this.rmw(this.aAbsX(), this.lsr); break;
      case 0x2a: this.setA(this.rol(this.getA())); break;
      case 0x26: this.rmw(this.aDp(), this.rol); break;
      case 0x36: this.rmw(this.aDpX(), this.rol); break;
      case 0x2e: this.rmw(this.aAbs(), this.rol); break;
      case 0x3e: this.rmw(this.aAbsX(), this.rol); break;
      case 0x6a: this.setA(this.ror(this.getA())); break;
      case 0x66: this.rmw(this.aDp(), this.ror); break;
      case 0x76: this.rmw(this.aDpX(), this.ror); break;
      case 0x6e: this.rmw(this.aAbs(), this.ror); break;
      case 0x7e: this.rmw(this.aAbsX(), this.ror); break;
      // INC / DEC
      case 0x1a: this.setA(this.nzM(this.getA() + 1)); break;
      case 0x3a: this.setA(this.nzM(this.getA() - 1)); break;
      case 0xe6: this.rmw(this.aDp(), v => this.nzM(v + 1)); break;
      case 0xf6: this.rmw(this.aDpX(), v => this.nzM(v + 1)); break;
      case 0xee: this.rmw(this.aAbs(), v => this.nzM(v + 1)); break;
      case 0xfe: this.rmw(this.aAbsX(), v => this.nzM(v + 1)); break;
      case 0xc6: this.rmw(this.aDp(), v => this.nzM(v - 1)); break;
      case 0xd6: this.rmw(this.aDpX(), v => this.nzM(v - 1)); break;
      case 0xce: this.rmw(this.aAbs(), v => this.nzM(v - 1)); break;
      case 0xde: this.rmw(this.aAbsX(), v => this.nzM(v - 1)); break;
      case 0xe8: this.x = this.nzX(this.x + 1); break;
      case 0xc8: this.y = this.nzX(this.y + 1); break;
      case 0xca: this.x = this.nzX(this.x - 1); break;
      case 0x88: this.y = this.nzX(this.y - 1); break;
      // TSB / TRB
      case 0x04: a = this.aDp(); v = this.rdM(a); this.z = (v & this.getA()) === 0 ? 1 : 0; this.wrM(a, v | this.getA()); break;
      case 0x0c: a = this.aAbs(); v = this.rdM(a); this.z = (v & this.getA()) === 0 ? 1 : 0; this.wrM(a, v | this.getA()); break;
      case 0x14: a = this.aDp(); v = this.rdM(a); this.z = (v & this.getA()) === 0 ? 1 : 0; this.wrM(a, v & ~this.getA()); break;
      case 0x1c: a = this.aAbs(); v = this.rdM(a); this.z = (v & this.getA()) === 0 ? 1 : 0; this.wrM(a, v & ~this.getA()); break;
      // transfers
      case 0xaa: this.x = this.nzX(this.xf ? this.a & 0xff : this.a); break;
      case 0xa8: this.y = this.nzX(this.xf ? this.a & 0xff : this.a); break;
      case 0x8a: this.setA(this.nzM(this.x)); break;
      case 0x98: this.setA(this.nzM(this.y)); break;
      case 0x9b: this.y = this.nzX(this.x); break;
      case 0xbb: this.x = this.nzX(this.y); break;
      case 0xba: this.x = this.nzX(this.s); break;
      case 0x9a: this.s = this.e ? 0x100 | (this.x & 0xff) : this.x; break;
      case 0x5b: this.d = this.a; this.nz16(this.d); break;
      case 0x7b: this.a = this.d; this.nz16(this.a); break;
      case 0x1b: this.s = this.e ? 0x100 | (this.a & 0xff) : this.a; break;
      case 0x3b: this.a = this.s; this.nz16(this.a); break;
      case 0xeb: t = this.a; this.a = ((t >> 8) | (t << 8)) & 0xffff; this.n = (this.a >> 7) & 1; this.z = (this.a & 0xff) === 0 ? 1 : 0; break;
      case 0xfb: t = this.c; this.c = this.e; this.e = t;
        if (this.e) { this.mf = 1; this.xf = 1; this.x &= 0xff; this.y &= 0xff; this.s = 0x100 | (this.s & 0xff); }
        break;
      // stack
      case 0x48: if (this.mf) this.push(this.a); else this.push16(this.a); break;
      case 0x68: if (this.mf) this.setA(this.nzM(this.pull())); else this.a = this.nzM(this.pull16()); break;
      case 0xda: if (this.xf) this.push(this.x); else this.push16(this.x); break;
      case 0xfa: this.x = this.nzX(this.xf ? this.pull() : this.pull16()); break;
      case 0x5a: if (this.xf) this.push(this.y); else this.push16(this.y); break;
      case 0x7a: this.y = this.nzX(this.xf ? this.pull() : this.pull16()); break;
      case 0x08: this.push(this.getP() | (this.e ? 0x30 : 0)); break;
      case 0x28: this.setP(this.pull()); break;
      case 0x8b: this.push(this.dbr); break;
      case 0xab: this.dbr = this.pull(); this.n = this.dbr >> 7; this.z = this.dbr === 0 ? 1 : 0; break;
      case 0x0b: this.push16(this.d); break;
      case 0x2b: this.d = this.pull16(); this.nz16(this.d); break;
      case 0x4b: this.push(this.pbr); break;
      case 0xf4: this.push16(this.fetch16()); break;
      case 0xd4: this.push16(this.read0_16(this.aDp())); break;
      case 0x62: t = this.fetch16(); this.push16((this.pc + t) & 0xffff); break;
      // flags
      case 0x18: this.c = 0; break;
      case 0x38: this.c = 1; break;
      case 0x58: this.i = 0; break;
      case 0x78: this.i = 1; break;
      case 0xb8: this.v = 0; break;
      case 0xd8: this.dec = 0; break;
      case 0xf8: this.dec = 1; break;
      case 0xc2: this.setP(this.getP() & ~this.fetch()); break;
      case 0xe2: this.setP(this.getP() | this.fetch()); break;
      // branches
      case 0x10: this.branch(!this.n); break;
      case 0x30: this.branch(this.n); break;
      case 0x50: this.branch(!this.v); break;
      case 0x70: this.branch(this.v); break;
      case 0x90: this.branch(!this.c); break;
      case 0xb0: this.branch(this.c); break;
      case 0xd0: this.branch(!this.z); break;
      case 0xf0: this.branch(this.z); break;
      case 0x80: this.branch(true); break;
      case 0x82: t = this.fetch16(); this.pc = (this.pc + t) & 0xffff; break;
      // jumps
      case 0x4c: this.pc = this.fetch16(); break;
      case 0x5c: t = this.fetch24(); this.pc = t & 0xffff; this.pbr = t >> 16; break;
      case 0x6c: this.pc = this.read0_16(this.fetch16()); break;
      case 0x7c: t = this.fetch16(); this.pc = this.read16((this.pbr << 16) | ((t + this.x) & 0xffff)); break;
      case 0xdc: t = this.fetch16(); this.pc = this.read0_16(t); this.pbr = this.read0(t + 2); break;
      case 0x20: t = this.fetch16(); this.push16((this.pc - 1) & 0xffff); this.pc = t; break;
      case 0xfc: t = this.fetch16(); this.push16((this.pc - 1) & 0xffff); this.pc = this.read16((this.pbr << 16) | ((t + this.x) & 0xffff)); break;
      case 0x22: t = this.fetch24(); this.push(this.pbr); this.push16((this.pc - 1) & 0xffff); this.pc = t & 0xffff; this.pbr = t >> 16; break;
      case 0x60: this.pc = (this.pull16() + 1) & 0xffff; break;
      case 0x6b: this.pc = (this.pull16() + 1) & 0xffff; this.pbr = this.pull(); break;
      case 0x40: this.setP(this.pull()); this.pc = this.pull16(); if (!this.e) this.pbr = this.pull(); break;
      case 0x00: this.fetch(); this.interrupt(0xffe6, 0xfffe, true); break;
      case 0x02: this.fetch(); this.interrupt(0xffe4, 0xfff4, false); break;
      // block moves
      case 0x54: case 0x44: {
        const dst = this.fetch(), src = this.fetch();
        this.dbr = dst;
        const step = op === 0x54 ? 1 : -1;
        this.write((dst << 16) | this.y, this.read((src << 16) | this.x));
        const m = this.xf ? 0xff : 0xffff;
        this.x = (this.x + step) & m; this.y = (this.y + step) & m;
        this.a = (this.a - 1) & 0xffff;
        if (this.a !== 0xffff) this.pc = (this.pc - 3) & 0xffff;
        break;
      }
      case 0xcb: this.waiting = true; break;
      case 0xdb: this.stopped = true; break;
      case 0xea: break;
      case 0x42: this.fetch(); break; // WDM
      default: throw new Error('unknown opcode ' + op.toString(16));
    }
  }
  nz16(v) { this.n = (v >> 15) & 1; this.z = (v & 0xffff) === 0 ? 1 : 0; }
}
