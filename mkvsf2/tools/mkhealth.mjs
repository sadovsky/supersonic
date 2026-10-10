import { mkVersus } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = mkVersus(0, 0);
const snaps = [];
let hitAt = [];
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x809581 && s.wram[0x1da] === 2 && (c.a & 0xff) === 0x2a) hitAt.push(s.frameCount); return st(); };
for (let k = 0; k < 12; k++) { run(s, 20, PAD.RIGHT); run(s, 8, PAD.DOWN); run(s, 6, PAD.DOWN | PAD.Y); for (let i = 0; i < 50; i++) { s.joy[0] = PAD.DOWN; s.runFrame(); snaps.push([s.frameCount, s.wram.slice(0, 0x2000)]); } }
console.log(hitAt);
const at = f => snaps.find(x => x[0] === f)[1];
const [h1, h2] = hitAt;
const a0 = at(h1 - 2), a1 = at(h1 + 20), b1 = at(h2 + 20);
for (let a = 0; a < 0x2000; a++) if (a1[a] < a0[a] && b1[a] < a1[a]) console.log(a.toString(16), a0[a], a1[a], b1[a]);
