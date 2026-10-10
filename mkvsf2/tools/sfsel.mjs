import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
const snaps = [s.wram.slice(0, 0x2000)];
for (let k = 0; k < 3; k++) { tap(s, PAD.RIGHT, 6, 30); snaps.push(s.wram.slice(0, 0x2000)); }
for (let a = 0; a < 0x2000; a++) { const v = snaps.map(m => m[a]); if (new Set(v).size === 4 && v.every(x => x < 16)) console.log(a.toString(16), v.join(',')); }
