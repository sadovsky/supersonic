// One fighter: movement, attacks, specials, getting hit, blocking.
// Coordinates: x is the world position, y the height above the ground
// (up is positive). Animation frames face right; `face` is +1 or -1.

import { B, Commands } from './commands.js';
import { MOVES } from './roster.js';
import { HOLD } from './sprites.js';

const GRAVITY = 0.32;
const JUMP_VY = 6.6;
const WALK_F = 1.6, WALK_B = 1.3, JUMP_VX = 2.2;
const CLOSE = 28;          // gap (between bodies) that counts as close range
const THROW_GAP = 16;

const CONTROL = new Set(['stand', 'crouch']);

export class Fighter {
  constructor(def, side) {
    this.def = def;
    this.side = side;
    this.cmd = new Commands();
    this.reset(side);
  }

  reset(side = this.side) {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.face = side === 0 ? 1 : -1;
    this.hp = 1000;
    this.state = 'stand';
    this.timer = 0;
    this.move = null;          // current attack: { key, hit, anim, special }
    this.hitCount = 0;
    this.lastHitTick = -99;
    this.invuln = 0;
    this.stunMeter = 0;
    this.combo = 0;
    this.projectile = null;
    this.flash = 0;
    this.frozen = 0;
    this.setAnim('idle');
  }

  get anims() { return this.def.anims; }

  setAnim(a) {
    const anim = typeof a === 'string' ? this.anims[a] || this.anims.idle : a;
    if (this.anim === anim && !this.animDone && anim.loop >= 0) return;
    this.anim = anim; this.fi = 0; this.ft = 0;
    this.animDone = anim.frames.length === 1 && anim.frames[0].dur >= HOLD && anim.loop < 0;
  }
  get frame() { return this.anim.frames[this.fi]; }

  stepAnim() {
    const f = this.anim.frames[this.fi];
    if (++this.ft < f.dur) return;
    this.ft = 0;
    if (this.fi + 1 < this.anim.frames.length) {
      this.fi++;
      // a held last frame of a one-shot animation counts as the end
      if (this.fi === this.anim.frames.length - 1 && this.anim.frames[this.fi].dur >= HOLD && this.anim.loop < 0) this.animDone = true;
      return;
    }
    if (this.anim.loop >= 0 && this.anim.loop < this.anim.frames.length) this.fi = this.anim.loop;
    else { this.animDone = true; this.ft = f.dur; }
  }

  get airborne() { return this.y > 0 || this.state === 'jump'; }
  get attacking() { return this.state === 'attack' || this.state === 'jumpattack' || this.state === 'special'; }
  get crouching() { return this.state === 'crouch' || (this.state === 'block' && this.blockLow) || (this.state === 'attack' && this.move && this.move.crouch); }
  get alive() { return this.hp > 0; }

