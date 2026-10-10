// A small SNES: 65816 + LoROM memory map + DMA + PPU register/VRAM state +
// SPC700. Timing is per scanline and approximate. There is a simple PPU
// renderer (renderFrame) for development snapshots; the game itself does
// not use it.

import { CPU65816 } from './cpu65816.js';
import { SPC700 } from './spc700.js';

const LINES = 262, VBLANK_LINE = 225;
const CPU_CYCLES_PER_LINE = 190;
const SPC_PER_CPU = 65.2 / CPU_CYCLES_PER_LINE;

export class SNES {
  constructor(rom) {
    this.rom = rom;
    this.romMask = rom.length - 1;
    this.wram = new Uint8Array(0x20000);
    this.vram = new Uint16Array(0x8000);
    this.cgram = new Uint16Array(256);
    this.oam = new Uint8Array(544);
    this.ppu = new Uint8Array(0x40);          // last written values of $2100-$213F
    this.scroll = new Uint16Array(8);          // BG1H,BG1V,...,BG4V
    this.scrollLatch = 0;
    this.m7 = new Int16Array(6); this.m7latch = 0;
    this.vmain = 0; this.vaddr = 0; this.vprefetch = 0;
    this.cgaddr = 0; this.cglatch = -1;
    this.oamaddr = 0; this.oamlatch = 0;
    this.dma = new Uint8Array(0x80);
    this.nmitimen = 0; this.htime = 0x1ff; this.vtime = 0x1ff;
    this.wrmpya = 0xff; this.wrdiv = 0xffff; this.rddiv = 0; this.rdmpy = 0;
    this.wramAddr = 0;
    this.nmiFlag = 0; this.timeup = 0;
    this.joy = [0, 0];
    this.line = 0; this.lineCycle = 0;
    this.latchH = 0; this.latchV = 0; this.hvFlipH = 0; this.hvFlipV = 0;
    this.frameCount = 0;
    this.spc = new SPC700();
    this.spcDebt = 0;
    this.cpu = new CPU65816(this);
    // optional instrumentation
    this.onDma = null;      // fn(channel info) for every DMA
    this.onRead = null;     // fn(addr, value) for ROM reads
    this.onWrite = null;    // fn(addr, value) for every bus write
  }

  // --- bus -----------------------------------------------------------------
  read(addr) {
    const bank = addr >> 16, off = addr & 0xffff;
    if (bank === 0x7e || bank === 0x7f) return this.wram[addr & 0x1ffff];
    if ((bank & 0x7f) < 0x40) {
      if (off < 0x2000) return this.wram[off];
      if (off >= 0x8000) return this.romRead(addr);
      if (off >= 0x2100 && off < 0x2200) return this.readB(off & 0xff);
      if (off >= 0x4000 && off < 0x4400) return this.readCpuReg(off);
      return 0;
    }
    if ((bank & 0x7f) >= 0x70 && off < 0x8000) return 0;
    return this.romRead(addr);
  }
  romRead(addr) {
    const i = (((addr >> 16) & 0x7f) << 15 | (addr & 0x7fff)) & this.romMask;
    const v = this.rom[i];
    if (this.onRead) this.onRead(i, v);
    return v;
  }
  write(addr, v) {
    if (this.onWrite) this.onWrite(addr, v);
    const bank = addr >> 16, off = addr & 0xffff;
    if (bank === 0x7e || bank === 0x7f) { this.wram[addr & 0x1ffff] = v; return; }
    if ((bank & 0x7f) < 0x40) {
      if (off < 0x2000) { this.wram[off] = v; return; }
      if (off >= 0x2100 && off < 0x2200) { this.writeB(off & 0xff, v); return; }
      if (off >= 0x4000 && off < 0x4400) { this.writeCpuReg(off, v); return; }
    }
  }

  syncSpc() {
    const target = this.cpu.cycles * SPC_PER_CPU;
    const d = Math.floor(target - this.spc.cycles);
    if (d > 0) this.spc.run(d);
  }

