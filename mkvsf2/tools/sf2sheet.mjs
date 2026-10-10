// Contact sheet of every animation of one SF2 fighter: node tools/sf2sheet.mjs <char> [first] [count]
import fs from 'node:fs';
import { parseSf2Rom } from '../src/rom/sf2Rom.js';
import { ROMS, OUT, SF } from './harness.mjs';
import { writePng } from '../tests/png.mjs';
import { text } from './font.mjs';
const [c = '0', first = '0', count = '400'] = process.argv.slice(2);
const sf = parseSf2Rom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`)));
const F = sf.fighters[+c];
const ids = process.argv[5] ? process.argv[5].split(",").map(x => parseInt(x, 16)) : null;
const anims = ids ? ids.map(i => F.anims[i]) : F.anims.slice(+first, +first + +count);
const CW = 96, CH = 120, maxF = 12;
const W = 30 + CW * maxF, H = CH * anims.length;
const img = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 40; img[i * 4 + 1] = 40; img[i * 4 + 2] = 60; img[i * 4 + 3] = 255; }
anims.forEach((an, r) => {
  text(img, W, 2, r * CH + 4, (ids ? ids[r] : +first + r).toString(16));
  an.frames.slice(0, maxF).forEach((f, k) => {
    const fr = F.frame(f.gfx), pal = F.palettes[process.env.PAL ? +process.env.PAL : fr.pal];
    const bx = 30 + k * CW + 48, by = r * CH + 110; // anchor
    for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
      const v = fr.pix[y * fr.w + x]; if (!v) continue;
      const X = bx - fr.ox + x, Y = by - fr.oy + y - 64;
      if (X < 30 + k * CW || X >= 30 + (k + 1) * CW || Y < r * CH || Y >= (r + 1) * CH) continue;
      const col = pal[v], p = (Y * W + X) * 4;
      img[p] = col & 255; img[p + 1] = (col >> 8) & 255; img[p + 2] = (col >> 16) & 255;
    }
    text(img, W, 30 + k * CW + 2, r * CH + 2, `${f.gfx.toString(16)} ${f.dur}`, [200, 200, 200]);
  });
  if (an.loop >= 0) text(img, W, 2, r * CH + 12, 'l' + an.loop, [0, 255, 0]);
});
writePng(`${OUT}/sheet_${c}_${process.argv[6] || first}.png`, W, H, img);
console.log(F.name, 'anims', F.anims.length);
