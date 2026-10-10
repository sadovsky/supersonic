// Get MK into a fight and return the machine
import { load, run, tap, PAD, MK } from './harness.mjs';
export function mkToSelect() {
  const s = load(MK);
  for (let k = 0; k < 10; k++) for (let f = 0; f < 150; f++) { s.joy[0] = (f % 30) < 8 && k > 3 ? PAD.START : 0; s.runFrame(); if (k > 8 && f > 60) break; }
  return s;
}
export function mkFight(moves = []) {
  const s = mkToSelect();
  run(s, 120);
  for (const m of moves) tap(s, PAD[m], 4, 16);
  tap(s, PAD.B, 6, 30);
  // battle plan, then "Round 1, Fight!"
  run(s, 1450);
  return s;
}
// Two-player fight (player 2 idle) so the moves of player 1 can be probed.
// p1/p2: fighter ids.
export function mkVersus(p1 = 1, p2 = 5) {
  const s = mkToSelect();
  run(s, 120);
  const tap2 = (pad, hold = 6, gap = 30) => { for (let i = 0; i < hold; i++) { s.joy[1] = pad; s.runFrame(); } s.joy[1] = 0; run(s, gap); };
  tap2(PAD.START, 6, 60);
  // fighter ids: 0 Cage, 1 Kano, 2 Raiden, 3 Liu Kang, 4 Scorpion, 5 Sub-Zero, 6 Sonya
  s.wram[0x201] = s.wram[0x19ae] = p1; s.wram[0x1b10] = p2;
  tap(s, PAD.B, 6, 30); tap2(PAD.B, 6, 30);
  run(s, 1450);
  return s;
}
