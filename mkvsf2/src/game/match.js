// A match between two fighters: rounds, timer, camera, collisions, hits,
// projectiles and the little effects (sparks, banners, screen shake).

import { Fighter } from './fighter.js';

export const VIEW_W = 320, VIEW_H = 224, GROUND = 208;
const ROUND_TIME = 99;

export class Match {
  constructor(defA, defB, opts = {}) {
    this.fighters = [new Fighter(defA, 0), new Fighter(defB, 1)];
    this.stageW = opts.stageW || 640;
    this.wins = [0, 0];
    this.round = 0;
    this.tick = 0;
    this.events = [];        // sounds and announcements for the front end
    this.effects = [];
    this.projectiles = [];
    this.banners = [];
    this.freeze = 0;
    this.shakeT = 0;
    this.over = false;
    this.startRound();
  }

  startRound() {
    this.round++;
    this.timeLeft = ROUND_TIME;
    this.frac = 0;
    this.projectiles = []; this.effects = [];
    const mid = this.stageW / 2;
    this.fighters.forEach((f, i) => { f.reset(i); f.x = mid + (i ? 70 : -70); f.projectile = null; });
    this.camX = mid;
    this.phase = 'intro'; this.phaseT = 0;
    this.finisher = false;
    this.banner(`ROUND ${this.round}`, 80, 'round');
    this.say(`round${Math.min(this.round, 3)}`);
  }

  banner(text, ticks, kind = 'big', delay = 0) { this.banners.push({ text, t: -delay, ticks, kind }); }
  sound(name, vol = 1) { this.events.push({ type: 'sound', name, vol }); }
  say(name) { this.events.push({ type: 'voice', name }); }
  text(t, f) { this.effects.push({ type: 'text', text: t, x: f.x, y: GROUND - f.def.height - 20, t: 0, ticks: 60 }); }
  shake(n) { this.shakeT = Math.max(this.shakeT, n); }
  announceSpecial(f, sp) { this.events.push({ type: 'special', fighter: f.side, name: sp.name, game: f.def.game }); }

  projectileThreat(f) {
    return this.projectiles.some(p => p.owner !== f && Math.abs(p.x - f.x) < 140 && Math.sign(p.vx) === Math.sign(f.x - p.x));
  }

  spawnProjectile(f, sp) {
    if (!sp.projData) return;
    const b = f.frame.reach || f.frame.box;
    const p = {
      owner: f, sp, anim: sp.projData, fi: 0, ft: 0,
      x: f.x + f.face * Math.max(24, b.x1 - 6), y: GROUND - f.def.foot - f.y + (b.y0 + b.y1) / 2,
      vx: (sp.speed || 3) * f.face, face: f.face, hit: sp.hit, life: 240, dead: false,
    };
    f.projectile = p;
    this.projectiles.push(p);
    this.sound('projectile');
  }

  onKO(f, from) {
    if (this.phase !== 'fight' && this.phase !== 'finish') return;
    if (this.phase === 'finish') { // a finishing blow
      this.phase = 'ko'; this.phaseT = 0; this.banner(from && from.def.game === 'mk' ? 'FATALITY' : 'K.O.', 140, 'fatal');
      this.say('fatality'); this.shake(16); this.blood(f, 40);
      return;
    }
    const winner = this.fighters[1 - f.side];
    const final = this.wins[winner.side] + 1 >= 2;
    if (final && winner.def.game === 'mk') {
      // Finish him!
      f.hp = 1; f.state = 'dizzy'; f.timer = 240; f.setAnim('dizzy'); f.vx = 0; f.move = null; f.special = null; f.y = 0; f.vy = 0;
      this.phase = 'finish'; this.phaseT = 0;
      this.banner(f.def.name === 'Sonya' || f.def.name === 'Chun-Li' ? 'FINISH HER!' : 'FINISH HIM!', 120, 'finish');
      this.say('finish');
      return;
    }
    this.phase = 'ko'; this.phaseT = 0; this.freeze = 30;
    this.banner('K.O.', 110, 'ko');
    this.say('ko');
  }

  blood(f, n) {
    if (f.def.game !== 'mk' && !this.fighters.some(o => o.def.game === 'mk')) return;
    for (let i = 0; i < n; i++) this.effects.push({ type: 'drop', x: f.x, y: GROUND - f.def.height * 0.7 - f.y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 5 - 1, t: 0, ticks: 60 });
  }