  // B-bus ($21xx)
  readB(r) {
    if (r >= 0x40 && r < 0x80) { this.syncSpc(); return this.spc.outPorts[r & 3]; }
    switch (r) {
      case 0x80: { const v = this.wram[this.wramAddr]; this.wramAddr = (this.wramAddr + 1) & 0x1ffff; return v; }
      case 0x34: return this.rdmpy & 0xff;
      case 0x35: return (this.rdmpy >> 8) & 0xff;
      case 0x36: return (this.rdmpy >> 16) & 0xff;
      case 0x37: this.latchV = this.line; this.latchH = Math.floor(this.lineCycle * 340 / CPU_CYCLES_PER_LINE); return 0;
      case 0x38: { const v = this.oam[this.oamaddr % 544]; this.oamaddr = (this.oamaddr + 1) % 544; return v; }
      case 0x39: { const v = this.vprefetch & 0xff; if (!(this.vmain & 0x80)) this.vramInc(true); return v; }
      case 0x3a: { const v = this.vprefetch >> 8; if (this.vmain & 0x80) this.vramInc(true); return v; }
      case 0x3b: { const w = this.cgram[this.cgaddr >> 1]; const v = this.cgaddr & 1 ? w >> 8 : w & 0xff; this.cgaddr = (this.cgaddr + 1) & 0x1ff; return v; }
      case 0x3c: { const v = this.hvFlipH ? (this.latchH >> 8) & 1 : this.latchH & 0xff; this.hvFlipH ^= 1; return v; }
      case 0x3d: { const v = this.hvFlipV ? (this.latchV >> 8) & 1 : this.latchV & 0xff; this.hvFlipV ^= 1; return v; }
      case 0x3e: return 0x01;
      case 0x3f: this.hvFlipH = 0; this.hvFlipV = 0; return 0x03;
    }
    return 0;
  }
  vramAddrRemap(a) {
    switch ((this.vmain >> 2) & 3) {
      case 0: return a;
      case 1: return (a & 0xff00) | ((a & 0x1f) << 3) | ((a >> 5) & 7);
      case 2: return (a & 0xfe00) | ((a & 0x3f) << 3) | ((a >> 6) & 7);
      case 3: return (a & 0xfc00) | ((a & 0x7f) << 3) | ((a >> 7) & 7);
    }
  }
  vramInc(prefetch) {
    if (prefetch) this.vprefetch = this.vram[this.vramAddrRemap(this.vaddr) & 0x7fff];
    const inc = [1, 32, 128, 128][this.vmain & 3];
    this.vaddr = (this.vaddr + inc) & 0xffff;
  }
  writeB(r, v) {
    if (r < 0x40) this.ppu[r] = v;
    if (r >= 0x40 && r < 0x80) { this.syncSpc(); this.spc.inPorts[r & 3] = v; return; }
    switch (r) {
      case 0x02: this.oamaddr = ((this.ppu[0x03] & 1) << 9) | (v << 1); break;
      case 0x03: this.oamaddr = ((v & 1) << 9) | (this.ppu[0x02] << 1); break;
      case 0x04:
        if (this.oamaddr >= 512) this.oam[this.oamaddr & 0x21f] = v;
        else if (this.oamaddr & 1) { this.oam[this.oamaddr - 1] = this.oamlatch; this.oam[this.oamaddr] = v; }
        else this.oamlatch = v;
        this.oamaddr = (this.oamaddr + 1) % 544;
        break;
      case 0x0d: case 0x0e: case 0x0f: case 0x10: case 0x11: case 0x12: case 0x13: case 0x14:
        this.scroll[r - 0x0d] = ((v << 8) | this.scrollLatch) & 0x3ff; this.scrollLatch = v;
        if (r === 0x0d) this.m7[4] = ((v << 8) | this.m7latch) << 3 >> 3;
        if (r === 0x0e) this.m7[5] = ((v << 8) | this.m7latch) << 3 >> 3;
        if (r <= 0x0e) this.m7latch = v;
        break;
      case 0x15: this.vmain = v; break;
      case 0x16: this.vaddr = (this.vaddr & 0xff00) | v; this.vprefetch = this.vram[this.vramAddrRemap(this.vaddr) & 0x7fff]; break;
      case 0x17: this.vaddr = (this.vaddr & 0x00ff) | (v << 8); this.vprefetch = this.vram[this.vramAddrRemap(this.vaddr) & 0x7fff]; break;
      case 0x18: { const a = this.vramAddrRemap(this.vaddr) & 0x7fff; this.vram[a] = (this.vram[a] & 0xff00) | v; if (!(this.vmain & 0x80)) this.vramInc(false); break; }
      case 0x19: { const a = this.vramAddrRemap(this.vaddr) & 0x7fff; this.vram[a] = (this.vram[a] & 0x00ff) | (v << 8); if (this.vmain & 0x80) this.vramInc(false); break; }
      case 0x1b: case 0x1c: case 0x1d: case 0x1e: case 0x1f: case 0x20:
        this.m7[r - 0x1b] = (v << 8) | this.m7latch; this.m7latch = v;
        if (r === 0x1c) this.rdmpy = (this.m7[0] * ((v << 24) >> 24)) & 0xffffff;
        break;
      case 0x21: this.cgaddr = v << 1; break;
      case 0x22:
        if (!(this.cgaddr & 1)) this.cglatch = v;
        else this.cgram[this.cgaddr >> 1] = ((v & 0x7f) << 8) | this.cglatch;
        this.cgaddr = (this.cgaddr + 1) & 0x1ff;
        break;
      case 0x80: this.wram[this.wramAddr] = v; this.wramAddr = (this.wramAddr + 1) & 0x1ffff; break;
      case 0x81: this.wramAddr = (this.wramAddr & 0x1ff00) | v; break;
      case 0x82: this.wramAddr = (this.wramAddr & 0x100ff) | (v << 8); break;
      case 0x83: this.wramAddr = (this.wramAddr & 0x0ffff) | ((v & 1) << 16); break;
    }
  }

