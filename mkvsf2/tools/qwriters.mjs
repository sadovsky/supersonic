import { sfFight } from './sf-fight.mjs';
const s = sfFight();
const pcs = {};
s.onWrite = (a, v) => { const o = a & 0xffff; if ((a >> 16 === 0 || a >> 16 === 0x7e || (a>>16) < 0x40) && o >= 0x500 && o < 0x600) { const k = s.cpu.pbr.toString(16) + ':' + s.cpu.pc.toString(16); pcs[k] = (pcs[k] || 0) + 1; } };
for (let f = 0; f < 60; f++) { s.joy[0] = f % 40 < 20 ? 0x0100 : 0x0080; s.runFrame(); }
console.log(pcs);
