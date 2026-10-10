import { run, snap, OUT, PAD } from './harness.mjs';
import { mkVersus } from './mk-fight.mjs';
import { execSync } from 'node:child_process';
const s = mkVersus(0, 0);
const shots = [];
for (let k = 0; k < 8; k++) { snap(s, 'mk_' + k); shots.push(`${OUT}/mk_${k}.png`); run(s, 100, k > 3 ? PAD.RIGHT : 0); }
execSync(`python3 tools/montage.py ${OUT}/m.png 4 ${shots.join(' ')}`);
console.log([...s.wram.slice(0x1d0,0x1f0)].map(v=>v.toString(16)).join(' '));
