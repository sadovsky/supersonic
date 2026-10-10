// who calls a given routine (by JSL/JSR return address on stack)
import { mkFight } from './mk-fight.mjs';
const target = parseInt(process.argv[2], 16);
const s = mkFight();
const st = s.cpu.step.bind(s.cpu);
const hits = {};
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === target) { const ret = s.read(c.s + 1) | (s.read(c.s + 2) << 8) | (s.read(c.s + 3) << 16); const k = ret.toString(16); hits[k] = (hits[k] || 0) + 1; } return st(); };
for (let f = 0; f < 200; f++) { s.joy[0] = [0, 0x0100, 0x0080, 0x4000][(f >> 4) & 3]; s.runFrame(); }
console.log(hits);
