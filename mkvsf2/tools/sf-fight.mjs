// Get SF2 into a fight (Ryu vs CPU) and return the machine
import { load, run, tap, PAD, SF } from './harness.mjs';
export function sfFight() {
  const s = load(SF);
  run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
  tap(s, PAD.B); run(s, 180); tap(s, PAD.B); run(s, 600);
  return s;
}
// Two-player fight with chosen characters (0 Ryu .. 7 Dhalsim); player 2 idle.
export function sfVersus(c1 = 0, c2 = 7) {
  const s = load(SF);
  run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
  const tap2 = (pad) => { for (let i = 0; i < 6; i++) { s.joy[1] = pad; s.runFrame(); } s.joy[1] = 0; run(s, 40); };
  tap2(PAD.START);
  s.wram[0xcd1] = c1; s.wram[0xed1] = c2;
  tap(s, PAD.B); run(s, 30); tap2(PAD.B); run(s, 900);
  return s;
}
