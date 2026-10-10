// Mortal Kombat (SNES, USA Rev 1) fighter decoder, reading the player's ROM.
//
// Per fighter f (the game's own order), $80:9C53 + 2f holds the address (bank
// $AE) of its animation table. The ten bytes before the table are five words:
//   frames  ($AE) table of frame pointers, indexed by frame number - 1
//   bank    bank of the frame data
//   tbank   first bank of the fighter's tile data
//   nraw    number of uncompressed tiles (they start at tbank:$8000)
//   (unused here)
// and the word before those points to 27 counts of compressed tiles, grouped
// by how many non-zero bytes they hold.
//
// Animation script: words. 0 ends, $FFF6-$FFFF are commands (1 jump, 2 flip,
// 3/4/7 move, 6/8 one argument, 9 two, 10 one), anything else is a frame.
// Frame: [total pieces][16x16 pieces], then per 16x16 piece: x, y (signed
// bytes), four tile codes; per 8x8 piece: x, y, one tile code.
// Tile code: bit 15 set = raw 4bpp tile at bank (tbank + code & $1F),
// address code & $FFE0. Otherwise code / 3 indexes the compressed tiles:
// four mask bytes, then one data byte per set mask bit (32 output bytes).

import { loRom, bgr15 } from './sf2Rom.js';

export const MK_FIGHTERS = ['Johnny Cage', 'Kano', 'Raiden', 'Liu Kang', 'Scorpion', 'Sub-Zero', 'Sonya', 'Goro', 'Shang Tsung'];

export function parseMkRom(rom) {
  if (rom.length !== 0x200000) throw new Error('Mortal Kombat: expected a 2 MB ROM');
  const title = String.fromCharCode(...rom.subarray(0x7fc0, 0x7fd5));
  if (!title.startsWith('MORTAL KOMBAT')) throw new Error('This is not the Mortal Kombat ROM');
  const m = loRom(rom);
  const fighters = MK_FIGHTERS.map((name, f) => loadFighter(m, f, name));
  return { fighters, m };
}

