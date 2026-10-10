import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
tap(s, PAD.B); run(s, 180);
const pcs = {};
let last = [];
s.onRead = (i) => { last.push(i); if (last.length > 4) last.shift(); };
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || b === 0x7e) && o >= 0x400 && o < 0x500) { const k = s.cpu.pbr.toString(16) + ':' + s.cpu.pc.toString(16); if (!pcs[k]) pcs[k] = { n: 0, ex: [] }; pcs[k].n++; if (pcs[k].ex.length < 4) pcs[k].ex.push(o.toString(16) + '<-rom ' + last.map(x => x.toString(16)).join(',')); } };
tap(s, PAD.B); run(s, 400);
console.log(JSON.stringify(pcs, null, 1));
// OAM: palettes used by P1/P2 sprites
const pals = {};
for (let i = 0; i < 128; i++) { const at = s.oam[i * 4 + 3]; const t = s.oam[i*4+2] | ((at & 1) << 8); const k = (t >> 7) + ':' + ((at >> 1) & 7); pals[k] = (pals[k] || 0) + 1; }
console.log(pals);
