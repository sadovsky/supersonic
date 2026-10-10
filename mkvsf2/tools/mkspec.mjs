// Try special-move inputs for an MK fighter; log animation ids of all objects
import { mkVersus } from './mk-fight.mjs';
import { run, PAD } from './harness.mjs';
const f = +(process.argv[2] || 0);
const s = mkVersus(f, 1);
run(s, 30);
const base = s.saveState();
let log = [];
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x809581) log.push('o' + s.wram[0x1da] + ':' + (c.a & 0xff).toString(16)); return st(); };
const P = PAD, F = P.RIGHT, B = P.LEFT, D = P.DOWN, U = P.UP, LP = P.B, HP = P.Y, LK = P.A, HK = P.X, BL = P.L;
const seq = (...k) => k.flatMap(x => Array.isArray(x) ? [x] : [[x, 4], [0, 3]]);
const tests = process.argv[3] === 'df' ? {
  'D,DF,F,LP': [[D, 4], [D | F, 4], [F, 4], [F | LP, 6], [0, 90]], 'D,F,LP2': [[D, 6], [F, 6], [LP, 6], [0, 90]], 'D,F+LP': [[D, 6], [F | LP, 6], [0, 90]],
  'slide': [[B | LP | LK | BL, 10], [0, 90]], 'slide2': [[B, 4], [B | LP | LK | BL, 10], [0, 90]], 'slide3': [[LP | LK | BL | B, 3], [0, 90]],
} : {
  'B,F,LP': seq(B, F, [LP, 6], [0, 90]), 'B,F,LK': seq(B, F, [LK, 6], [0, 90]), 'D,F,LP': seq(D, [D | F, 3], F, [LP, 6], [0, 90]),
  'F,F,HP': seq(F, F, [HP, 6], [0, 90]), 'F,F,HK': seq(F, F, [HK, 6], [0, 90]), 'B,B,LP': seq(B, B, [LP, 6], [0, 90]),
  'D,B,HP': seq(D, [D | B, 3], B, [HP, 6], [0, 90]), 'D,U': seq(D, [U, 6], [0, 90]), 'B,B,F': seq(B, B, [F, 6], [0, 90]),
  'BL:B,F': [[BL, 4], [BL | B, 4], [BL, 3], [BL | F, 4], [BL, 3], [0, 90]], 'holdLK': [[LK, 200], [0, 90]], 'holdLP': [[LP, 200], [0, 90]],
  'B+LP+LK+BL': [[B | LP | LK | BL, 6], [0, 90]], 'D+LP+BL': [[D | LP | BL, 6], [0, 90]], 'F,B,HP': seq(F, B, [HP, 6], [0, 90]),
  'BL+LP': [[BL | LP, 6], [0, 90]],
};
for (const [name, steps] of Object.entries(tests)) { s.loadState(base); log = []; for (const [pad, n] of steps) run(s, n, pad); console.log(name.padEnd(12), log.join(' ')); }
