import { mkVersus } from './mk-fight.mjs';
import { snap, OUT } from './harness.mjs';
import { execSync } from 'node:child_process';
const shots = [];
for (const [a, b] of [[0, 2], [3, 4], [6, 1]]) { const s = mkVersus(a, b); snap(s, `sel${a}`); shots.push(`${OUT}/sel${a}.png`); }
execSync(`python3 tools/montage.py ${OUT}/m.png 3 ${shots.join(' ')}`);
