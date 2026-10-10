import { run, snap, OUT } from './harness.mjs';
import { mkFight } from './mk-fight.mjs';
import { execSync } from 'node:child_process';
const s = mkFight();
const shots = [];
for (let k = 0; k < 8; k++) { run(s, 120, k % 2 ? 0x0100 : 0x0080); snap(s, 'mk_' + k); shots.push(`${OUT}/mk_${k}.png`); }
execSync(`python3 tools/montage.py ${OUT}/m.png 4 ${shots.join(' ')}`);
