import { mkFight } from './mk-fight.mjs';
import { disasm } from './dis.mjs';
const s = mkFight();
const pcs = {};
let last = [];
s.onRead = (i) => { last.push(i.toString(16)); if (last.length > 6) last.shift(); };
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || (b >= 0x80 && b < 0xc0) || b === 0x7e) && o >= 0x1e7 && o <= 0x1e9) { const pc = (s.cpu.pbr << 16) | s.cpu.pc; const k = pc.toString(16); if (!pcs[k]) pcs[k] = { n: 0, ex: [] }; pcs[k].n++; if (pcs[k].ex.length < 3) pcs[k].ex.push(o.toString(16) + '=' + v.toString(16) + ' rom:' + last.join(',')); } };
for (let f = 0; f < 100; f++) { s.joy[0] = [0, 0x0100, 0x0080, 0x4000][(f >> 4) & 3]; s.runFrame(); }
console.log(JSON.stringify(pcs, null, 1));
