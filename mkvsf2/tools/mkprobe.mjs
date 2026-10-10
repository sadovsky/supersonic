// Log MK animation ids (and frames) started by player 1 for various inputs, each from the same idle state
import { mkVersus } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = mkVersus(+(process.argv[2] || 0), +(process.argv[3] || 0));
run(s, 30);
const base = s.saveState();
let log = [];
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x809581 && s.wram[0x1da] === 0) log.push((c.a & 0xff).toString(16)); return st(); };
const P = PAD;
const tests = [
  ['fwd', [[P.RIGHT, 40]]], ['back', [[P.LEFT, 40]]], ['crouch', [[P.DOWN, 30]]], ['jump', [[P.UP, 8], [0, 60]]],
  ['jumpfwd', [[P.UP | P.RIGHT, 8], [0, 60]]], ['jumpback', [[P.UP | P.LEFT, 8], [0, 60]]],
  ['Y', [[P.Y, 6], [0, 40]]], ['B', [[P.B, 6], [0, 40]]], ['X', [[P.X, 6], [0, 40]]], ['A', [[P.A, 6], [0, 40]]],
  ['R', [[P.R, 30], [0, 20]]], ['L', [[P.L, 30], [0, 20]]], ['dY', [[P.DOWN, 8], [P.DOWN | P.Y, 6], [P.DOWN, 30], [0, 20]]], ['dB', [[P.DOWN, 8], [P.DOWN | P.B, 6], [P.DOWN, 30], [0, 20]]],
  ['dX', [[P.DOWN, 8], [P.DOWN | P.X, 6], [P.DOWN, 30], [0, 20]]], ['dA', [[P.DOWN, 8], [P.DOWN | P.A, 6], [P.DOWN, 30], [0, 20]]], ['dR', [[P.DOWN | P.R, 30], [0, 20]]],
  ['jY', [[P.UP, 8], [0, 12], [P.Y, 6], [0, 50]]], ['jX', [[P.UP, 8], [0, 12], [P.X, 6], [0, 50]]], ['jfX', [[P.UP | P.RIGHT, 8], [0, 12], [P.X, 6], [0, 50]]], ['jfY', [[P.UP | P.RIGHT, 8], [0, 12], [P.Y, 6], [0, 50]]],
  ['backX', [[P.LEFT, 8], [P.LEFT | P.X, 6], [0, 40]]], ['backA', [[P.LEFT, 8], [P.LEFT | P.A, 6], [0, 40]]],
  ['closeY', [[P.RIGHT, 90], [P.Y, 6], [0, 60]]], ['closeX', [[P.RIGHT, 90], [P.X, 6], [0, 60]]], ['closeA', [[P.RIGHT, 90], [P.A, 6], [0, 60]]],
  ['bfY', [[P.LEFT, 4], [0, 2], [P.RIGHT, 4], [P.RIGHT | P.Y, 6], [0, 60]]], ['bbY', [[P.LEFT, 4], [0, 2], [P.LEFT, 4], [P.LEFT | P.Y, 6], [0, 60]]],
  ['ffY', [[P.RIGHT, 4], [0, 2], [P.RIGHT, 4], [P.RIGHT | P.Y, 6], [0, 60]]], ['bfB', [[P.LEFT, 4], [0, 2], [P.RIGHT, 4], [P.RIGHT | P.B, 6], [0, 60]]],
  ['dfY', [[P.DOWN, 4], [P.RIGHT, 4], [P.RIGHT | P.Y, 6], [0, 60]]], ['dbY', [[P.DOWN, 4], [P.LEFT, 4], [P.LEFT | P.Y, 6], [0, 60]]],
  ['bbB', [[P.LEFT, 4], [0, 2], [P.LEFT, 4], [P.LEFT | P.B, 6], [0, 60]]], ['ffB', [[P.RIGHT, 4], [0, 2], [P.RIGHT, 4], [P.RIGHT | P.B, 6], [0, 60]]],
  ['bfA', [[P.LEFT, 4], [0, 2], [P.RIGHT, 4], [P.RIGHT | P.A, 6], [0, 60]]], ['bfX', [[P.LEFT, 4], [0, 2], [P.RIGHT, 4], [P.RIGHT | P.X, 6], [0, 60]]],
  ['dbX', [[P.DOWN, 4], [P.LEFT, 4], [P.LEFT | P.X, 6], [0, 60]]], ['dfA', [[P.DOWN, 4], [P.RIGHT, 4], [P.RIGHT | P.A, 6], [0, 60]]],
  ['dbA', [[P.DOWN, 4], [P.LEFT, 4], [P.LEFT | P.A, 6], [0, 60]]], ['bdA', [[P.LEFT, 4], [P.DOWN, 4], [P.DOWN | P.A, 6], [0, 60]]], ['bL', [[P.LEFT|P.L, 6], [0, 60]]],
];
for (const [name, seq] of tests) { s.loadState(base); log = []; for (const [pad, n] of seq) run(s, n, pad); console.log(name.padEnd(8), log.join(' ')); }
