import { mkFight } from './mk-fight.mjs';
const s = mkFight();
const st = s.cpu.step.bind(s.cpu);
const seen = {};
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x988c9f) { const d = c.d, r = o => s.read(d + o); const k = `D=${d.toString(16)} d1=${r(0xd1).toString(16)} d7=${(r(0xd7)|r(0xd8)<<8|r(0xd9)<<16).toString(16)} ea=${(r(0xea)|r(0xeb)<<8|r(0xec)<<16).toString(16)} cf=${r(0xcf).toString(16)} da=${s.read(0xda+d).toString(16)}`; seen[k] = 1; } return st(); };
for (let f = 0; f < 100; f++) { s.joy[0] = [0, 0x0100, 0x0080, 0x4000][(f >> 4) & 3]; s.runFrame(); }
console.log(Object.keys(seen).slice(0, 30).join('\n'));
