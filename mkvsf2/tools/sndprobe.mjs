// Which samples does an action trigger? node tools/sndprobe.mjs sf|mk
import fs from 'node:fs';
import { sfVersus } from './sf-fight.mjs';
import { mkVersus } from './mk-fight.mjs';
import { run, PAD, OUT } from './harness.mjs';
import { decodeBrr } from '../src/snes/dsp.js';
const game = process.argv[2];
const s = game === 'mk' ? mkVersus(+(process.argv[3] || 4), +(process.argv[4] || 1)) : sfVersus(+(process.argv[3] || 0), +(process.argv[4] || 7));
const dsp = s.spc.dsp;
const P = PAD;
const keys = () => { const r = new Map(); for (const k of dsp.keyOns) { if (!r.has(k.srcn)) r.set(k.srcn, { n: 0, pitch: k.pitch }); r.get(k.srcn).n++; } dsp.keyOns.length = 0; return r; };
run(s, 240); keys();
run(s, 240); const base = keys();
console.log('baseline (music)', [...base.keys()].join(','));
const base0 = s.saveState();
const tests = game === 'mk' ? {
  close: [[P.RIGHT, 70], [0, 10]], lp: [[P.RIGHT, 70], [P.B, 4], [0, 40]], hp: [[P.RIGHT, 70], [P.Y, 4], [0, 40]], hk: [[P.RIGHT, 70], [P.X, 4], [0, 40]],
  upper: [[P.RIGHT, 70], [P.DOWN, 8], [P.DOWN | P.Y, 4], [0, 90]], block: [[P.RIGHT, 70], [P.L, 40]], spear: [[P.LEFT, 4], [0, 3], [P.LEFT, 4], [0, 3], [P.B, 6], [0, 90]],
  jump: [[P.UP, 6], [0, 60]], throw: [[P.RIGHT, 70], [P.RIGHT | P.B, 4], [0, 90]],
} : {
  close: [[P.RIGHT, 60], [0, 10]], lp: [[P.RIGHT, 60], [P.Y, 4], [0, 40]], hp: [[P.RIGHT, 60], [P.L, 4], [0, 40]], hk: [[P.RIGHT, 60], [P.R, 4], [0, 40]],
  fireball: [[P.DOWN, 4], [P.DOWN | P.RIGHT, 4], [P.RIGHT, 2], [P.RIGHT | P.Y, 4], [0, 90]], dp: [[P.RIGHT, 4], [P.DOWN, 4], [P.DOWN | P.RIGHT, 4], [P.DOWN | P.RIGHT | P.L, 4], [0, 90]],
  tatsu: [[P.DOWN, 4], [P.DOWN | P.LEFT, 4], [P.LEFT, 2], [P.LEFT | P.B, 4], [0, 90]], jump: [[P.UP, 6], [0, 60]], throw: [[P.RIGHT, 60], [P.RIGHT | P.L, 4], [0, 90]],
};
const all = new Map();
for (const [name, seq] of Object.entries(tests)) {
  s.loadState(base0); keys();
  for (const [pad, n] of seq) run(s, n, pad);
  const k = keys();
  const extra = [...k.entries()].filter(([srcn]) => !base.has(srcn) || k.get(srcn).n > base.get(srcn).n * 2);
  console.log(name.padEnd(9), extra.map(([srcn, v]) => `${srcn}(x${v.n} p${v.pitch.toString(16)})`).join(' '));
  for (const [srcn, v] of extra) all.set(srcn, v.pitch);
}
// lengths of the samples
for (const [srcn, pitch] of all) { const { start } = dsp.sample(srcn); const d = decodeBrr(s.spc.ram, start); console.log('srcn', srcn, 'start', start.toString(16), 'samples', d.length, 'secs@pitch', (d.length / (32000 * pitch / 0x1000)).toFixed(2)); }
