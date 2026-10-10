import fs from 'node:fs';
import { loRom } from '../src/rom/sf2Rom.js';
import { ROMS, SF } from './harness.mjs';
const m = loRom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`)));
const c = +process.argv[2], g = parseInt(process.argv[3], 16);
const blob = m.copy(m.r24(0x07ea55 + c * 3), 0x2400);
const dmaTable = 0x090000 | m.r16(0x07ea7c + c * 3);
let e = (dmaTable & 0xff0000) | ((m.r16(dmaTable + g * 2) + (dmaTable & 0xffff)) & 0xffff);
for (let k = 0; k < 10; k++) { const n = m.r8(e); console.log('dma n', n, 'src', m.r24(e + 1).toString(16), 'page', m.r8(e + 4).toString(16)); if (!n || m.r8(e + 4) & 0x80) break; e += 5; }
const lp = blob[g * 2] | blob[g * 2 + 1] << 8; const cnt = blob[lp];
const pcs = []; for (let i = 0; i < cnt; i++) pcs.push([0, 1, 2, 3].map(j => blob[lp + 1 + i * 4 + j].toString(16)).join(','));
console.log('layout', lp.toString(16), cnt, pcs.join(' | '));
