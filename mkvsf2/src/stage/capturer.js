// Captures stage backgrounds by running the real game in the SNES emulator:
// it starts a fight on the wanted stage, walks the camera from one end of the
// stage to the other, and records every background line at every scroll
// position. The result is, for each layer and screen line, a strip of pixels
// plus how that line scrolls with the camera (a + b * camera), which keeps
// the games' parallax.

import { SNES, PAD } from '../snes/snes.js';

const bgr15 = c => {
  const r = (c & 31) << 3, g = ((c >> 5) & 31) << 3, b = ((c >> 10) & 31) << 3;
  return ((255 << 24) | ((b | b >> 5) << 16) | ((g | g >> 5) << 8) | (r | r >> 5)) >>> 0;
};

function run(s, n, pad = 0, pad2 = 0, each) {
  for (let i = 0; i < n; i++) { s.joy[0] = pad; s.joy[1] = pad2; if (each) each(i); s.runFrame(); }
  s.joy[0] = s.joy[1] = 0;
}
const tap = (s, pad, hold = 4, gap = 20) => { run(s, hold, pad); run(s, gap); };

// Decode one screen line (256 pixels) of a background layer into `out`,
// using that line's PPU registers (games change modes and windows mid-frame).
export function fetchLine(s, bg, y, hs, vs, out, pals) {
  const ppu = s.linePpu.subarray(y * 0x40, y * 0x40 + 0x40);
  out.fill(0);
  if (!((ppu[0x2c] >> bg) & 1)) return;           // layer not on the main screen here
  const mode = ppu[0x05] & 7;
  const bpp = ({ 0: [2, 2, 2, 2], 1: [4, 4, 2, 0], 2: [4, 4, 0, 0], 3: [8, 4, 0, 0], 4: [8, 2, 0, 0], 5: [4, 2, 0, 0], 6: [4, 0, 0, 0], 7: [0, 0, 0, 0] })[mode][bg];
  if (!bpp) return;
  const big = (ppu[0x05] >> (4 + bg)) & 1, ts = big ? 16 : 8;
  const sc = ppu[0x07 + bg];
  const mapBase = (sc & 0xfc) << 8, mapW = sc & 1 ? 64 : 32, mapH = sc & 2 ? 64 : 32;
  const nba = bg < 2 ? ppu[0x0b] : ppu[0x0c];
  const chrBase = ((bg & 1 ? nba >> 4 : nba) & 0xf) << 12;
  const py = (y + vs) & (mapH * ts - 1);
  const ty = Math.floor(py / ts), fy0 = py % ts;
  const words = bpp * 4, palBase = mode === 0 ? bg * 32 : 0;
  // window mask for this layer on the main screen
  const wsel = (ppu[0x23 + (bg >> 1)] >> ((bg & 1) * 4)) & 15;
  // windows only cut holes for the status bar: ignore them
  const masked = false;
  const logic = (ppu[0x2a] >> (bg * 2)) & 3;
  const inWin = x => {
    const w1 = wsel & 2 ? ((x >= ppu[0x26] && x <= ppu[0x27]) !== !!(wsel & 1)) : null;
    const w2 = wsel & 8 ? ((x >= ppu[0x28] && x <= ppu[0x29]) !== !!(wsel & 4)) : null;
    if (w1 === null) return w2; if (w2 === null) return w1;
    return [w1 || w2, w1 && w2, w1 !== w2, w1 === w2][logic];
  };
  for (let x = 0; x < 256; x++) {
    if (masked && inWin(x)) continue;
    const px = (x + hs) & (mapW * ts - 1), tx = Math.floor(px / ts);
    let ma = mapBase + ((ty & 31) << 5) + (tx & 31);
    if (tx & 32) ma += 0x400;
    if (ty & 32) ma += mapW === 64 ? 0x800 : 0x400;
    const e = s.vram[ma & 0x7fff];
    let fx = px % ts, fy = fy0;
    if (e & 0x4000) fx = ts - 1 - fx;
    if (e & 0x8000) fy = ts - 1 - fy;
    let tile = e & 0x3ff;
    if (big) { tile += (fx >> 3) + ((fy >> 3) << 4); fx &= 7; fy &= 7; }
    const a = (chrBase + (tile & 0x3ff) * words) & 0x7fff, sh = 7 - fx;
    let v = 0;
    for (let pl = 0; pl < bpp; pl += 2) {
      const w = s.vram[(a + (pl >> 1) * 8 + fy) & 0x7fff];
      v |= ((w >> sh) & 1) << pl; v |= ((w >> (8 + sh)) & 1) << (pl + 1);
    }
    // the alpha byte carries the tile's priority (0xFF high, 0xFE low) and BG3 palette (low bits)
    if (v) out[x] = ((pals[bpp === 8 ? v : palBase + ((e >> 10) & 7) * (1 << bpp) + v] & 0x00ffffff) | ((e & 0x2000 ? 0xff : 0xf0 | ((e >> 10) & 7)) << 24)) >>> 0;
  }
}