  readCpuReg(off) {
    if (off >= 0x4300 && off < 0x4380) return this.dma[off - 0x4300];
    switch (off) {
      case 0x4016: case 0x4017: return 0;
      case 0x4210: { const v = (this.nmiFlag << 7) | 0x02; this.nmiFlag = 0; return v; }
      case 0x4211: { const v = this.timeup << 7; this.timeup = 0; this.cpu.irqLine = false; return v; }
      case 0x4212: {
        const vbl = this.line >= VBLANK_LINE ? 0x80 : 0;
        const hbl = this.lineCycle > CPU_CYCLES_PER_LINE * 0.8 ? 0x40 : 0;
        return vbl | hbl;
      }
      case 0x4213: return 0xff;
      case 0x4214: return this.rddiv & 0xff;
      case 0x4215: return this.rddiv >> 8;
      case 0x4216: return this.rdmpy & 0xff;
      case 0x4217: return (this.rdmpy >> 8) & 0xff;
      case 0x4218: return this.joy[0] & 0xff;
      case 0x4219: return this.joy[0] >> 8;
      case 0x421a: return this.joy[1] & 0xff;
      case 0x421b: return this.joy[1] >> 8;
      case 0x421c: case 0x421d: case 0x421e: case 0x421f: return 0;
    }
    return 0;
  }
  writeCpuReg(off, v) {
    if (off >= 0x4300 && off < 0x4380) { this.dma[off - 0x4300] = v; return; }
    switch (off) {
      case 0x4200:
        if ((v & 0x80) && !(this.nmitimen & 0x80) && this.nmiFlag) this.cpu.nmiPending = true;
        this.nmitimen = v;
        if (!(v & 0x30)) { this.cpu.irqLine = false; this.timeup = 0; }
        break;
      case 0x4202: this.wrmpya = v; break;
      case 0x4203: this.rdmpy = this.wrmpya * v; this.rddiv = v; break;
      case 0x4204: this.wrdiv = (this.wrdiv & 0xff00) | v; break;
      case 0x4205: this.wrdiv = (this.wrdiv & 0x00ff) | (v << 8); break;
      case 0x4206:
        if (v === 0) { this.rddiv = 0xffff; this.rdmpy = this.wrdiv; }
        else { this.rddiv = Math.floor(this.wrdiv / v); this.rdmpy = this.wrdiv % v; }
        break;
      case 0x4207: this.htime = (this.htime & 0x100) | v; break;
      case 0x4208: this.htime = (this.htime & 0xff) | ((v & 1) << 8); break;
      case 0x4209: this.vtime = (this.vtime & 0x100) | v; break;
      case 0x420a: this.vtime = (this.vtime & 0xff) | ((v & 1) << 8); break;
      case 0x420b: for (let c = 0; c < 8; c++) if (v & (1 << c)) this.runDma(c); break;
      case 0x420c: this.hdmaen = v; break;
    }
  }

