// The "machine" that SMB's code runs on: CPU, 2 KB RAM, the ROM, and a thin
// PPU/APU *register interface*. Nothing here emulates video timing or audio
// hardware; we just record what the game writes (nametables, palette, OAM,
// scroll, sound registers) so native code can draw and synthesize it.

import { CPU6502 } from './cpu6502.js';

export class Machine {
  constructor(prg, chr) {
    this.prg = new Uint8Array(prg);      // 32 KB, mapped at $8000
    this.chr = new Uint8Array(chr);      // 8 KB pattern tables
    this.ram = new Uint8Array(0x800);
    this.cpu = new CPU6502(this);

    // PPU-side state
    this.nametables = new Uint8Array(0x800); // vertical mirroring: $2000 & $2400
    this.palette = new Uint8Array(32);
    this.oam = new Uint8Array(256);
    this.ctrl = 0; this.mask = 0;
    this.addrLatch = 0; this.vramAddr = 0; this.readBuffer = 0;
    this.t = 0; this.fineX = 0; // PPU "loopy" temp address: scroll + nametable select
    this.sprite0Toggle = 0;

    // per-frame capture for the renderer
    this.frameTop = { ctrl: 0, scrollX: 0, scrollY: 0 };
    this.frameMain = this.frameTop;
    this.splitSeen = false;
    this.sprite0Loop = [0, 0]; // address range of the sprite-0 wait loop

    // controller
    this.buttons = 0; // bit order: A B Select Start Up Down Left Right (bit0 = A)
    this.buttons2 = 0;
    this.strobe = 0; this.shift = [0, 0];

    // sound register writes recorded during the frame
    this.apuWrites = [];

    // optional observers
    this.onOamDma = null;
  }

  // ---- bus -----------------------------------------------------------------
  read(a) {
    if (a < 0x2000) return this.ram[a & 0x7ff];
    if (a >= 0x8000) return this.prg[a & 0x7fff];
    if (a < 0x4000) return this.ppuRead(a & 7);
    if (a === 0x4016 || a === 0x4017) {
      const i = a & 1;
      const v = this.shift[i] & 1;
      this.shift[i] = (this.shift[i] >> 1) | 0x80;
      return 0x40 | v;
    }
    return 0;
  }

  write(a, v) {
    if (a < 0x2000) { this.ram[a & 0x7ff] = v; return; }
    if (a < 0x4000) { this.ppuWrite(a & 7, v); return; }
    if (a === 0x4014) { // OAM DMA
      const base = v << 8;
      for (let i = 0; i < 256; i++) this.oam[i] = this.read(base + i);
      if (this.onOamDma) this.onOamDma();
      return;
    }
    if (a === 0x4016) {
      if (this.strobe && !(v & 1)) { this.shift[0] = this.buttons; this.shift[1] = this.buttons2; }
      this.strobe = v & 1;
      return;
    }
    if (a >= 0x4000 && a <= 0x4017) this.apuWrites.push(a, v);
  }

  // ---- PPU register interface ---------------------------------------------
  ppuRead(r) {
    if (r === 2) {
      // Vblank always "set" (SMB only polls it during boot). Sprite-0 hit
      // toggles on every read so both of SMB's wait loops terminate.
      this.sprite0Toggle ^= 1;
      const s0 = this.sprite0Toggle;
      this.addrLatch = 0;
      const pc = this.cpu.pc;
      if (s0 && pc >= this.sprite0Loop[0] && pc < this.sprite0Loop[1] && !this.splitSeen) {
        this.splitSeen = true;
        this.frameTop = this.scrollState();
      }
      return 0x80 | (s0 << 6);
    }
    if (r === 7) {
      const addr = this.vramAddr & 0x3fff;
      let v;
      if (addr >= 0x3f00) { v = this.palette[this.palIndex(addr)]; this.readBuffer = this.vramRead(addr - 0x1000); }
      else { v = this.readBuffer; this.readBuffer = this.vramRead(addr); }
      this.vramAddr = (this.vramAddr + (this.ctrl & 4 ? 32 : 1)) & 0x7fff;
      return v;
    }
    return 0;
  }

  ppuWrite(r, v) {
    switch (r) {
      case 0: this.ctrl = v; this.t = (this.t & ~0x0c00) | ((v & 3) << 10); break;
      case 1: this.mask = v; break;
      case 3: break; // OAM address: SMB always uses DMA
      case 5:
        if (!this.addrLatch) { this.t = (this.t & ~0x1f) | (v >> 3); this.fineX = v & 7; }
        else this.t = (this.t & ~0x73e0) | ((v & 7) << 12) | ((v >> 3) << 5);
        this.addrLatch ^= 1;
        break;
      case 6:
        if (!this.addrLatch) this.t = (this.t & 0x00ff) | ((v & 0x3f) << 8);
        else { this.t = (this.t & 0xff00) | v; this.vramAddr = this.t; }
        this.addrLatch ^= 1;
        break;
      case 7:
        this.vramWrite(this.vramAddr & 0x3fff, v);
        this.vramAddr = (this.vramAddr + (this.ctrl & 4 ? 32 : 1)) & 0x7fff;
        break;
    }
  }

  palIndex(addr) {
    let i = addr & 0x1f;
    if ((i & 0x13) === 0x10) i &= 0x0f;
    return i;
  }

  ntIndex(addr) {
    // vertical mirroring: $2000/$2800 -> table 0, $2400/$2C00 -> table 1
    return ((addr & 0x400) ? 0x400 : 0) | (addr & 0x3ff);
  }

  vramRead(addr) {
    if (addr < 0x2000) return this.chr[addr];
    if (addr < 0x3f00) return this.nametables[this.ntIndex(addr)];
    return this.palette[this.palIndex(addr)];
  }

  vramWrite(addr, v) {
    if (addr < 0x2000) return; // CHR ROM
    if (addr < 0x3f00) { this.nametables[this.ntIndex(addr)] = v; return; }
    this.palette[this.palIndex(addr)] = v & 0x3f;
  }

  // ---- driving the game --------------------------------------------------
  reset(startAddr, endlessLoopAddr) {
    this.cpu.pc = startAddr;
    this.cpu.sp = 0xfd;
    this.cpu.runUntil(endlessLoopAddr);
  }

  runFrame(nmiVector) {
    this.apuWrites.length = 0;
    this.splitSeen = false;
    this.sprite0Toggle = 0;
    this.cpu.nmi(nmiVector);
    this.frameMain = this.scrollState();
    if (!this.splitSeen) this.frameTop = this.frameMain;
  }

  // Scroll position and nametable as the PPU would start drawing with them
  scrollState() {
    const t = this.t;
    return {
      ctrl: (this.ctrl & ~3) | ((t >> 10) & 3),
      scrollX: ((t & 0x1f) << 3) | this.fineX,
      scrollY: (((t >> 5) & 0x1f) << 3) | ((t >> 12) & 7),
    };
  }
}
