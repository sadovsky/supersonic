// Street Fighter II (SNES, USA) fighter decoder. Everything here is read from
// the player's ROM: animation scripts, sprite layouts, the tile data streamed
// to VRAM for each frame, palettes and hitboxes.
//
// Layout of the data, as used by the game's own code:
//   $07:EA55 + 3c  24-bit pointer to a 0x2400-byte block copied to WRAM: a
//                  table of sprite layouts (word offsets, indexed by graphics id)
//   $07:EAA3 + 3c  24-bit pointer to the animation scripts (0x880 bytes)
//   $07:EACA + 3c  24-bit pointer to the hitbox table (16 bytes per entry)
//   $07:EA7C + 3c  pointer (bank $09) to the tile DMA lists, per graphics id
//   $07:EB18 + 2c  pointer (bank $05) to the palettes
// Animation frame: [duration, flags, graphics id, hitbox id]. Flags bit 7: a
// relative jump word follows (loop). Sprite layout: [count] then count x
// [dx, dy, tile, attr], attr bit 0 = 16x16 piece, bits 6/7 = flips.
// DMA list entry: [size/16, 24-bit source, VRAM page] (page bit 7 ends it).

export const SF2_FIGHTERS = ['Ryu', 'E. Honda', 'Blanka', 'Guile', 'Ken', 'Chun-Li', 'Zangief', 'Dhalsim', 'M. Bison', 'Sagat', 'Balrog', 'Vega'];

export function loRom(rom) {
  const mask = rom.length - 1;
  const off = a => ((((a >> 16) & 0x7f) << 15) | (a & 0x7fff)) & mask;
  const r8 = a => rom[off(a)];
  const r16 = a => r8(a) | (r8(a + 1) << 8);
  const r24 = a => r16(a) | (r8(a + 2) << 16);
  // copy n bytes following LoROM bank boundaries
  const copy = (a, n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = r8(a);
      a++;
      if ((a & 0xffff) === 0) a = (a & 0xff0000) + 0x18000;
    }
    return out;
  };
  return { off, r8, r16, r24, copy };
}

export const bgr15 = c => {
  const r = (c & 31) << 3, g = ((c >> 5) & 31) << 3, b = ((c >> 10) & 31) << 3;
  return (255 << 24) | ((b | b >> 5) << 16) | ((g | g >> 5) << 8) | (r | r >> 5);
};

export function parseSf2Rom(rom) {
  if (rom.length !== 0x200000) throw new Error('Street Fighter II: expected a 2 MB ROM');
  const title = String.fromCharCode(...rom.subarray(0x7fc0, 0x7fd5));
  if (!title.startsWith('Street Fighter 2')) throw new Error('This is not the Street Fighter II ROM');
  const m = loRom(rom);
  const fighters = SF2_FIGHTERS.map((name, c) => loadFighter(m, c, name));
  return { fighters };
}

