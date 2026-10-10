import { mkFight } from './mk-fight.mjs';
const s = mkFight();
const pcs = {};
let last = [];
s.onRead = (i) => { last.push(i); if (last.length > 3) last.shift(); };
s.onWrite = (a, v) => { if ((a >> 16) === 0x7f && (a & 0xffff) < 0x800) { const k = s.cpu.pbr.toString(16) + ':' + s.cpu.pc.toString(16); if (!pcs[k]) pcs[k] = { n: 0, ex: [] }; pcs[k].n++; if (pcs[k].ex.length < 5) pcs[k].ex.push((a & 0xffff).toString(16) + '<-' + last.map(x => x.toString(16)).join(',')); } };
for (let f = 0; f < 10; f++) { s.joy[0] = 0x0100; s.runFrame(); }
console.log(JSON.stringify(pcs, null, 1));