  // ------------------------------------------------------------- update --
  update(pad, opp, match) {
    this.cmd.update(pad, this.face);
    if (this.pendingSwing) { this.pendingSwing = false; match.sound('swing', 0.6, this.def.game); }
    if (this.flash > 0) this.flash--;
    if (this.invuln > 0) this.invuln--;
    if (this.stunMeter > 0) this.stunMeter = Math.max(0, this.stunMeter - 1.2);
    if (this.frozen > 0) { this.frozen--; if (!this.frozen && this.state === 'frozen') this.toStand(); return; }

    const dist = Math.abs(opp.x - this.x);
    const gap = dist - this.def.bodyHalf - opp.def.bodyHalf;
    const dir = this.cmd.dir;
    const pressed = this.cmd.pressed;
    this.guarding = !!(pad & B.BL) || dir === 4 || dir === 1 || dir === 7;
    this.blockLow = dir <= 3;
    const canAct = match.phase === 'fight' && this.alive;

    // face the opponent whenever standing on the ground
    if (CONTROL.has(this.state) && this.y === 0) {
      const f = opp.x >= this.x ? 1 : -1;
      if (f !== this.face) this.face = f;
    }

    switch (this.state) {
      case 'stand': case 'crouch': {
        if (!canAct) { this.vx = 0; this.idleAnim(); break; }
        if (this.tryAction(dir, pressed, pad, opp, gap, match)) break;
        // proximity block: hold back while the opponent is attacking nearby
        if ((pad & B.BL) || ((dir === 4 || dir === 1) && (opp.attacking || match.projectileThreat(this)) && gap < 120)) {
          this.state = 'block'; this.blockLow = dir <= 3; this.timer = 0; this.vx = 0;
          this.setAnim(this.blockLow ? 'crouchBlock' : 'block');
          break;
        }
        if (dir <= 3) {
          this.vx = 0;
          if (this.state !== 'crouch') { this.state = 'crouch'; this.setAnim('crouchDown'); }
          else if (this.animDone || this.anim !== this.anims.crouchDown) this.setAnim('crouch');
        } else {
          if (this.state === 'crouch') { this.state = 'stand'; this.setAnim('standUp'); }
          if (dir === 6) { this.vx = WALK_F * this.face; if (this.anim !== this.anims.standUp || this.animDone) this.setAnim('walkF'); }
          else if (dir === 4) { this.vx = -WALK_B * this.face; if (this.anim !== this.anims.standUp || this.animDone) this.setAnim('walkB'); }
          else { this.vx = 0; if (this.anim !== this.anims.standUp || this.animDone) this.setAnim('idle'); }
        }
        break;
      }
      case 'block': {
        this.vx *= 0.8;
        if (this.timer > 0) { this.timer--; break; }
        const holding = (pad & B.BL) || ((dir === 4 || dir === 1) && (opp.attacking || match.projectileThreat(this)) && gap < 130);
        if (!holding || !canAct) { this.toStand(); break; }
        const low = dir <= 3;
        if (low !== this.blockLow) { this.blockLow = low; this.setAnim(low ? 'crouchBlock' : 'block'); }
        if (canAct && pressed & (B.LP | B.HP | B.LK | B.HK) && !(pad & B.BL)) { this.toStand(); this.tryAction(dir, pressed, pad, opp, gap, match); }
        break;
      }
      case 'jump': {
        if (canAct && pressed & (B.LP | B.HP | B.LK | B.HK) && !this.jumpAttacked) {
          const kick = pressed & (B.LK | B.HK);
          const key = (kick ? 'jk' : 'jp') + (this.vx !== 0 ? 'F' : '');
          this.startMove(this.anims[key] ? key : kick ? 'jk' : 'jp', kick ? MOVES.jk : MOVES.jp, { air: true });
          this.jumpAttacked = true;
        }
        break;
      }
      case 'attack': case 'jumpattack': {
        if (this.state === 'attack') this.vx *= 0.7;
        // chain into a special from a normal (cancel), SF2 style
        if (canAct && this.state === 'attack' && this.hitCount && pressed) { const sp = this.cmd.special(this.def.specials); if (sp && this.startSpecial(sp, opp, match)) break; }
        if (this.state === 'attack' && this.animDone) this.toStand(dir <= 3);
        break;
      }
      case 'special': this.updateSpecial(opp, match); break;
      case 'hit': {
        this.vx *= 0.85;
        if (--this.timer <= 0) this.toStand(this.wasLow);
        break;
      }
      case 'launched': {
        if (this.y === 0 && this.vy <= 0 && this.timer-- <= 0) {
          this.state = 'down'; this.timer = this.alive ? 40 : 1e9; this.vx = 0;
          if (this.anims.lie && this.def.game === 'sf2') this.setAnim('lie');
          match.shake(4); match.sound('land', 1, this.def.game);
        }
        break;
      }
      case 'down': {
        this.vx *= 0.8;
        if (!this.alive) break;
        if (--this.timer <= 0) { this.state = 'getup'; this.setAnim('getup'); this.invuln = 30; }
        break;
      }
      case 'getup': { if (this.animDone) { this.invuln = 6; this.toStand(); } break; }
      case 'dizzy': { this.vx *= 0.8; if (--this.timer <= 0 && this.alive) this.toStand(); break; }
      case 'thrower': { this.vx = 0; if (this.animDone) this.toStand(); break; }
      case 'thrown': {
        this.timer--;
        const t = this.thrownBy;
        if (this.timer > 0) { this.x = t.x + t.face * 22; this.y = 18; break; }
        // land on the other side
        this.x = t.x - t.face * 30; this.y = 1;
        this.knockdown('launch', -t.face * -2.8, 4.5);
        break;
      }
      case 'pulled': {
        const t = this.pulledBy;
        const target = t.x + t.face * (t.def.bodyHalf + this.def.bodyHalf + 6);
        this.x += Math.sign(target - this.x) * Math.min(8, Math.abs(target - this.x));
        if (Math.abs(target - this.x) < 1) { this.state = 'dizzy'; this.timer = 70; this.setAnim('dizzy'); }
        break;
      }
      case 'win': { this.vx = 0; break; }
    }

    // physics
    if (this.state !== 'thrown' && this.state !== 'pulled') {
      this.x += this.vx;
      if (this.y > 0 || this.vy > 0) {
        this.y += this.vy; this.vy -= GRAVITY;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.land(match); }
      }
    }
    if (!(this.state === 'special' && this.special && this.special.freezeAnim)) this.stepAnim();
  }

  idleAnim() { if (this.state === 'crouch') this.setAnim('crouch'); else this.setAnim('idle'); }

  toStand(crouch = false) {
    this.state = crouch ? 'crouch' : 'stand';
    this.move = null; this.special = null; this.vx = 0;
    this.setAnim(crouch ? 'crouch' : 'idle');
  }

  land(match) {
    if (this.state === 'jump' || this.state === 'jumpattack') { this.state = 'stand'; this.move = null; this.vx = 0; this.setAnim('idle'); this.jumpAttacked = false; match.sound('land', 0.3, this.def.game); }
    else if (this.state === 'special') { this.specialLanded = true; }
    else if (this.state === 'launched') { this.vx *= 0.3; }
  }

  // Try specials, throws, jumps and attacks. Returns true when something started.
  tryAction(dir, pressed, pad, opp, gap, match) {
    const sp = pressed ? this.cmd.special(this.def.specials) : null;
    if (sp && this.startSpecial(sp, opp, match)) return true;
    // throw: forward (or back) + heavy punch when touching
    if ((pressed & B.HP) && (dir === 6 || dir === 4) && gap < THROW_GAP && this.canThrow(opp)) { this.doThrow(opp, match); return true; }
    if (dir >= 7) {
      this.state = 'jump'; this.vy = JUMP_VY; this.y = 0.01; this.jumpAttacked = false;
      this.vx = dir === 9 ? JUMP_VX * this.face : dir === 7 ? -JUMP_VX * this.face : 0;
      this.setAnim(dir === 8 ? 'jumpUp' : dir === 9 ? 'jumpF' : 'jumpB');
      match.sound('jump', 0.5, this.def.game);
      return true;
    }
    if (!(pressed & (B.LP | B.HP | B.LK | B.HK))) return false;
    const btn = pressed & B.HP ? 'hp' : pressed & B.HK ? 'hk' : pressed & B.LP ? 'lp' : 'lk';
    let key = btn;
    if (dir <= 3) key = 'c' + btn;
    else if (gap < CLOSE && (btn === 'hp' || btn === 'hk')) key = btn === 'hp' ? 'closeHp' : 'closeHk';
    if (this.def.game === 'mk' && dir === 4 && btn === 'lk' && this.anims.sweep) key = 'sweep';
    if (this.def.game === 'mk' && dir === 4 && btn === 'hk' && this.anims.roundhouse) key = 'roundhouse';
    if (!this.anims[key]) key = btn;
    this.startMove(key, MOVES[key] || MOVES[btn], { crouch: dir <= 3 });
    return true;
  }

  startMove(key, data, opts = {}) {
    this.move = { key, hit: data.hit, crouch: !!opts.crouch, hitDone: false };
    this.hitCount = 0;
    this.state = opts.air ? 'jumpattack' : 'attack';
    this.setAnim(key);
    if (!opts.air) this.vx = 0;
    this.pendingSwing = true;
  }

  canThrow(opp) {
    return opp.y === 0 && opp.invuln === 0 && ['stand', 'crouch', 'block', 'attack'].includes(opp.state) && opp.alive;
  }

  doThrow(opp, match) {
    this.state = 'thrower'; this.vx = 0;
    this.setAnim('throw');
    opp.state = 'thrown'; opp.timer = 24; opp.thrownBy = this; opp.move = null;
    opp.setAnim('thrown');
    opp.takeDamage(120, match, this);
    match.sound('throw', 1, this.def.game);
  }

  // ------------------------------------------------------------ specials --
  startSpecial(sp, opp, match) {
    if (sp.kind === 'projectile' && this.projectile) return false;
    this.state = 'special'; this.special = sp; this.timer = 0; this.specialLanded = false;
    this.move = { key: sp.name, hit: sp.hit, special: sp, hitDone: false };
    this.hitCount = 0; this.spawned = false; this.phase = 0;
    this.vx = 0;
    match.announceSpecial(this, sp);
    switch (sp.kind) {
      case 'rising':
        this.vy = 7.2; this.y = 0.01; this.vx = 1.4 * this.face; this.invuln = sp.invuln || 0;
        this.setAnim(sp.animData); break;
      case 'spin':
        this.setAnim(sp.startData || sp.animData); this.phase = sp.startData ? 0 : 1;
        if (sp.air) { this.vy = 2.5; this.y = 0.01; }
        break;
      case 'teleport':
        this.setAnim(sp.animData); this.invuln = 30; break;
      default:
        this.setAnim(sp.startData || sp.animData); this.phase = sp.startData ? 0 : 1;
    }
    return true;
  }

  updateSpecial(opp, match) {
    const sp = this.special;
    this.timer++;
    switch (sp.kind) {
      case 'projectile': {
        const spawnAt = Math.min(sp.spawn ?? 2, sp.animData.frames.length - 1);
        if (!this.spawned && (this.fi >= spawnAt || this.animDone)) { this.spawned = true; match.spawnProjectile(this, sp); }
        if (this.animDone && this.timer > 10) this.toStand();
        break;
      }
      case 'rising':
        if (this.specialLanded || (this.y === 0 && this.timer > 10)) { this.toStand(); this.state = 'stand'; }
        break;
      case 'spin': case 'dash': case 'flurry': {
        if (this.phase === 0) { if (this.animDone) { this.phase = 1; this.setAnim(sp.animData); } break; }
        if (this.phase === 1) {
          if (sp.kind !== 'flurry') this.vx = (sp.speed || 2) * this.face;
          if (sp.air && this.y < 22 && sp.kind === 'spin') { this.y = Math.max(this.y, 0.01); this.vy = Math.max(this.vy, 0.6); }
          if (sp.multi || (sp.hit && sp.hit.multi)) { if (this.timer % 10 === 0) this.move.hitDone = false; }
          if (this.timer >= (sp.dur || 30)) {
            this.phase = 2; this.vx = 0;
            if (sp.endData) this.setAnim(sp.endData); else { this.toStand(); break; }
          }
          break;
        }
        if (this.animDone && this.y === 0) this.toStand();
        break;
      }
      case 'grab': {
        if (this.timer === 1) {
          const gap = Math.abs(opp.x - this.x) - this.def.bodyHalf - opp.def.bodyHalf;
          if (gap < (sp.range || 30) && this.canThrow(opp)) {
            opp.state = 'thrown'; opp.timer = 40; opp.thrownBy = this; opp.setAnim('thrown');
            opp.takeDamage(sp.hit.dmg, match, this); match.shake(8); match.sound('throw', 1, this.def.game); match.sound('hitHeavy', 1, this.def.game);
            this.vy = 5; this.y = 0.01;
          }
        }
        if (this.animDone && this.y === 0) this.toStand();
        break;
      }
      case 'teleport': {
        if (this.animDone && this.phase === 0) {
          this.phase = 1;
          this.x = opp.x - opp.face * (opp.def.bodyHalf + this.def.bodyHalf + 10);
          this.face = opp.x >= this.x ? 1 : -1;
          match.clampFighter(this);
          if (sp.endData) this.setAnim(sp.endData);
          if (sp.attack) { this.startMove('closeHp', { hit: sp.hit }); return; }
          if (!sp.endData) { this.toStand(); break; }
        }
        if (this.phase === 1 && this.animDone) this.toStand();
        break;
      }
      case 'flame':
      default:
        if (this.animDone) this.toStand();
    }
  }

  // ---------------------------------------------------------- hit boxes --
  // Box of the current frame in world coordinates (y downwards from the ground line).
  worldBox(r, ground) {
    const oy = ground - this.def.foot - this.y;
    return this.face > 0
      ? { x0: this.x + r.x0, x1: this.x + r.x1, y0: oy + r.y0, y1: oy + r.y1 }
      : { x0: this.x - r.x1, x1: this.x - r.x0, y0: oy + r.y0, y1: oy + r.y1 };
  }

  hurtBox(ground) {
    if (this.state === 'down' || this.state === 'thrown' || this.state === 'win') return null;
    const b = this.frame.box;
    const w = b.x1 - b.x0, m = w * 0.18;
    return this.worldBox({ x0: b.x0 + m, x1: b.x1 - m, y0: b.y0 + 4, y1: b.y1 }, ground);
  }

  attackBox(ground) {
    const m = this.move;
    if (!m || !m.hit || m.hitDone) return null;
    if (this.state !== 'attack' && this.state !== 'jumpattack' && this.state !== 'special') return null;
    const f = this.frame;
    const sp = m.special;
    if (sp) {
      if (sp.kind === 'projectile' || sp.kind === 'teleport' || sp.kind === 'grab') return null;
      // moves that hit with the whole body
      if (['spin', 'dash', 'flurry', 'rising'].includes(sp.kind)) {
        if (sp.kind === 'rising' && this.vy < 0 && this.timer > 14) return null;
        if (this.phase === 0 && sp.kind !== 'rising') return null;
        const b = f.reach && sp.kind === 'flurry' ? f.reach : f.box;
        const x0 = sp.kind === 'flurry' && f.reach ? b.x0 : (b.x0 + b.x1) / 2;
        return this.worldBox({ x0, x1: b.x1 + 4, y0: b.y0, y1: b.y1 }, ground);
      }
    }
    if (!f.active || !f.reach) return null;
    return this.worldBox(f.reach, ground);
  }

  // ------------------------------------------------------------- damage --
  takeDamage(n, match, from) {
    this.hp = Math.max(0, this.hp - n);
    if (this.hp === 0) match.onKO(this, from);
  }

  // Being hit by `hit` from `att` (a fighter or a projectile's owner).
  receive(hit, att, match, opts = {}) {
    if (this.invuln > 0 || this.state === 'thrown' || this.state === 'down' || !this.alive && this.state !== 'dizzy') return 'miss';
    const fromDir = opts.fromX !== undefined ? Math.sign(opts.fromX - this.x) || -this.face : Math.sign(att.x - this.x) || -this.face;
    const backHeld = this.guarding && (this.state !== 'attack' && this.state !== 'jumpattack' && this.state !== 'special');
    const canBlock = backHeld && this.y === 0 && ['stand', 'crouch', 'block'].includes(this.state) && fromDir === this.face;
    const low = this.blockLow;
    const blocked = canBlock && !(hit.level === 'low' && !low) && !(hit.level === 'air' && low && this.def.game === 'sf2' && att.def.game === 'sf2');
    if (blocked) {
      this.state = 'block'; this.timer = hit.block || 10;
      this.setAnim(low ? 'crouchBlock' : 'block');
      this.vx = -fromDir * (hit.push || 3) * 0.8;
      const chip = opts.special ? Math.round(hit.dmg / 8) : 0;
      if (chip) this.takeDamage(chip, match, att);
      return 'block';
    }
    this.combo = (match.tick - this.lastHitTick < 40 && this.state === 'hit') ? this.combo + 1 : 1;
    this.lastHitTick = match.tick;
    const scale = this.combo > 2 ? 0.75 : 1;
    this.takeDamage(Math.round(hit.dmg * scale), match, att);
    this.flash = 6;
    if (match.phase === 'finish' && this.state === 'dizzy' && this.alive) return 'hit';
    this.stunMeter += hit.dmg;
    this.move = null; this.special = null;
    if (hit.freeze && this.alive) { this.state = 'frozen'; this.frozen = hit.stun; this.vx = 0; return 'hit'; }
    if (hit.pull && this.alive && this.y === 0) { this.state = 'pulled'; this.pulledBy = att; this.vx = 0; this.setAnim('hitHigh'); return 'hit'; }
    if (!this.alive) { this.knockdown('launch', -fromDir * 2.2, 5.5); return 'hit'; }
    if (hit.kd || this.y > 0) {
      if (hit.kd === 'sweep' && this.y === 0) this.knockdown('sweep', -fromDir * 0.8, 0);
      else this.knockdown('launch', -fromDir * (hit.kd === 'launch' ? 1.6 : 2.4), hit.kd === 'launch' ? 6.5 : 4.5);
      return 'hit';
    }
    if (this.stunMeter > 420) { this.stunMeter = 0; this.state = 'dizzy'; this.timer = 150; this.setAnim('dizzy'); this.vx = -fromDir * 2; match.text('DIZZY', this); return 'hit'; }
    this.wasLow = this.crouching;
    this.state = 'hit'; this.timer = hit.stun || 16;
    this.setAnim(this.wasLow ? 'hitLow' : hit.dmg >= 90 ? 'hitHeavy' : 'hitHigh');
    this.vx = -fromDir * (hit.push || 3);
    return 'hit';
  }

  knockdown(kind, vx, vy) {
    this.move = null; this.special = null; this.frozen = 0;
    this.state = 'launched'; this.timer = 0;
    this.vx = vx;
    if (kind === 'sweep') { this.vy = 2.4; this.y = Math.max(this.y, 0.01); this.setAnim('sweepFall'); return; }
    this.vy = vy; this.y = Math.max(this.y, 0.01);
    this.setAnim('launch');
    if (this.def.game === 'sf2') this.fallAnimNext = true;
  }
}

export { CLOSE };
