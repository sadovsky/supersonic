import fs from 'node:fs';
import { ROMS, MK, SF } from './harness.mjs';
const rom = new Uint8Array(fs.readFileSync(`${ROMS}/${process.argv[2] === 'sf' ? SF : MK}`));
const pat = process.argv.slice(3).map(x => parseInt(x, 16));
for (let i = 0; i < rom.length - pat.length; i++) { let ok = true; for (let k = 0; k < pat.length; k++) if (rom[i + k] !== pat[k]) { ok = false; break; } if (ok) { const bank = (i >> 15) | 0x80, addr = (i & 0x7fff) | 0x8000; console.log('file', i.toString(16), 'snes', bank.toString(16) + ':' + addr.toString(16)); } }