function loadFighter(m, c, name) {
  const blob = m.copy(m.r24(0x07ea55 + c * 3), 0x2400);
  const animBase = m.r24(0x07eaa3 + c * 3);
  const anim = m.copy(animBase, 0x880);
  const hit = m.copy(m.r24(0x07eaca + c * 3), 0x880);
  const dmaTable = 0x090000 | m.r16(0x07ea7c + c * 3);
  const palPtr = 0x050000 | m.r16(0x07eb18 + c * 2);
  const w = (buf, o) => buf[o] | (buf[o + 1] << 8);
  const palettes = [];
  for (let p = 0; p < 4; p++) {
    const pal = new Uint32Array(16);
    for (let i = 1; i < 16; i++) pal[i] = bgr15(m.r16(palPtr + p * 0x20 + i * 2));
    palettes.push(pal);
  }

  // Animation scripts. The table's first word gives the number of entries.
  const nAnims = Math.min(w(anim, 0) >> 1, 0x200);
  const anims = [];
  for (let a = 0; a < nAnims; a++) {
    let p = w(anim, a * 2);
    const frames = [];
    let loop = -1;
    for (let guard = 0; guard < 64 && p + 4 <= anim.length; guard++) {
      const f = { dur: anim[p], flags: anim[p + 1], gfx: anim[p + 2], hit: anim[p + 3] };
      frames.push(f);
      if (f.flags & 0x80) {
        const target = (p + 4 + ((w(anim, p + 4) << 16) >> 16)) & 0xffff;
        const ofs = (target - w(anim, a * 2));
        loop = frames.findIndex((_, i) => i * 4 === ofs);
        break;
      }
      p += 4;
    }
    anims.push({ frames, loop });
  }

  // Decode one graphics id to an image: {w, h, ox, oy, pix(Uint8 indices)}
  const cache = new Map();
  function frame(gfx) {
    if (cache.has(gfx)) return cache.get(gfx);
    // tiles streamed into the player's 4 KB VRAM area ($7000-$77FF words)
    const vram = new Uint8Array(0x1000);
    let e = (dmaTable & 0xff0000) | ((m.r16(dmaTable + gfx * 2) + (dmaTable & 0xffff)) & 0xffff);
    for (let guard = 0; guard < 32; guard++) {
      const n = m.r8(e) << 4;
      if (!n) break;
      const src = m.r24(e + 1), page = m.r8(e + 4);
      const dst = ((page & 0x7f) - 0x70) << 9;
      const data = m.copy(src, n);
      for (let i = 0; i < n && dst + i < vram.length; i++) if (dst + i >= 0) vram[dst + i] = data[i];
      if (page & 0x80) break;
      e += 5;
    }
    const lp = w(blob, gfx * 2);
    const count = blob[lp];
    const pieces = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < count; i++) {
      const q = lp + 1 + i * 4;
      const dx = (blob[q] << 24) >> 24, dy = (blob[q + 1] << 24) >> 24, tile = blob[q + 2], attr = blob[q + 3];
      const size = attr & 1 ? 16 : 8;
      // the game positions pieces by their centre: x - 8 (or 16) when flipped
      const px = dx, py = dy;
      pieces.push({ px, py, tile, attr, size });
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px + size); y1 = Math.max(y1, py + size);
    }
    if (!pieces.length) { const r = { w: 1, h: 1, ox: 0, oy: 0, pix: new Uint8Array(1), pal: 0 }; cache.set(gfx, r); return r; }
    const W = x1 - x0, H = y1 - y0;
    const pix = new Uint8Array(W * H);
    // draw back to front: the first piece in the list is in front (lowest OAM index)
    for (let i = pieces.length - 1; i >= 0; i--) {
      const pc = pieces[i];
      for (let sy = 0; sy < pc.size; sy++) for (let sx = 0; sx < pc.size; sx++) {
        const fx = pc.attr & 0x40 ? pc.size - 1 - sx : sx, fy = pc.attr & 0x80 ? pc.size - 1 - sy : sy;
        const t = (((pc.tile >> 4) + (fy >> 3)) & 15) << 4 | ((pc.tile + (fx >> 3)) & 15);
        const v = tilePixel(vram, t & 0x7f, fx & 7, fy & 7);
        if (v) pix[(pc.py - y0 + sy) * W + (pc.px - x0 + sx)] = v;
      }
    }
    const r = { w: W, h: H, ox: -x0, oy: -y0, pix, pal: pieces[0].attr & 2 };
    cache.set(gfx, r);
    return r;
  }

  function hitbox(id) { return hit.subarray(id * 16, id * 16 + 16); }

  return { name, anims, frame, palettes, hitbox };
}

function tilePixel(vram, t, x, y) {
  const a = t * 32 + y * 2, sh = 7 - x;
  return ((vram[a] >> sh) & 1) | (((vram[a + 1] >> sh) & 1) << 1) |
    (((vram[a + 16] >> sh) & 1) << 2) | (((vram[a + 17] >> sh) & 1) << 3);
}
