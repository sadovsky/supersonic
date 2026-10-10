// CPU opponent. It produces a pad state each tick, like a player would, so
// it plays by the same rules (including typing out special-move motions).

import { B } from './commands.js';

const P = B;

export class AI {
  constructor(level = 2) {
    this.level = level;           // 1 easy .. 4 hard
    this.queue = [];              // [{pad, n}] in fighter-relative directions
    this.wait = 0;
    this.projCooldown = 0;
  }

  // f: 6 = toward the opponent, 4 = away, etc. Turn into absolute pad bits.
  static abs(rel, face) {
    let pad = rel & ~(P.LEFT | P.RIGHT);
    if (rel & P.RIGHT) pad |= face > 0 ? P.RIGHT : P.LEFT;
    if (rel & P.LEFT) pad |= face > 0 ? P.LEFT : P.RIGHT;
    return pad;
  }

  push(...steps) { for (const [pad, n] of steps) this.queue.push({ pad, n }); }

  motion(sp, btn) {
    const F = P.RIGHT, Bk = P.LEFT, D = P.DOWN, U = P.UP;
    const b = btn;
    switch (sp.motion) {
      case 'qcf': return [[D, 3], [D | F, 3], [F | b, 3]];
      case 'qcb': return [[D, 3], [D | Bk, 3], [Bk | b, 3]];
      case 'dp': return [[F, 3], [D, 3], [D | F | b, 3]];
      case 'hcf': return [[Bk, 3], [D | Bk, 3], [D, 3], [D | F, 3], [F | b, 3]];
      case '360': return [[F, 2], [D | F, 2], [D, 2], [D | Bk, 2], [Bk, 2], [U | Bk, 1], [U | b, 2]];
      case 'chargeBF': return [[Bk, 46], [F | b, 3]];
      case 'chargeDU': return [[D | Bk, 46], [U | b, 3]];
      case 'mash': return [[b, 2], [0, 2], [b, 2], [0, 2], [b, 2], [0, 2], [b, 2], [0, 2], [b, 2]];
      case 'all': return [[P.LP | P.HP, 3]];
      case 'bf': return [[Bk, 3], [F, 3], [b, 3]];
      case 'fb': return [[F, 3], [Bk, 3], [b, 3]];
      case 'bb': return [[Bk, 3], [0, 3], [Bk, 3], [b, 3]];
      case 'ff': return [[F, 3], [0, 3], [F, 3], [b, 3]];
      case 'df': return [[D, 3], [D | F, 3], [F | b, 3]];
      case 'db': return [[D, 3], [D | Bk, 3], [Bk | b, 3]];
      case 'du': return [[D, 3], [U | b, 3]];
      case 'bbf': return [[Bk, 3], [0, 2], [Bk, 3], [F | b, 3]];
    }
    return [[b, 3]];
  }

  buttonFor(sp) {
    switch (sp.button) {
      case 'p': return Math.random() < 0.5 ? P.LP : P.HP;
      case 'k': return Math.random() < 0.5 ? P.LK : P.HK;
      case 'any': return P.HP;
      default: return { lp: P.LP, hp: P.HP, lk: P.LK, hk: P.HK, bl: P.BL }[sp.button];
    }
  }

  doSpecial(sp) { this.push(...this.motion(sp, this.buttonFor(sp))); }

