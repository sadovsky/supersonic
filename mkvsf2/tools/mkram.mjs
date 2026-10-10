import { mkFight } from './mk-fight.mjs';
import { disasm } from './dis.mjs';
const s = mkFight();
console.log(disasm(a => s.read(a), 0x800000, 40, 1, 0));
// who jumps to 80:0000?
const st = s.cpu.step.bind(s.cpu);
let prev = '', hits = {};
s.cpu.step = () => { const c = s.cpu; const here = c.pbr.toString(16) + ':' + c.pc.toString(16); if (c.pbr === 0x80 && c.pc < 0x100 && !(prev.startsWith('80:') && parseInt(prev.split(':')[1], 16) < 0x100)) hits[prev + '->' + here] = (hits[prev + '->' + here] || 0) + 1; prev = here; return st(); };
s.runFrame(); s.runFrame();
console.log(hits);
