import { sfFight } from './sf-fight.mjs';
import { run } from './harness.mjs';
const s = sfFight();
const pcs = {};
s.onWrite = (a, v) => { const o = a & 0x1ffff; const b = a >> 16; if ((b < 0x40 || b === 0x7e) && (a & 0xffff) >= 0x700 && (a & 0xffff) < 0x920) { const k = s.cpu.pbr.toString(16) + ':' + s.cpu.pc.toString(16); pcs[k] = (pcs[k] || 0) + 1; } };
run(s, 1);
console.log(pcs);
