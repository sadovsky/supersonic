import { sfFight } from './sf-fight.mjs';
const s = sfFight();
const pcs = {};
const w = s.writeCpuReg.bind(s);
s.writeCpuReg = (off, v) => { if (off >= 0x4300 && off < 0x4380 && (off & 0xf) === 4) { const k = s.cpu.pbr.toString(16) + ':' + s.cpu.pc.toString(16); pcs[k] = (pcs[k] || 0) + 1; } return w(off, v); };
for (let f = 0; f < 60; f++) { s.joy[0] = f % 40 < 20 ? 0x0100 : 0x0080; s.runFrame(); }
console.log(pcs);
