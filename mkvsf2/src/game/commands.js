// Pad state and special-move motion detection.
//
// A pad is a bit set. Directions are turned into numpad notation relative to
// the way the fighter faces (6 = toward the opponent, 4 = away, 2 = down...).

export const B = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, LP: 16, HP: 32, LK: 64, HK: 128, BL: 256, START: 512 };
export const BUTTONS = { lp: B.LP, hp: B.HP, lk: B.LK, hk: B.HK, bl: B.BL };

export function dirOf(pad, face) {
  const up = pad & B.UP, down = pad & B.DOWN;
  let fwd = face > 0 ? pad & B.RIGHT : pad & B.LEFT;
  let back = face > 0 ? pad & B.LEFT : pad & B.RIGHT;
  if (fwd && back) fwd = back = 0;
  const h = fwd ? 2 : back ? 0 : 1;
  const v = up && !down ? 2 : down && !up ? 0 : 1;
  return 1 + h + v * 3;
}

const HISTORY = 40;

export class Commands {
  constructor() {
    this.dirs = [];      // last HISTORY directions (newest last)
    this.presses = [];   // per tick: buttons newly pressed
    this.prevPad = 0;
    this.chargeBack = 0; this.chargeDown = 0;
    this.chargeBackWas = 0; this.chargeDownWas = 0;
    this.sinceBack = 99; this.sinceDown = 99;
  }

  update(pad, face) {
    const d = dirOf(pad, face);
    const pressed = pad & ~this.prevPad & ~(B.UP | B.DOWN | B.LEFT | B.RIGHT);
    this.prevPad = pad;
    this.dirs.push(d); this.presses.push(pressed);
    if (this.dirs.length > HISTORY) { this.dirs.shift(); this.presses.shift(); }
    // charge: keep the length of the last back / down hold for a short while after release
    if (d === 4 || d === 1 || d === 7) { this.chargeBack++; this.sinceBack = 0; } else { if (this.chargeBack) this.chargeBackWas = this.chargeBack; this.chargeBack = 0; this.sinceBack++; }
    if (d === 1 || d === 2 || d === 3) { this.chargeDown++; this.sinceDown = 0; } else { if (this.chargeDown) this.chargeDownWas = this.chargeDown; this.chargeDown = 0; this.sinceDown++; }
    this.dir = d; this.pressed = pressed; this.pad = pad;
  }

  // does the direction history contain `seq` in order, within `window` ticks?
  seq(seq, window = 16) {
    const h = this.dirs.slice(-window);
    let k = seq.length - 1;
    for (let i = h.length - 1; i >= 0 && k >= 0; i--) if (seq[k].includes(h[i])) k--;
    return k < 0;
  }

  // taps: direction pressed, released and pressed again (e.g. "back, back")
  taps(a, b, window = 18) {
    const h = this.dirs.slice(-window);
    // find b (latest), before that a neutral/other, before that a
    let i = h.length - 1;
    while (i >= 0 && !b.includes(h[i])) i--;
    if (i < 0) return false;
    while (i >= 0 && b.includes(h[i])) i--;
    let gap = false;
    while (i >= 0 && !a.includes(h[i])) { gap = true; i--; }
    return i >= 0 && (gap || a !== b);
  }

  pressCount(mask, window = 24) {
    let n = 0;
    for (const p of this.presses.slice(-window)) if (p & mask) n++;
    return n;
  }

  // Which special (if any) do the inputs this tick perform?
  special(specials) {
    if (!this.pressed) return null;
    const P = B.LP | B.HP, K = B.LK | B.HK;
    for (const sp of specials) {
      const mask = sp.button === 'p' ? P : sp.button === 'k' ? K : sp.button === 'any' ? P | K : BUTTONS[sp.button];
      if (sp.motion === 'mash') { if ((this.pressed & mask) && this.pressCount(mask) >= 4) return sp; continue; }
      if (sp.motion === 'all') { if ((this.pressed & mask) && (this.pad & B.LP) && (this.pad & B.HP)) return sp; continue; }
      if (!(this.pressed & mask)) continue;
      const ok = {
        qcf: () => this.seq([[2], [3], [6]]),
        qcb: () => this.seq([[2], [1], [4]]),
        dp: () => this.seq([[6], [2], [3]], 18),
        hcf: () => this.seq([[4], [2], [6]], 24),
        '360': () => this.seq([[6], [2], [4], [7, 8, 9]], 30) || this.seq([[4], [2], [6], [7, 8, 9]], 30),
        chargeBF: () => [6, 3, 9].includes(this.dir) && this.sinceBack < 10 && Math.max(this.chargeBackWas, this.chargeBack) >= 40,
        chargeDU: () => [7, 8, 9].includes(this.dir) && this.sinceDown < 10 && Math.max(this.chargeDownWas, this.chargeDown) >= 40,
        bf: () => this.seq([[4], [6]], 14),
        fb: () => this.seq([[6], [4]], 14),
        bb: () => this.taps([4], [4]),
        ff: () => this.taps([6], [6]),
        df: () => this.seq([[2], [3, 6]], 14),
        db: () => this.seq([[2], [1, 4]], 14),
        du: () => this.seq([[1, 2, 3], [7, 8, 9]], 12),
        bbf: () => this.seq([[4], [5, 1, 7], [4], [6]], 22),
      }[sp.motion];
      if (ok && ok()) return sp;
    }
    return null;
  }
}
