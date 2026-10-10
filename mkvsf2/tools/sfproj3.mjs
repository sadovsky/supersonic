import { sfVersus } from './sf-fight.mjs';
import { run, PAD, snap, OUT } from './harness.mjs';
import { execSync } from 'node:child_process';
const s = sfVersus(0, 7);
run(s, 30);
const P = PAD; const shots = [];
for (const [pad, n] of [[P.DOWN, 4], [P.DOWN | P.RIGHT, 4], [P.RIGHT, 2], [P.RIGHT | P.Y, 4]]) run(s, n, pad);
for (let k = 0; k < 8; k++) { run(s, 5); snap(s, 'fb' + k); shots.push(`${OUT}/fb${k}.png`); }
execSync(`python3 tools/montage.py ${OUT}/m.png 4 ${shots.join(' ')}`);
