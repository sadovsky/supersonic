import fs from 'node:fs';
import { loRom } from '../src/rom/sf2Rom.js';
import { ROMS, SF } from './harness.mjs';
const m = loRom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`)));
const c = +(process.argv[2] || 0), target = parseInt(process.argv[3] || '78a', 16);
const anim = m.copy(m.r24(0x07eaa3 + c * 3), 0x880);
const w = o => anim[o] | anim[o + 1] << 8;
const n = w(0) >> 1;
for (let a = 0; a < n; a++) { const o = w(a * 2); if (Math.abs(o - target) < 0x20) console.log('anim', a.toString(16), 'at', o.toString(16)); }
