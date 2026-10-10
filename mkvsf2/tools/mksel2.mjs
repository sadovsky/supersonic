import { mkToSelect } from './mk-fight.mjs';
import { run, tap, PAD } from './harness.mjs';
const s = mkToSelect(); run(s, 120);
const tap2 = (pad) => { for (let i = 0; i < 6; i++) { s.joy[1] = pad; s.runFrame(); } s.joy[1] = 0; run(s, 40); };
tap2(PAD.START);
const snaps = [s.wram.slice(0, 0x2000)];
for (let k = 0; k < 3; k++) { tap2(PAD.LEFT); snaps.push(s.wram.slice(0, 0x2000)); }
for (let a = 0; a < 0x2000; a++) { const v = snaps.map(m => m[a]); if (new Set(v).size >= 3 && v.every(x => x < 16)) console.log(a.toString(16), v.join(',')); }
