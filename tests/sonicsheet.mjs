import fs from 'node:fs';
import { parseSonicRom } from '../src/rom/sonicRom.js';
import { writePng } from './png.mjs';
const rom = new Uint8Array(fs.readFileSync(process.env.ROMS + '/Sonic The Hedgehog (USA, Europe).md'));
const s = await parseSonicRom(rom);
const all = [...s.frames, ...s.shield, ...s.stars];
const W = 16 * 64, H = Math.ceil(all.length / 16) * 64;
const img = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < img.length; i += 4) { img[i] = 92; img[i + 1] = 148; img[i + 2] = 252; img[i + 3] = 255; }
all.forEach((f, k) => {
  if (!f) return;
  const bx = (k % 16) * 64 + 32 - f.ox, by = Math.floor(k / 16) * 64 + 32 - f.oy;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const si = (y * f.w + x) * 4; if (!f.rgba[si + 3]) continue;
    const X = bx + x, Y = by + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const di = (Y * W + X) * 4; img[di] = f.rgba[si]; img[di + 1] = f.rgba[si + 1]; img[di + 2] = f.rgba[si + 2];
  }
});
writePng(process.env.OUT + '/sonicsheet.png', W, H, img);
console.log('frames', s.frames.length);
