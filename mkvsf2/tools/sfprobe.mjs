// Log SF2 animation ids started for player 1 inputs (and player 2 reactions)
import { sfVersus } from './sf-fight.mjs';
import { run, PAD } from './harness.mjs';
const c1 = +(process.argv[2] || 0), c2 = +(process.argv[3] || 7), close = process.argv[4] === 'close';
const s = sfVersus(c1, c2);
run(s, 30);
if (close) { run(s, 60, PAD.RIGHT); run(s, 20); }
const base = s.saveState();
let log = [];
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x01bb5a && (c.d === 0xc00 || c.d === 0xe00)) log.push((c.d === 0xc00 ? '' : 'p2:') + (c.a & 0xff).toString(16)); return st(); };
const P = PAD, F = P.RIGHT, B = P.LEFT, D = P.DOWN, U = P.UP, LP = P.Y, MP = P.X, HP = P.L, LK = P.B, MK = P.A, HK = P.R;
const t = (...k) => k;
const tests = {
  fwd: [[F, 40]], back: [[B, 40]], crouch: [[D, 30], [0, 20]], jump: [[U, 6], [0, 60]], jumpF: [[U | F, 6], [0, 60]], jumpB: [[U | B, 6], [0, 60]],
  LP: [[LP, 4], [0, 40]], MP: [[MP, 4], [0, 40]], HP: [[HP, 4], [0, 50]], LK: [[LK, 4], [0, 40]], MK: [[MK, 4], [0, 40]], HK: [[HK, 4], [0, 50]],
  dLP: [[D, 6], [D | LP, 4], [D, 30], [0, 20]], dMP: [[D, 6], [D | MP, 4], [D, 30], [0, 20]], dHP: [[D, 6], [D | HP, 4], [D, 40], [0, 20]],
  dLK: [[D, 6], [D | LK, 4], [D, 30], [0, 20]], dMK: [[D, 6], [D | MK, 4], [D, 30], [0, 20]], dHK: [[D, 6], [D | HK, 4], [D, 40], [0, 20]],
  jLP: [[U, 6], [0, 14], [LP, 4], [0, 50]], jHP: [[U, 6], [0, 14], [HP, 4], [0, 50]], jHK: [[U, 6], [0, 14], [HK, 4], [0, 50]],
  jfHP: [[U | F, 6], [0, 14], [HP, 4], [0, 50]], jfHK: [[U | F, 6], [0, 14], [HK, 4], [0, 50]], jfLK: [[U | F, 6], [0, 14], [LK, 4], [0, 50]],
  fireball: [[D, 4], [D | F, 4], [F, 2], [F | LP, 4], [0, 90]], dp: [[F, 4], [D, 4], [D | F, 4], [D | F | HP, 4], [0, 90]],
  hurricane: [[D, 4], [D | B, 4], [B, 2], [B | LK, 4], [0, 90]], chargeBF: [[B, 70], [F, 2], [F | LP, 4], [0, 90]], chargeDU: [[D, 70], [U, 2], [U | HK, 4], [0, 90]],
  mashLP: [[LP, 2], [0, 2], [LP, 2], [0, 2], [LP, 2], [0, 2], [LP, 2], [0, 2], [LP, 2], [0, 2], [LP, 2], [0, 60]], mashLK: [[LK, 2], [0, 2], [LK, 2], [0, 2], [LK, 2], [0, 2], [LK, 2], [0, 2], [LK, 2], [0, 2], [LK, 2], [0, 60]],
  yoga: [[B, 4], [D | B, 4], [D, 4], [D | F, 4], [F, 2], [F | LP, 4], [0, 90]], spd: [[F, 3], [D | F, 3], [D, 3], [D | B, 3], [B, 3], [U | B, 3], [U, 3], [U | F, 3], [F | LP, 4], [0, 90]],
  chargeBFH: [[B, 70], [F, 2], [F | HP, 4], [0, 90]], chargeDUK: [[D, 70], [U, 2], [U | LK, 4], [0, 90]], allP: [[LP | MP | HP, 4], [0, 90]],
  yogaflame: [[B, 4], [D | B, 4], [D, 4], [D | F, 4], [F, 2], [F | HP, 4], [0, 90]],
  mash2LP: Array.from({ length: 24 }, (_, i) => [i % 2 ? 0 : LP, 2]).concat([[0, 60]]), mash2LK: Array.from({ length: 24 }, (_, i) => [i % 2 ? 0 : LK, 2]).concat([[0, 60]]),
  mash3LP: Array.from({ length: 30 }, (_, i) => [i % 2 ? 0 : LP, 1]).concat([[0, 60]]), mash3LK: Array.from({ length: 30 }, (_, i) => [i % 2 ? 0 : LK, 1]).concat([[0, 60]]),
  spd2: [[F, 2], [D | F, 2], [D, 2], [D | B, 2], [B, 2], [U | B, 2], [U, 1], [F | LP, 4], [0, 90]],
  throwF: [[F | HP, 4], [0, 90]], throwB: [[B | HP, 4], [0, 90]], blockStand: [[B, 40]],
};
const only = process.argv[5];
for (const [name, steps] of Object.entries(tests)) { if (only && !only.split(',').includes(name)) continue; s.loadState(base); log = []; for (const [pad, n] of steps) run(s, n, pad); console.log(name.padEnd(10), log.join(' ')); }