  clampFighter(f) {
    const half = VIEW_W / 2 - 18;
    f.x = Math.max(this.camX - half, Math.min(this.camX + half, f.x));
    f.x = Math.max(20, Math.min(this.stageW - 20, f.x));
  }

  // ------------------------------------------------------------- update --
  update(pads) {
    this.tick++;
    this.events.length = 0;
    for (const b of this.banners) b.t++;
    this.banners = this.banners.filter(b => b.t < b.ticks);
    if (this.shakeT > 0) this.shakeT--;
    if (this.freeze > 0) { this.freeze--; return; }

    this.phaseT++;
    const [a, b] = this.fighters;
    if (this.phase === 'intro') {
      if (this.phaseT === 80) { this.banner('FIGHT!', 50, 'fight'); this.say('fight'); }
      if (this.phaseT >= 100) { this.phase = 'fight'; this.phaseT = 0; }
    }
    if (this.phase === 'fight' && ++this.frac >= 60) {
      this.frac = 0;
      if (--this.timeLeft <= 0) this.timeUp();
    }
    if (this.phase === 'finish' && this.phaseT > 240) {
      const loser = this.fighters.find(f => f.state === 'dizzy') || (a.hp < b.hp ? a : b);
      loser.hp = 0; loser.knockdown('launch', -loser.face * 1.5, 3);
      this.phase = 'ko'; this.phaseT = 0;
    }

    for (const [i, f] of this.fighters.entries()) {
      const pad = this.phase === 'fight' || this.phase === 'finish' ? pads[i] : 0;
      f.update(pad, this.fighters[1 - i], this);
    }
    this.collide();
    this.updateProjectiles();
    this.checkHits();
    this.updateEffects();
    this.updateCamera();

    if (this.phase === 'ko') this.endRound();
  }

  timeUp() {
    const [a, b] = this.fighters;
    this.phase = 'ko'; this.phaseT = 0;
    this.banner('TIME', 110, 'ko');
    if (a.hp !== b.hp) { const l = a.hp < b.hp ? a : b; l.hp = 0; }
  }

  endRound() {
    const [a, b] = this.fighters;
    if (this.phaseT === 100) {
      const w = a.hp > b.hp ? a : b.hp > a.hp ? b : null;
      if (w) {
        this.wins[w.side]++;
        w.state = 'win'; w.setAnim('victory'); w.vx = 0;
        if (w.hp === 1000) this.banner('FLAWLESS VICTORY', 120, 'win', 0);
        else this.banner(`${w.def.name.toUpperCase()} WINS`, 140, 'win');
        this.say(w.hp === 1000 ? 'flawless' : 'wins');
      } else { this.banner('DRAW', 120, 'win'); this.wins[0]++; this.wins[1]++; }
    }
    if (this.phaseT === 260) {
      if (this.wins[0] >= 2 || this.wins[1] >= 2) { this.over = true; this.winner = this.wins[0] === this.wins[1] ? -1 : this.wins[0] >= 2 ? 0 : 1; }
      else this.startRound();
    }
  }

