import fs from 'node:fs';
import { loRom } from '../src/rom/sf2Rom.js';
import { ROMS, SF } from './harness.mjs';
const m = loRom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`)));
for (const t of process.argv.slice(2).map(x => parseInt(x, 16))) { let s = t.toString(16) + ': '; for (let c = 0; c < 13; c++) s += m.r24(t + c * 3).toString(16) + ' '; console.log(s); }
