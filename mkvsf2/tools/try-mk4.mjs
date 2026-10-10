import { run, tap, snap, PAD, OUT } from './harness.mjs';
import { mkToSelect } from './mk-fight.mjs';
import { execSync } from 'node:child_process';
const s = mkToSelect();
run(s, 120); tap(s, PAD.B, 6, 30);
const shots = [];
for (let k = 0; k < 12; k++) { run(s, 100); snap(s, 'mk_' + k); shots.push(`${OUT}/mk_${k}.png`); }
execSync(`python3 tools/montage.py ${OUT}/m.png 6 ${shots.join(' ')}`);