const SPAN = 2048, BASE = 512;   // strip storage: u from -512 to 1535

// Accumulates background lines while the camera moves.
class Recorder {
  constructor(layers, lines = 224) {
    this.layers = layers; this.lines = lines;
    this.data = new Map();
    this.buf = new Uint32Array(256);
    this.refMin = Infinity; this.refMax = -Infinity;
  }
  sample(s, ref) {
    this.refMin = Math.min(this.refMin, ref); this.refMax = Math.max(this.refMax, ref);
    if (this.bg3prio === undefined) this.bg3prio = ((s.ppuMid || s.ppu)[0x05] & 0x0f) === 9;
    if (this.backdrop === undefined) this.backdrop = Array.from(s.lineBackdrop.subarray(0, this.lines), bgr15);
    const pals = Array.from(s.cgram, bgr15);
    for (const bg of this.layers) {
      for (let y = 0; y < this.lines; y++) {
        const hs = s.lineScroll[y * 8 + bg * 2], vs = s.lineScroll[y * 8 + bg * 2 + 1];
        const key = bg * 1000 + y;
        let d = this.data.get(key);
        if (!d) { d = { samples: [], px: new Uint32Array(SPAN), votes: new Int16Array(SPAN), lo: Infinity, hi: -Infinity, prev: null }; this.data.set(key, d); }
        // unwrap the 10-bit scroll against the previous sample
        let h = hs & 0x3ff;
        if (d.prev !== null) { while (h - d.prev > 512) h -= 1024; while (d.prev - h > 512) h += 1024; }
        d.prev = h;
        d.samples.push([ref, h]);
        fetchLine(s, bg, y, h & 0x3ff, (vs << 22) >> 22, this.buf, pals);
        // every pixel keeps the value it showed most often (a majority vote), so
        // passing things (banners, effects, half-streamed columns) drop out
        for (let x = 0; x < 256; x++) {
          const u = h + x + BASE;
          if (u < 0 || u >= SPAN) continue;
          const v = this.buf[x];
          if (d.votes[u] === 0) { d.px[u] = v; d.votes[u] = 1; } else if (d.px[u] === v) d.votes[u]++; else d.votes[u]--;
          if (u < d.lo) d.lo = u; if (u > d.hi) d.hi = u;
        }
      }
    }
  }
  finish(backdrop) {
    const layers = [];
    for (const bg of this.layers) {
      const lines = [];
      for (let y = 0; y < this.lines; y++) {
        const d = this.data.get(bg * 1000 + y);
        if (!d || d.hi < d.lo) { lines.push(null); continue; }
        const n = d.samples.length;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const [r, h] of d.samples) { sx += r; sy += h; sxx += r * r; sxy += r * h; }
        const den = n * sxx - sx * sx;
        const b = den ? (n * sxy - sx * sy) / den : 0, a = (sy - b * sx) / n;
        // the outermost columns are often half-streamed: trim them
        const trim = 0;
        const strip = d.px.slice(d.lo + trim, d.hi + 1 - trim);
        lines.push(strip.some(c => c) ? { a, b, u0: d.lo + trim - BASE, strip } : null);
      }
      // lines the game leaves blank (above and below the picture) copy the nearest one
      // (only a few lines: the game blanks the screen there; elsewhere empty means empty)
      const first = lines.findIndex(Boolean);
      if (first > 0 && first <= 32) for (let y = 0; y < first; y++) lines[y] = lines[first];
      let last = lines.length - 1; while (last > 0 && !lines[last]) last--;
      if (last >= lines.length - 16) for (let y = last + 1; y < lines.length; y++) lines[y] = lines[last];
      layers.push({ bg, lines });
    }
    return { refMin: this.refMin, refMax: this.refMax, layers, backdrop: this.backdrop ?? backdrop, bg3prio: this.bg3prio };
  }
}