  pad(me, opp, match) {
    if (this.projCooldown > 0) this.projCooldown--;
    if (match.phase !== 'fight' && match.phase !== 'finish') { this.queue = []; return 0; }
    if (this.queue.length) {
      const q = this.queue[0];
      if (--q.n <= 0) this.queue.shift();
      return AI.abs(q.pad, me.face);
    }
    if (this.wait > 0) { this.wait--; return this.holdPad; }
    this.holdPad = 0;
    if (!['stand', 'crouch', 'block', 'jump'].includes(me.state)) return 0;
    if (me.state === 'jump') return 0;

    const L = this.level;
    const gap = Math.abs(opp.x - me.x) - me.def.bodyHalf - opp.def.bodyHalf;
    const r = Math.random();
    const reactChance = [0, 0.25, 0.45, 0.65, 0.85][L];
    const specials = me.def.specials;
    const projSp = specials.find(s => s.kind === 'projectile');
    const antiAir = specials.find(s => s.kind === 'rising');

    // finish him: go for a hit
    if (match.phase === 'finish') { if (gap > 20) return this.hold(P.RIGHT, 4, me); this.push([P.HP, 3]); return 0; }

    // incoming projectile: jump over it or block
    const proj = match.projectiles.find(p => p.owner === opp && !p.impact && Math.abs(p.x - me.x) < 110);
    if (proj && r < reactChance) {
      if (Math.random() < 0.4) { this.push([P.UP | P.RIGHT, 4]); return 0; }
      return this.hold(P.LEFT, 24, me);
    }
    // opponent attacking close: block
    if (opp.attacking && gap < 70 && r < reactChance) {
      const low = opp.move && (opp.move.crouch || (opp.move.hit && opp.move.hit.level === 'low'));
      return this.hold(low ? P.LEFT | P.DOWN : P.LEFT, 16, me);
    }
    // opponent jumping in: anti-air
    if (opp.y > 20 && gap < 80 && Math.sign(opp.vx) === Math.sign(me.x - opp.x) && r < reactChance) {
      if (antiAir) { this.doSpecial(antiAir); return 0; }
      this.push([P.DOWN, 2], [P.DOWN | P.HP, 3]); return 0;
    }
    // opponent dizzy or down: approach
    if (gap > 130) {
      if (projSp && this.projCooldown === 0 && Math.random() < 0.02 * L + 0.02) { this.projCooldown = 90 - L * 10; this.doSpecial(projSp); return 0; }
      if (Math.random() < 0.01 * L) { this.push([P.UP | P.RIGHT, 4], [0, 18], [P.HK, 3]); return 0; }
      return this.hold(P.RIGHT, 10 + (Math.random() * 20 | 0), me);
    }
    if (gap > 45) {
      const x = Math.random();
      if (projSp && this.projCooldown === 0 && x < 0.05 + 0.02 * L) { this.projCooldown = 100; this.doSpecial(projSp); return 0; }
      if (x < 0.1) { this.push([P.UP | P.RIGHT, 4], [0, 16], [P.HK, 3]); return 0; }
      const dash = specials.find(s => s.kind === 'dash' || s.kind === 'spin');
      if (dash && x < 0.15) { this.doSpecial(dash); return 0; }
      if (x < 0.25) return this.hold(P.LEFT, 12, me);
      return this.hold(P.RIGHT, 8 + (Math.random() * 14 | 0), me);
    }
    // close
    const x = Math.random();
    if (x < 0.12 / (5 - L) * 3) {
      const close = specials.filter(s => ['flurry', 'grab', 'rising', 'spin', 'flame'].includes(s.kind));
      if (close.length) { this.doSpecial(close[Math.random() * close.length | 0]); return 0; }
    }
    if (x < 0.2) { this.push([P.RIGHT | P.HP, 3]); return 0; }            // throw attempt
    if (x < 0.55) { const b = [P.LP, P.HP, P.LK, P.HK][Math.random() * 4 | 0]; this.push([b, 3]); this.wait = 10 - L * 2; return 0; }
    if (x < 0.7) { const b = [P.LK, P.HK, P.HP][Math.random() * 3 | 0]; this.push([P.DOWN, 2], [P.DOWN | b, 3], [P.DOWN, 8]); return 0; }
    if (x < 0.8) return this.hold(P.LEFT, 14, me);
    return this.hold(0, 6 + (Math.random() * 12 | 0), me);
  }

  hold(rel, n, me) { this.holdPad = AI.abs(rel, me.face); this.wait = n; return this.holdPad; }
}