function loadFighter(m, f, name) {
  const animTab = 0xae0000 | m.r16(0x809c53 + f * 2);
  const hdr = k => m.r16(animTab - 10 + k * 2);
  const frameTab = 0xae0000 | hdr(0);
  const frameBank = hdr(1) & 0xff;
  const tbank = hdr(2) & 0xff;
  const nraw = hdr(3);
  const sizes = 0xae0000 | m.r16(animTab - 12);

  // compressed tile pointers, as the game builds them in WRAM
  const ctiles = [];
  {
    let bank = ((nraw >> 10) & 0x1f) + tbank, addr = ((nraw << 5) & 0xffff) | 0x8000;
    for (let k = 0; k < 27; k++) {
      const n = m.r16(sizes + k * 2), len = k + 5;
      for (let i = 0; i < n; i++) {
        if (addr + len > 0x10000) { addr = 0x8000; bank++; }
        ctiles.push((bank << 16) | addr);
        addr += len;
        if (addr >= 0x10000) { addr = 0x8000; bank++; }
      }
    }
  }

  function tile(code, out, o) {
    if (code & 0x8000) {
      const src = ((tbank + (code & 0x1f)) << 16) | (code & 0xffe0);
      for (let i = 0; i < 32; i++) out[o + i] = m.r8(src + i);
      return;
    }
    const p = ctiles[(code / 3) | 0];
    if (p === undefined) return;
    let d = p + 4, k = 0;
    for (let b = 0; b < 4; b++) {
      const mask = m.r8(p + b);
      for (let bit = 7; bit >= 0; bit--) out[o + k++] = (mask >> bit) & 1 ? m.r8(d++) : 0;
    }
  }

  const nAnims = 0x60;
  const anims = [];
  for (let a = 0; a < nAnims; a++) {
    const p0 = m.r16(animTab + a * 2);
    if (p0 < 0x8000) { anims.push(null); continue; }
    let p = 0xae0000 | p0;
    const steps = [];
    let loop = -1;
    for (let guard = 0; guard < 80; guard++) {
      const w = m.r16(p);
      if (w === 0) break;
      if (w >= 0xfff6) {
        const cmd = (0x10000 - w);
        const nargs = { 1: 1, 3: 1, 4: 2, 6: 1, 7: 1, 8: 1, 9: 2, 10: 1 }[cmd] || 0;
        const args = []; for (let i = 0; i < nargs; i++) args.push(m.r16(p + 2 + i * 2));
        if (cmd === 1) { const t = 0xae0000 | args[0]; loop = steps.findIndex(s => s.at === t); if (loop < 0) loop = steps.length ? 0 : -1; break; }
        steps.push({ at: p, cmd, args: args.map(v => (v << 16) >> 16) });
        p += 2 + nargs * 2;
        continue;
      }
      steps.push({ at: p, frame: w });
      p += 2;
    }
    anims.push({ steps, loop, frames: steps.filter(s => s.frame).map(s => s.frame) });
  }

  const cache = new Map();
  function frame(n) {
    if (cache.has(n)) return cache.get(n);
    const fp = (frameBank << 16) | m.r16(frameTab + (n - 1) * 2);
    const total = m.r8(fp), n16 = m.r8(fp + 1);
    const pieces = [];
    let p = fp + 2;
    for (let i = 0; i < total && i < 64; i++) {
      const px = (m.r8(p) << 24) >> 24, py = (m.r8(p + 1) << 24) >> 24;
      if (i < n16) {
        pieces.push({ px, py, size: 16, codes: [m.r16(p + 2), m.r16(p + 4), m.r16(p + 6), m.r16(p + 8)] });
        p += 10;
      } else {
        pieces.push({ px, py, size: 8, codes: [m.r16(p + 2)] });
        p += 4;
      }
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of pieces) { x0 = Math.min(x0, q.px); y0 = Math.min(y0, q.py); x1 = Math.max(x1, q.px + q.size); y1 = Math.max(y1, q.py + q.size); }
    if (!pieces.length) { const r = { w: 1, h: 1, ox: 0, oy: 0, pix: new Uint8Array(1) }; cache.set(n, r); return r; }
    const W = x1 - x0, H = y1 - y0, pix = new Uint8Array(W * H);
    const buf = new Uint8Array(32);
    for (let i = pieces.length - 1; i >= 0; i--) {
      const q = pieces[i];
      q.codes.forEach((code, k) => {
        tile(code, buf, 0);
        const tx = q.px - x0 + (k & 1) * 8, ty = q.py - y0 + (k >> 1) * 8;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const sh = 7 - x;
          const v = ((buf[y * 2] >> sh) & 1) | (((buf[y * 2 + 1] >> sh) & 1) << 1) | (((buf[16 + y * 2] >> sh) & 1) << 2) | (((buf[17 + y * 2] >> sh) & 1) << 3);
          if (v) pix[(ty + y) * W + tx + x] = v;
        }
      });
    }
    const r = { w: W, h: H, ox: -x0, oy: -y0, pix };
    cache.set(n, r);
    return r;
  }

  // palettes: 15 offsets at frameBank:$8002 into a colour list in bank $97
  // ($97:FB77 + $80f main colours, +$20 second palette, +$60 mirror-match)
  const palettes = [0, 0x20, 0x60].map(base => {
    const pal = new Uint32Array(16);
    for (let i = 1; i < 16; i++) pal[i] = bgr15(m.r16(0x970000 | ((0xfb77 + f * 0x80 + base + m.r16((frameBank << 16) | 0x8000 + i * 2)) & 0xffff)));
    return pal;
  });

  return { name, anims, frame, palettes, animTab, frameBank, tbank, nraw, ctiles: ctiles.length };
}
