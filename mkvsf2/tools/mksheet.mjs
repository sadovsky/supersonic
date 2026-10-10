// Contact sheet of MK fighter animations: node tools/mksheet.mjs <fighter> [first] [count]
import fs from 'node:fs';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROMS, OUT, MK } from './harness.mjs';
import { writePng } from '../tests/png.mjs';
import { text } from './font.mjs';
const [c = '1', first = '0', count = '24', , list] = process.argv.slice(2);
const mk = parseMkRom(new Uint8Array(fs.readFileSync(`${ROMS}/${MK}`)));
const F = mk.fighters[+c];
console.log(F.name, 'tbank', F.tbank.toString(16), 'nraw', F.nraw.toString(16), 'ctiles', F.ctiles);
const pal = [0]; for (let i = 1; i < 16; i++) { const g = i * 16; pal.push([g, g, g]); }
const P = [...F.palettes[0]].map(c => [c & 255, (c >> 8) & 255, (c >> 16) & 255]);
const ids = process.argv[6] ? process.argv[6].split(',').map(x => parseInt(x, 16)) : null;
const anims = ids ? ids.map(i => F.anims[i]) : F.anims.slice(+first, +first + +count);
const CW = 100, CH = 150, maxF = 12;
const W = 30 + CW * maxF, H = CH * anims.length;
const img = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 40; img[i * 4 + 1] = 40; img[i * 4 + 2] = 60; img[i * 4 + 3] = 255; }
anims.forEach((an, r) => {
  text(img, W, 2, r * CH + 4, (ids ? ids[r] : +first + r).toString(16));
  if (!an) return;
  an.frames.slice(0, maxF).forEach((fn, k) => {
    let fr; try { fr = F.frame(fn); } catch (e) { return; }
    const bx = 30 + k * CW + 50, by = r * CH + 140;
    for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
      const v = fr.pix[y * fr.w + x]; if (!v) continue;
      const X = bx - fr.ox + x, Y = by - fr.oy + y - 100;
      if (X < 30 + k * CW || X >= 30 + (k + 1) * CW || Y < r * CH || Y >= (r + 1) * CH) continue;
      const col = P[v], p = (Y * W + X) * 4;
      img[p] = col[0]; img[p + 1] = col[1]; img[p + 2] = col[2];
    }
    text(img, W, 30 + k * CW + 2, r * CH + 2, fn.toString(16), [200, 200, 200]);
  });
});
writePng(`${OUT}/mk_${c}_${process.argv[7] || first}.png`, W, H, img);