export class StageCapturer {
  constructor(game, rom) {
    this.game = game; this.rom = rom;
    this.base = null;
  }

  // SF2: stage id = the owner's character id (0 Ryu .. 7 Dhalsim, 8+ bosses)
  captureSf2(stage) {
    const s = new SNES(this.rom);
    if (!this.base) {
      run(s, 1500); tap(s, PAD.START, 4, 120); tap(s, PAD.START, 4, 120); tap(s, PAD.START, 4, 120);
      this.base = s.saveState();
    } else s.loadState(this.base);
    s.cpu.hooks = new Map([[0x00e90b, c => { c.a = (c.a & 0xff00) | stage; }]]);
    const keepAlive = () => { s.wram[0xc2b] = s.wram[0xc35] = 0xb0; s.wram[0xe2b] = s.wram[0xe35] = 0xb0; };
    tap(s, PAD.B, 4, 180); tap(s, PAD.B, 4, 0);
    run(s, 640, 0, 0, keepAlive);
    // sweep the camera ($19E7) across the stage; the game clamps it to the stage
    const rec = new Recorder([0, 1]);
    const cam = () => s.wram[0x19e7] | (s.wram[0x19e8] << 8);
    const setCam = v => { s.wram[0x19e7] = v & 0xff; s.wram[0x19e8] = (v >> 8) & 0xff; };
    // the game streams new tile columns as the camera moves, so move it smoothly:
    // first to the left end, then all the way to the right end, recording all along
    let want = cam();
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 400; i++) {
        want += 2 * dir;
        keepAlive(); setCam(want); s.runFrame();
        rec.sample(s, cam());
        if (Math.abs(cam() - want) > 12) { want = cam(); break; }   // clamped: reached the end
      }
    }
    return rec.finish(bgr15(s.cgram[0]));
  }

  // MK: stage = 0..6 (the game picks $000C mod 7)
  captureMk(stage) {
    const s = new SNES(this.rom);
    if (!this.base) {
      for (let k = 0; k < 10; k++) for (let f = 0; f < 150; f++) { s.joy[0] = (f % 30) < 8 && k > 3 ? PAD.START : 0; s.runFrame(); if (k > 8 && f > 60) break; }
      s.joy[0] = 0;
      run(s, 120);
      run(s, 6, 0, PAD.START); run(s, 30);            // player 2 joins: a two-player fight
      this.base = s.saveState();
    } else s.loadState(this.base);
    s.wram[0x201] = s.wram[0x19ae] = 1; s.wram[0x1b10] = 5;
    s.cpu.hooks = new Map([[0xa4b381, () => { s.wram[0x0c] = stage; s.wram[0x0d] = 0; }]]);
    run(s, 6, PAD.B); run(s, 30); run(s, 6, 0, PAD.B);
    run(s, 1400);
    const rec = new Recorder([0, 1]);   // BG3 holds the status bar
    const cam = () => s.wram[0x42b] | (s.wram[0x42c] << 8);
    const setCam = v => { s.wram[0x42b] = v & 0xff; s.wram[0x42c] = (v >> 8) & 0xff; };
    let want = cam();
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 500; i++) {
        want += 2 * dir;
        setCam(want); s.runFrame();
        rec.sample(s, cam());
        if (Math.abs(cam() - want) > 12) { want = cam(); break; }
      }
    }
    return rec.finish(bgr15(s.cgram[0]));
  }
}
