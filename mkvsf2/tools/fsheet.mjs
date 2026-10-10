// Sheet of a built fighter's animations with hit geometry: node tools/fsheet.mjs <roster index> [keys]
import fs from 'node:fs';
import { parseSf2Rom } from '../src/rom/sf2Rom.js';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROSTER } from '../src/game/roster.js';
import { buildFighter } from '../src/game/sprites.js';
import { ROMS, SF, MK, OUT } from './harness.mjs';
import { writePng } from '../tests/png.mjs';
import { text } from './font.mjs';
const roms = { sf2: parseSf2Rom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`))), mk: parseMkRom(new Uint8Array(fs.readFileSync(`${ROMS}/${MK}`))) };
const f = buildFighter(ROSTER[+process.argv[2]], roms);
const sp = Object.fromEntries(f.specials.flatMap(s => [[s.name, s.animData], ...(s.projData ? [[s.name + '-proj', s.projData]] : [])]));
const all = { ...f.anims, ...sp };
const keys = process.argv[3] ? process.argv[3].split(',') : Object.keys(all);
const CW = 110, CH = 140, maxF = 10, W = 60 + CW * maxF, H = CH * keys.length;
const img = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 40; img[i * 4 + 1] = 40; img[i * 4 + 2] = 60; img[i * 4 + 3] = 255; }
const put = (X, Y, c) => { if (X < 0 || Y < 0 || X >= W || Y >= H) return; const p = (Y * W + X) * 4; img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2]; };
keys.forEach((k, r) => {
  const a = all[k]; text(img, W, 2, r * CH + 4, k.replace(/[^a-z0-9 -]/gi, '').slice(0, 12).toLowerCase());
  if (!a) return;
  a.frames.slice(0, maxF).forEach((fr, i) => {
    const bx = 60 + i * CW + 40, by = r * CH + 125 - f.foot;
    for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) { const v = fr.pix[y * fr.w + x]; if (!v) continue; const c = fr.pal[v]; put(bx - fr.ox + x, by - fr.oy + y, [c & 255, (c >> 8) & 255, (c >> 16) & 255]); }
    if (fr.reach && fr.active) { const R = fr.reach; for (let x = R.x0; x < R.x1; x++) { put(bx + x, by + R.y0, [255, 0, 0]); put(bx + x, by + R.y1, [255, 0, 0]); } for (let y = R.y0; y < R.y1; y++) { put(bx + R.x0, by + y, [255, 0, 0]); put(bx + R.x1, by + y, [255, 0, 0]); } }
    put(bx, by, [0, 255, 0]);
    text(img, W, 60 + i * CW + 2, r * CH + 2, String(fr.dur > 999 ? 'h' : fr.dur), [200, 200, 200]);
  });
});
writePng(`${OUT}/f_${process.argv[2]}.png`, W, H, img);
