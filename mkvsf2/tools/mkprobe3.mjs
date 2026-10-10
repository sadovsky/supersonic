// Player 1 attacks an idle player 2 at close range; log both players' anims.
import { mkVersus } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = mkVersus(+(process.argv[2] || 0), +(process.argv[3] || 0));
run(s, 30); run(s, 70, PAD.RIGHT); run(s, 20);
const base = s.saveState();
let log = [];
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x809581 && s.wram[0x1da] <= 2) log.push('p' + (s.wram[0x1da] >> 1) + ':' + (c.a & 0xff).toString(16)); return st(); };
const P = PAD;
const tests = [
  ['Y', [[P.Y, 6], [0, 80]]], ['B', [[P.B, 6], [0, 80]]], ['X', [[P.X, 6], [0, 80]]], ['A', [[P.A, 6], [0, 80]]],
  ['upper', [[P.DOWN, 8], [P.DOWN | P.Y, 6], [P.DOWN, 10], [0, 120]]], ['sweep', [[P.LEFT, 6], [P.LEFT | P.A, 6], [0, 120]]],
  ['round', [[P.LEFT, 6], [P.LEFT | P.X, 6], [0, 120]]], ['dA', [[P.DOWN, 8], [P.DOWN | P.A, 6], [P.DOWN, 10], [0, 80]]],
  ['dX', [[P.DOWN, 8], [P.DOWN | P.X, 6], [P.DOWN, 10], [0, 80]]], ['dB', [[P.DOWN, 8], [P.DOWN | P.B, 6], [P.DOWN, 10], [0, 80]]],
  ['throw?', [[P.RIGHT | P.Y, 6], [0, 120]]], ['throwB', [[P.RIGHT | P.B, 6], [0, 120]]],
];
for (const [name, seq] of tests) { s.loadState(base); log = []; for (const [pad, n] of seq) run(s, n, pad); console.log(name.padEnd(8), log.join(' ')); }
// P2 blocks: hold L on pad 2
for (const [name, seq] of tests.slice(0, 4)) { s.loadState(base); log = []; s.joy[1] = P.L; for (const [pad, n] of seq) { for (let i = 0; i < n; i++) { s.joy[0] = pad; s.joy[1] = P.L; s.runFrame(); } } s.joy[1] = 0; console.log(('blk' + name).padEnd(8), log.join(' ')); }
