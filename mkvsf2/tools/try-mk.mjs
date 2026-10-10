import { load, run, tap, snap, PAD, MK, OUT } from './harness.mjs';
import { execSync } from 'node:child_process';
const s = load(MK);
const shots = [];
const sh = (n) => { snap(s, 'mk_' + n); shots.push(`${OUT}/mk_${n}.png`); };
const mode = process.argv[2] || 'start';
for (let k = 0; k < 12; k++) {
  for (let f = 0; f < 150; f++) { s.joy[0] = (f % 30) < 8 && k > 3 ? PAD[mode.toUpperCase()] : 0; s.runFrame(); }
  sh(String(k).padStart(2, '0'));
}
execSync(`python3 tools/montage.py ${OUT}/m.png 4 ${shots.join(' ')}`);
