import { mkVersus } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = mkVersus(0, 0);
const w = {};
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || (b >= 0x80 && b < 0xc0)) && (o === 0xe29 || o === 0xe2b)) { const k = o.toString(16) + '@' + ((s.cpu.pbr << 16) | s.cpu.pc).toString(16); w[k] = (w[k] || 0) + 1; } };
run(s, 100);
console.log(w);
