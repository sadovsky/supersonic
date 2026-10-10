import { snap, OUT, run } from './harness.mjs';
import { sfVersus } from './sf-fight.mjs';
import { execSync } from 'node:child_process';
const shots = [];
for (const [a, b] of [[2, 5], [6, 3]]) { const s = sfVersus(a, b); snap(s, `ss${a}`); shots.push(`${OUT}/ss${a}.png`); run(s, 200); snap(s, `st${a}`); shots.push(`${OUT}/st${a}.png`); }
execSync(`python3 tools/montage.py ${OUT}/m.png 4 ${shots.join(' ')}`);
