import { mkFight } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = mkFight();
run(s, 200);
const pcs = {};
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || (b >= 0x80 && b < 0xc0)) && o === 0x1e5) { const k = ((s.cpu.pbr << 16) | s.cpu.pc).toString(16); pcs[k] = (pcs[k] || 0) + 1; } };
for (const p of [PAD.RIGHT, PAD.Y, PAD.X, PAD.DOWN, PAD.UP, 0]) run(s, 40, p);
console.log(pcs);
