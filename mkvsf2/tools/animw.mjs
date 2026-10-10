import { sfFight } from './sf-fight.mjs';
import { run } from './harness.mjs';
const s = sfFight();
const pcs = {};
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || b === 0x7e) && [0xc1e, 0xc1f, 0xcf7, 0xc1c, 0xc1d].includes(o)) { const k = o.toString(16) + ' ' + s.cpu.pbr.toString(16) + ':' + s.cpu.pc.toString(16); pcs[k] = (pcs[k] || 0) + 1; } };
run(s, 120, 0x0080);
console.log(pcs);