  runDma(c) {
    const r = this.dma, b = c << 4;
    const ctrl = r[b], bAddr = r[b + 1];
    let aAddr = r[b + 2] | (r[b + 3] << 8);
    const aBank = r[b + 4];
    let count = r[b + 5] | (r[b + 6] << 8);
    if (count === 0) count = 0x10000;
    const toA = (ctrl & 0x80) !== 0;
    const step = (ctrl & 0x08) ? 0 : (ctrl & 0x10) ? -1 : 1;
    const pattern = [[0], [0, 1], [0, 0], [0, 0, 1, 1], [0, 1, 2, 3], [0, 1, 0, 1], [0, 0], [0, 0, 1, 1]][ctrl & 7];
    if (this.onDma) this.onDma({ channel: c, ctrl, bAddr, src: (aBank << 16) | aAddr, count, vaddr: this.vaddr, cgaddr: this.cgaddr, oamaddr: this.oamaddr });
    let i = 0;
    while (count > 0) {
      const ba = (bAddr + pattern[i % pattern.length]) & 0xff;
      const full = (aBank << 16) | aAddr;
      if (toA) this.write(full, this.readB(ba));
      else this.writeB(ba, this.read(full));
      aAddr = (aAddr + step) & 0xffff;
      count--; i++;
    }
    r[b + 2] = aAddr & 0xff; r[b + 3] = aAddr >> 8;
    r[b + 5] = 0; r[b + 6] = 0;
    this.cpu.cycles += i; // DMA steals time
  }

  // --- timing --------------------------------------------------------------
  runLine() {
    const cpu = this.cpu;
    const vIrq = (this.nmitimen & 0x20) && this.line === this.vtime;
    const hIrqEnabled = (this.nmitimen & 0x10) !== 0;
    if (hIrqEnabled ? (!(this.nmitimen & 0x20) || vIrq) : vIrq) {
      if (!hIrqEnabled) { this.timeup = 1; cpu.irqLine = true; }
    }
    const hAt = hIrqEnabled && (!(this.nmitimen & 0x20) || vIrq) ? Math.min(CPU_CYCLES_PER_LINE - 1, Math.floor(this.htime * CPU_CYCLES_PER_LINE / 340)) : -1;
    const start = cpu.cycles;
    let hFired = false;
    while ((this.lineCycle = cpu.cycles - start) < CPU_CYCLES_PER_LINE) {
      if (hAt >= 0 && !hFired && this.lineCycle >= hAt) { hFired = true; this.timeup = 1; cpu.irqLine = true; }
      cpu.step();
    }
    this.line++;
    if (this.line === 112) { this.ppuMid = this.ppu.slice(); this.scrollMid = this.scroll.slice(); }
    if (this.line === VBLANK_LINE) {
      this.nmiFlag = 1;
      if (this.nmitimen & 0x80) cpu.nmiPending = true;
      if (this.nmitimen & 1) { /* auto joypad read: joy[] already holds state */ }
      if (this.onVblank) this.onVblank();
    }
    if (this.line >= LINES) { this.line = 0; this.nmiFlag = 0; this.frameCount++; }
    this.syncSpc();
  }

  runFrame() {
    do this.runLine(); while (this.line !== 0);
    // keep cycle counters from growing without bound
    if (this.cpu.cycles > 1e9) {
      const k = this.cpu.cycles; this.cpu.cycles -= k; this.spc.cycles -= k * SPC_PER_CPU;
    }
  }

