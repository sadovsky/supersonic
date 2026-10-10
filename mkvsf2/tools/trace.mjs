// print the last N instructions before reaching an address
import { mkFight } from './mk-fight.mjs';
import { disasm } from './dis.mjs';
const target = parseInt(process.argv[2], 16), N = +(process.argv[3] || 40);
const s = mkFight();
const st = s.cpu.step.bind(s.cpu);
const ring = [];
let done = false;
s.cpu.step = () => { const c = s.cpu; const pc = (c.pbr << 16) | c.pc;
  if (!done) { ring.push(`${disasm(a => s.read(a), pc, 1, c.mf, c.xf)}   A=${c.a.toString(16)} X=${c.x.toString(16)} Y=${c.y.toString(16)} S=${c.s.toString(16)} D=${c.d.toString(16)} DB=${c.dbr.toString(16)}`); if (ring.length > N) ring.shift(); }
  if (pc === target && !done) { done = true; console.log(ring.join('\n')); }
  return st(); };
for (let f = 0; f < 300 && !done; f++) { s.joy[0] = [0, 0x0100, 0x0080, 0x4000][(f >> 4) & 3]; s.runFrame(); }
