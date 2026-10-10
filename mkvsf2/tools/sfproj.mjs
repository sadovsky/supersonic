import { sfVersus } from './sf-fight.mjs';
import { run, PAD, snap } from './harness.mjs';
const s = sfVersus(+(process.argv[2] || 0), 7);
run(s, 30);
const P = PAD;
for (const [pad, n] of [[P.DOWN, 4], [P.DOWN | P.RIGHT, 4], [P.RIGHT, 2], [P.RIGHT | P.Y, 4], [0, 30]]) run(s, n, pad);
const seen = {};
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; const pc = (c.pbr << 16) | c.pc;
  if (pc === 0x0088d4 || pc === 0x008a30 || pc === 0x0089a1) { const x = c.x; seen[pc.toString(16) + ' obj ' + x.toString(16)] = `dbr ${c.dbr.toString(16)} 1e=${(s.wram[x + 0x1e] | s.wram[x + 0x1f] << 8).toString(16)} f7=${s.wram[x + 0xf7].toString(16)} x=${s.wram[x+7] | s.wram[x+8]<<8} y=${s.wram[x+10]}`; }
  return st(); };
run(s, 1);
console.log(seen);
snap(s, 'sfproj');
const rd = a => s.read(a);
for (let k = 0; k < 6; k++) { run(s, 4); const x = 0x1820; const p = 0x120000 | (s.wram[x + 0x1e] | s.wram[x + 0x1f] << 8); const n = rd(p); const pcs = []; for (let i = 0; i < n; i++) pcs.push([1,2,3,4].map(j => rd(p + i * 4 + j).toString(16)).join(',')); console.log('ptr', p.toString(16), 'attr16', s.wram[x + 0x16].toString(16), pcs.join(' | ')); }
