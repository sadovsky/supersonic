// When does player 1's frame change? Logs frame-step timing per animation.
import { mkVersus } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = mkVersus(3, 1);
run(s, 30);
let log = [], cur = '';
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; const pc = (c.pbr << 16) | c.pc;
  if (pc === 0x809581 && s.wram[0x1da] === 0) { cur = (c.a & 0xff).toString(16); log.push(`\n${cur}@${s.frameCount}:`); }
  if (pc === 0x8094db && s.wram[0x1da] === 0 && c.a < 0xfff0 && c.a > 0) log.push(`${s.frameCount}`);
  return st(); };
const P = PAD;
for (const [pad, n] of [[0, 60], [P.RIGHT, 60], [0, 20], [P.Y, 6], [0, 40], [P.X, 6], [0, 60], [P.UP, 6], [0, 60], [P.LEFT, 6], [P.LEFT | P.A, 6], [0, 60], [P.RIGHT, 4], [0, 3], [P.RIGHT, 4], [P.Y, 6], [0, 90]]) run(s, n, pad);
console.log(log.join(' '));
