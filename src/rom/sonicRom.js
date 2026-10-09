// Extracts Sonic's sprites from the user's Sonic the Hedgehog (Genesis) ROM.
// Offsets are for "Sonic The Hedgehog (USA, Europe)" (REV00), verified by SHA-1.

import { sha1Hex } from './smbRom.js';

export const SONIC_SHA1 = '6ddb7de1e17e7f6cdb88927bd906352030daa194';

const OFS = {
  palSonic: 0x2388,     // Pal_Sonic: 16 colours
  mapSonic: 0x211e2,    // Map_Sonic: sprite mappings
  plcSonic: 0x217fe,    // SonicDynPLC: which art tiles each frame uses
  artSonic: 0x21afe,    // Art_Sonic: uncompressed 4bpp tiles
  nemShield: 0x2bd5c,   // Nem_Shield (Nemesis compressed)
  nemStars: 0x2bef2,    // Nem_Stars (Nemesis compressed)
};
const FRAME_COUNT = 0x58;

// Sonic 1 frame IDs (from the disassembly's _anim/Sonic.asm)
export const FR = {
  Stand: 0x01, Wait1: 0x02, Wait2: 0x03, Wait3: 0x04, LookUp: 0x05,
  Walk: [0x08, 0x09, 0x0a, 0x0b, 0x06, 0x07], // Walk13..16, Walk11, Walk12
  Run: [0x1e, 0x1f, 0x20, 0x21],
  Roll: [0x2e, 0x2f, 0x30, 0x31, 0x32],
  Stop1: 0x37, Stop2: 0x38, Duck: 0x39, Balance1: 0x3a, Balance2: 0x3b,
  Float: [0x3c, 0x3d, 0x3e, 0x3f], Spring: 0x40, Hang1: 0x41, Hang2: 0x42,
  Leap1: 0x43, Leap2: 0x44, Push: [0x45, 0x46, 0x47, 0x48],
  Surf: 0x49, Burnt: 0x4b, Drown: 0x4c, Death: 0x4d, Injury: 0x55, GetAir: 0x56,
};

// Genesis DAC colour levels for 3-bit channels
const LEVELS = [0, 52, 87, 116, 144, 172, 206, 255];
function genColor(word) {
  const r = LEVELS[(word >> 1) & 7], g = LEVELS[(word >> 5) & 7], b = LEVELS[(word >> 9) & 7];
  return { r, g, b };
}

export function looksLikeGenesis(bytes) {
  const s = String.fromCharCode(...bytes.slice(0x100, 0x110));
  return s.includes('SEGA');
}

// Nemesis decompression (Sega's art compression), output as raw 4bpp tiles.
export function nemesisDecompress(rom, ofs) {
  let p = ofs;
  const header = (rom[p] << 8) | rom[p + 1]; p += 2;
  const xorMode = (header & 0x8000) !== 0;
  const tiles = header & 0x7fff;
  const codes = new Map(); // key: (len<<8)|code -> {nyb, count}
  let nyb = 0;
  let b = rom[p++];
  while (b !== 0xff) {
    if (b & 0x80) { nyb = b & 0x0f; b = rom[p++]; }
    const count = ((b >> 4) & 7) + 1, len = b & 0x0f;
    const code = rom[p++];
    codes.set((len << 8) | code, { nyb, count });
    b = rom[p++];
  }
  // bit reader
  let bitPos = 0;
  const bit = () => { const v = (rom[p + (bitPos >> 3)] >> (7 - (bitPos & 7))) & 1; bitPos++; return v; };
  const bits = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
  const out = new Uint8Array(tiles * 32);
  let o = 0, row = 0, nybInRow = 0, prevRow = 0;
  const emit = (n) => {
    row = ((row << 4) | n) >>> 0; nybInRow++;
    if (nybInRow === 8) {
      let w = row;
      if (xorMode) { w = (w ^ prevRow) >>> 0; prevRow = w; }
      out[o++] = w >>> 24; out[o++] = (w >>> 16) & 0xff; out[o++] = (w >>> 8) & 0xff; out[o++] = w & 0xff;
      row = 0; nybInRow = 0;
    }
  };
  while (o < out.length) {
    let code = 0, len = 0, entry = null;
    while (len < 8) {
      code = (code << 1) | bit(); len++;
      if (len === 6 && code === 0x3f) break;
      entry = codes.get((len << 8) | code);
      if (entry) break;
    }
    let count, n;
    if (!entry) {
      if (!(len === 6 && code === 0x3f)) throw new Error('Nemesis: bad code');
      count = bits(3) + 1; n = bits(4);
    } else { count = entry.count; n = entry.nyb; }
    for (let i = 0; i < count && o < out.length; i++) emit(n);
  }
  return out;
}