  collide() {
    const [a, b] = this.fighters;
    for (const f of this.fighters) this.clampFighter(f);
    if (a.state === 'thrown' || b.state === 'thrown' || a.state === 'pulled' || b.state === 'pulled') return;
    // push boxes: only when both are low enough to touch
    const minGap = a.def.bodyHalf + b.def.bodyHalf;
    const dx = b.x - a.x;
    const overlapY = Math.abs(a.y - b.y) < 50;
    if (overlapY && Math.abs(dx) < minGap) {
      const push = (minGap - Math.abs(dx)) / 2;
      const s = dx === 0 ? (a.face > 0 ? 1 : -1) : Math.sign(dx);
      a.x -= s * push; b.x += s * push;
      for (const f of this.fighters) this.clampFighter(f);
      // still overlapping (a fighter against the edge): push the other one
      const d2 = b.x - a.x;
      if (Math.abs(d2) < minGap - 1) {
        const atEdgeA = Math.abs(a.x - (this.camX - s * (VIEW_W / 2 - 18))) < 2;
        if (atEdgeA) b.x = a.x + s * minGap; else a.x = b.x - s * minGap;
      }
    }
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx; p.life--;
      if (p.impact) { if (++p.ft >= 4) { p.ft = 0; if (++p.fi >= p.anim.frames.length) p.dead = true; } continue; }
      const fr = p.anim.frames[p.fi];
      if (++p.ft >= Math.min(fr.dur, 60)) { p.ft = 0; p.fi = p.fi + 1 < p.anim.frames.length ? p.fi + 1 : Math.max(0, p.anim.loop); }
      if (p.life <= 0 || p.x < this.camX - VIEW_W || p.x > this.camX + VIEW_W) p.dead = true;
    }
    // projectiles cancel each other
    for (const p of this.projectiles) for (const q of this.projectiles) if (p !== q && p.owner !== q.owner && !p.dead && !q.dead && !p.impact && !q.impact && Math.abs(p.x - q.x) < 20) {
      this.endProjectile(p); this.endProjectile(q); this.spark(p.x, p.y, 'block');
    }
    this.projectiles = this.projectiles.filter(p => { if (p.dead && p.owner.projectile === p) p.owner.projectile = null; return !p.dead; });
  }

  endProjectile(p) {
    if (p.sp.impactData) { p.impact = true; p.anim = p.sp.impactData; p.fi = 0; p.ft = 0; p.vx = 0; }
    else p.dead = true;
    if (p.owner.projectile === p && !p.sp.impactData) p.owner.projectile = null;
  }

  projBox(p) {
    const fr = p.anim.frames[p.fi], b = fr.box;
    const cy = (b.y0 + b.y1) / 2;
    const r = p.face > 0 ? { x0: p.x + b.x0, x1: p.x + b.x1 } : { x0: p.x - b.x1, x1: p.x - b.x0 };
    return { ...r, y0: p.y + b.y0 - cy, y1: p.y + b.y1 - cy };
  }

  checkHits() {
    const results = [];
    for (const [i, f] of this.fighters.entries()) {
      const o = this.fighters[1 - i];
      const ab = f.attackBox(GROUND);
      if (!ab) continue;
      const hb = o.hurtBox(GROUND);
      if (!hb || !overlap(ab, hb)) continue;
      results.push([f, o, ab, hb, f.move]);
    }
    for (const [f, o, ab, hb, move] of results) {
      move.hitDone = true; f.hitCount++;
      const r = o.receive(move.hit, f, this, { special: !!move.special });
      if (r === 'miss') continue;
      const sx = (Math.max(ab.x0, hb.x0) + Math.min(ab.x1, hb.x1)) / 2, sy = (Math.max(ab.y0, hb.y0) + Math.min(ab.y1, hb.y1)) / 2;
      this.onContact(f, o, r, move.hit, sx, sy);
    }
    for (const p of this.projectiles) {
      if (p.impact || p.dead) continue;
      const o = this.fighters[1 - p.owner.side];
      const hb = o.hurtBox(GROUND);
      if (!hb || !overlap(this.projBox(p), hb)) continue;
      const r = o.receive(p.hit, p.owner, this, { special: true, fromX: p.x });
      if (r === 'miss') continue;
      this.onContact(p.owner, o, r, p.hit, p.x + p.face * 10, p.y);
      this.endProjectile(p);
    }
  }

  onContact(att, def, result, hit, x, y) {
    const heavy = hit.dmg >= 90;
    this.freeze = result === 'block' ? 4 : heavy ? 9 : 6;
    this.spark(x, y, result === 'block' ? 'block' : heavy ? 'heavy' : 'light');
    if (result === 'hit') {
      this.sound(heavy ? 'hitHeavy' : 'hit');
      if (heavy) this.shake(5);
      if (att.def.game === 'mk' || def.def.game === 'mk') this.blood(def, heavy ? 10 : 4);
      if (def.combo >= 2) this.text(`${def.combo} HIT COMBO`, att);
      if (hit.burn || hit.shock) def.flash = 20;
    } else this.sound('block');
  }

  spark(x, y, kind) { this.effects.push({ type: 'spark', kind, x, y, t: 0, ticks: kind === 'heavy' ? 14 : 10 }); }

  updateEffects() {
    for (const e of this.effects) {
      e.t++;
      if (e.type === 'drop') { e.x += e.vx; e.y += e.vy; e.vy += 0.3; if (e.y > GROUND) { e.y = GROUND; e.vx = 0; e.vy = 0; } }
      if (e.type === 'text') e.y -= 0.3;
    }
    this.effects = this.effects.filter(e => e.t < e.ticks);
  }

  updateCamera() {
    const [a, b] = this.fighters;
    const target = (a.x + b.x) / 2;
    this.camX += (target - this.camX) * 0.2;
    this.camX = Math.max(VIEW_W / 2, Math.min(this.stageW - VIEW_W / 2, this.camX));
  }
}

function overlap(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