  // --- save states (development tools) ---------------------------------------
  saveState() {
    const pick = o => { const r = {}; for (const [k, v] of Object.entries(o)) if (typeof v !== 'function' && typeof v !== 'object') r[k] = v; else if (ArrayBuffer.isView(v)) r[k] = v.slice(); return r; };
    return { snes: pick(this), cpu: pick(this.cpu), spc: { ...pick(this.spc), timerEnable: [...this.spc.timerEnable], timerTarget: [...this.spc.timerTarget], timerStage: [...this.spc.timerStage], timerOut: [...this.spc.timerOut], timerDiv: [...this.spc.timerDiv] }, joy: [...this.joy] };
  }
  loadState(st) {
    const put = (o, r) => { for (const [k, v] of Object.entries(r)) { if (ArrayBuffer.isView(v)) o[k].set(v); else o[k] = Array.isArray(v) ? [...v] : v; } };
    put(this, st.snes); put(this.cpu, st.cpu); put(this.spc, st.spc); this.joy = [...st.joy];
  }

  // --- development renderer -------------------------------------------------
  color(c) {
    const r = (c & 31) << 3, g = ((c >> 5) & 31) << 3, b = ((c >> 10) & 31) << 3;
    return [r | r >> 5, g | g >> 5, b | b >> 5];
  }

  renderFrame(opts = {}) {
    const W = 256, H = 224;
    const out = new Uint8ClampedArray(W * H * 4);
    const ppu = this.ppuMid || this.ppu, scroll = this.scrollMid || this.scroll;
    const mode = ppu[0x05] & 7;
    const layersMain = opts.layers ?? (ppu[0x2c] | ppu[0x2d]);
    // per pixel: best priority rank and color index
    const rank = new Int16Array(W * H).fill(-1);
    const col = new Uint16Array(W * H);
    const bpps = { 0: [2, 2, 2, 2], 1: [4, 4, 2, 0], 2: [4, 4, 0, 0], 3: [8, 4, 0, 0], 4: [8, 2, 0, 0], 5: [4, 2, 0, 0], 6: [4, 0, 0, 0], 7: [0, 0, 0, 0] }[mode];
    const bg3prio = mode === 1 && (ppu[0x05] & 8);
    // rank tables: higher draws in front. [bg][prio]
    const R = {
      bg: mode === 0 ? [[8, 11], [7, 10], [2, 5], [1, 4]]
        : mode === 1 ? [[6, 9], [5, 8], [1, bg3prio ? 13 : 3], [-9, -9]]
          : [[4, 9], [2, 6], [-9, -9], [-9, -9]],
      obj: mode === 0 ? [3, 6, 9, 12] : mode === 1 ? [2, 4, 7, 10] : [3, 5, 7, 10],
    };
    for (let bg = 0; bg < 4; bg++) {
      const bpp = bpps[bg];
      if (!bpp || !(layersMain & (1 << bg))) continue;
      const sc = ppu[0x07 + bg];
      const mapBase = (sc & 0xfc) << 8;
      const mapW = sc & 1 ? 64 : 32, mapH = sc & 2 ? 64 : 32;
      const nba = bg < 2 ? ppu[0x0b] : ppu[0x0c];
      const chrBase = ((bg & 1 ? nba >> 4 : nba) & 0xf) << 12;
      const big = (ppu[0x05] >> (4 + bg)) & 1;
      const ts = big ? 16 : 8;
      const hs = scroll[bg * 2], vs = scroll[bg * 2 + 1];
      const palBase = mode === 0 ? bg * 32 : 0;
      for (let y = 0; y < H; y++) {
        const py = (y + vs) & 0x3ff;
        for (let x = 0; x < W; x++) {
          const px = (x + hs) & 0x3ff;
          const tx = Math.floor(px / ts) & (mapW - 1), ty = Math.floor(py / ts) & (mapH - 1);
          let ma = mapBase + ((ty & 31) << 5) + (tx & 31);
          if (tx & 32) ma += 0x400;
          if (ty & 32) ma += mapW === 64 ? 0x800 : 0x400;
          const e = this.vram[ma & 0x7fff];
          let tile = e & 0x3ff;
          const pal = (e >> 10) & 7, pri = (e >> 13) & 1, hf = e & 0x4000, vf = e & 0x8000;
          let fx = px % ts, fy = py % ts;
          if (hf) fx = ts - 1 - fx;
          if (vf) fy = ts - 1 - fy;
          if (big) { tile += (fx >> 3) + ((fy >> 3) << 4); fx &= 7; fy &= 7; }
          const idx = this.tilePixel(chrBase, tile & 0x3ff, bpp, fx, fy);
          if (!idx) continue;
          const rk = R.bg[bg][pri];
          const p = y * W + x;
          if (rk > rank[p]) { rank[p] = rk; col[p] = bpp === 8 ? idx : palBase + pal * (1 << bpp) + idx; }
        }
      }
    }
    if (layersMain & 0x10) this.renderObj(rank, col, R.obj);
    const bright = ppu[0x00] & 0x80 ? 0 : (ppu[0x00] & 15) / 15;
    for (let p = 0; p < W * H; p++) {
      const [r, g, b] = this.color(this.cgram[rank[p] < 0 ? 0 : col[p]]);
      const k = opts.ignoreBrightness ? 1 : bright;
      out[p * 4] = r * k; out[p * 4 + 1] = g * k; out[p * 4 + 2] = b * k; out[p * 4 + 3] = 255;
    }
    return out;
  }

