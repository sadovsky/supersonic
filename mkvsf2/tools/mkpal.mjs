import { mkToSelect } from './mk-fight.mjs';
import { run, tap, PAD } from './harness.mjs';
const s = mkToSelect();
const pcs = {};
let last = [];
s.onRead = (i) => { last.push(i.toString(16)); if (last.length > 3) last.shift(); };
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || (b >= 0x80 && b < 0xc0) || b === 0x7e) && o >= 0x13a4 && o < 0x14a4) { const pc = (s.cpu.pbr << 16) | s.cpu.pc; const k = pc.toString(16); if (!pcs[k]) pcs[k] = { n: 0, ex: [] }; pcs[k].n++; if (pcs[k].ex.length < 3) pcs[k].ex.push(o.toString(16) + '=' + v.toString(16) + ' rom:' + last.join(',')); } };
tap(s, PAD.B, 6, 30); run(s, 600);
console.log(JSON.stringify(pcs, null, 0).replace(/},/g, '},\n'));
const pals = {};
for (let i = 0; i < 128; i++) { const at = s.oam[i * 4 + 3]; const k = (at >> 1) & 7; pals[k] = (pals[k] || 0) + 1; }
console.log(pals);