// Turn a Sonic-1 style mapping frame into an RGBA image.
// pieces: [{x,y,w,h,tile,hf,vf,pal}] with tile index into `tileData` (4bpp, 32 bytes/tile)
function renderPieces(pieces, tileData, palette) {
  if (!pieces.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const pc of pieces) {
    x0 = Math.min(x0, pc.x); y0 = Math.min(y0, pc.y);
    x1 = Math.max(x1, pc.x + pc.w * 8); y1 = Math.max(y1, pc.y + pc.h * 8);
  }
  const w = x1 - x0, h = y1 - y0;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (const pc of pieces) {
    for (let tx = 0; tx < pc.w; tx++) {
      for (let ty = 0; ty < pc.h; ty++) {
        const t = pc.tile + tx * pc.h + ty; // tiles go down columns first
        const dx = pc.hf ? pc.w - 1 - tx : tx, dy = pc.vf ? pc.h - 1 - ty : ty;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const byte = tileData[t * 32 + py * 4 + (px >> 1)];
            if (byte === undefined) continue;
            const c = (px & 1) ? byte & 15 : byte >> 4;
            if (!c) continue;
            const ox = pc.x - x0 + dx * 8 + (pc.hf ? 7 - px : px);
            const oy = pc.y - y0 + dy * 8 + (pc.vf ? 7 - py : py);
            const col = palette[c];
            const i = (oy * w + ox) * 4;
            rgba[i] = col.r; rgba[i + 1] = col.g; rgba[i + 2] = col.b; rgba[i + 3] = 255;
          }
        }
      }
    }
  }
  return { w, h, ox: -x0, oy: -y0, rgba }; // (ox,oy) = object origin inside the image
}

function readPieces(rom, ofs) {
  const n = rom[ofs];
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const q = ofs + 1 + i * 5;
    const y = (rom[q] << 24) >> 24;
    const size = rom[q + 1];
    const tw = (rom[q + 2] << 8) | rom[q + 3];
    const x = (rom[q + 4] << 24) >> 24;
    pieces.push({ x, y, w: ((size >> 2) & 3) + 1, h: (size & 3) + 1, tile: tw & 0x7ff, hf: (tw >> 11) & 1, vf: (tw >> 12) & 1, pal: (tw >> 13) & 3 });
  }
  return pieces;
}

export async function parseSonicRom(bytes) {
  if (bytes.length < 0x80000 || !looksLikeGenesis(bytes)) throw new Error('That file is not a Sega Genesis / Mega Drive ROM of Sonic the Hedgehog.');
  const hash = await sha1Hex(bytes.slice(0, 0x80000));
  if (hash !== SONIC_SHA1) throw new Error('This Sonic ROM is not the expected revision (Sonic The Hedgehog (USA, Europe), REV00). Checksum: ' + hash);
  return extractSonic(bytes);
}

export function readPalette(rom, ofs) {
  const pal = [];
  for (let i = 0; i < 16; i++) pal.push(genColor((rom[ofs + i * 2] << 8) | rom[ofs + i * 2 + 1]));
  return pal;
}

export function extractSonic(rom) {
  const palette = readPalette(rom, OFS.palSonic);
  const frames = [];
  for (let f = 0; f < FRAME_COUNT; f++) {
    const mapOfs = OFS.mapSonic + ((rom[OFS.mapSonic + f * 2] << 8) | rom[OFS.mapSonic + f * 2 + 1]);
    const plcOfs = OFS.plcSonic + ((rom[OFS.plcSonic + f * 2] << 8) | rom[OFS.plcSonic + f * 2 + 1]);
    // gather the frame's art as the DPLC would have loaded it into VRAM
    const n = rom[plcOfs];
    const tiles = [];
    for (let i = 0; i < n; i++) {
      const e = (rom[plcOfs + 1 + i * 2] << 8) | rom[plcOfs + 2 + i * 2];
      const count = (e >> 12) + 1, start = e & 0xfff;
      for (let k = 0; k < count; k++) tiles.push(start + k);
    }
    const vram = new Uint8Array(tiles.length * 32);
    tiles.forEach((t, i) => vram.set(rom.subarray(OFS.artSonic + t * 32, OFS.artSonic + t * 32 + 32), i * 32));
    frames.push(renderPieces(readPieces(rom, mapOfs), vram, palette));
  }

  // Shield and invincibility stars share one mappings table in the original;
  // we rebuild the 3 shield and 4 star frames from their (tiny) piece layouts.
  const shieldArt = nemesisDecompress(rom, OFS.nemShield);
  const starArt = nemesisDecompress(rom, OFS.nemStars);
  const quad = (a, b, c, d) => [
    { x: -24, y: -24, w: 3, h: 3, tile: a[0], hf: a[1], vf: 0 }, { x: 0, y: -24, w: 3, h: 3, tile: b[0], hf: b[1], vf: 0 },
    { x: -24, y: 0, w: 3, h: 3, tile: c[0], hf: c[1], vf: 1 }, { x: 0, y: 0, w: 3, h: 3, tile: d[0], hf: d[1], vf: 1 }];
  const shield = [
    renderPieces(quad([0, 0], [9, 0], [0, 0], [9, 0]), shieldArt, palette),
    renderPieces(quad([0x12, 1], [0x12, 0], [0x12, 1], [0x12, 0]).map((p, i) => (i % 2 === 0 ? { ...p, x: -23 } : p)), shieldArt, palette),
    renderPieces(quad([9, 1], [0, 1], [9, 1], [0, 1]), shieldArt, palette),
  ];
  const stars = [
    renderPieces(quad([0, 0], [9, 0], [9, 1], [0, 1]), starArt, palette),
    renderPieces(quad([9, 1], [0, 1], [0, 0], [9, 0]), starArt, palette),
    renderPieces(quad([0x12, 0], [0x1b, 0], [0x1b, 1], [0x12, 1]), starArt, palette),
    renderPieces(quad([0x1b, 1], [0x12, 1], [0x12, 0], [0x1b, 0]), starArt, palette),
  ];
  return { palette, frames, shield, stars };
}