  tilePixel(base, tile, bpp, x, y) {
    const words = bpp * 4;
    const a = (base + tile * words) & 0x7fff;
    let v = 0;
    for (let pl = 0; pl < bpp; pl += 2) {
      const w = this.vram[(a + (pl >> 1) * 8 + y) & 0x7fff];
      const sh = 7 - x;
      v |= ((w >> sh) & 1) << pl;
      v |= ((w >> (8 + sh)) & 1) << (pl + 1);
    }
    return v;
  }

  objSizes() {
    return [
      [[8, 8], [16, 16]], [[8, 8], [32, 32]], [[8, 8], [64, 64]], [[16, 16], [32, 32]],
      [[16, 16], [64, 64]], [[32, 32], [64, 64]], [[16, 32], [32, 64]], [[16, 32], [32, 32]],
    ][this.ppu[0x01] >> 5];
  }

  renderObj(rank, col, R) {
    const W = 256, H = 224;
    const obsel = this.ppu[0x01];
    const base = (obsel & 7) << 13, gap = (((obsel >> 3) & 3) + 1) << 12;
    const sizes = this.objSizes();
    for (let i = 127; i >= 0; i--) {
      const o = i * 4;
      const hi = (this.oam[512 + (i >> 2)] >> ((i & 3) * 2)) & 3;
      let x = this.oam[o] | ((hi & 1) << 8); if (x >= 256) x -= 512;
      const y = this.oam[o + 1];
      const tile = this.oam[o + 2] | ((this.oam[o + 3] & 1) << 8);
      const attr = this.oam[o + 3];
      const [w, h] = sizes[hi >> 1];
      const pal = (attr >> 1) & 7, pri = (attr >> 4) & 3, hf = attr & 0x40, vf = attr & 0x80;
      for (let sy = 0; sy < h; sy++) {
        const yy = (y + sy) & 0xff;
        if (yy >= H) continue;
        for (let sx = 0; sx < w; sx++) {
          const xx = x + sx;
          if (xx < 0 || xx >= W) continue;
          const fx = hf ? w - 1 - sx : sx, fy = vf ? h - 1 - sy : sy;
          const t = (tile & 0x100) | ((((tile >> 4) + (fy >> 3)) & 15) << 4) | ((tile + (fx >> 3)) & 15);
          const b = (base + ((t & 0x100) ? gap : 0)) & 0x7fff;
          const idx = this.tilePixel(b, t & 0xff, 4, fx & 7, fy & 7);
          if (!idx) continue;
          const p = yy * W + xx;
          if (R[pri] >= rank[p]) { rank[p] = R[pri]; col[p] = 128 + pal * 16 + idx; }
        }
      }
    }
  }
}

// Joypad bits as read from $4218/$4219
export const PAD = {
  B: 0x8000, Y: 0x4000, SELECT: 0x2000, START: 0x1000, UP: 0x0800, DOWN: 0x0400, LEFT: 0x0200, RIGHT: 0x0100,
  A: 0x0080, X: 0x0040, L: 0x0020, R: 0x0010,
};
