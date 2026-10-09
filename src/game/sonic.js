// Sonic plugin: replaces Mario's movement with Sonic-style physics and
// records what Sonic should look like each frame. Everything else (blocks,
// enemies, pipes, flagpoles, scoring) is still SMB's own code.

import { HOOK_CONTINUE, HOOK_RTS } from '../nes/cpu6502.js';
import { L, R } from '../smb/symbols.js';
import { FR } from '../rom/sonicRom.js';

// Sonic 1 physics (pixels/frame) scaled to the NES screen, which is 256 px
// wide instead of 320. Scaling speeds and accelerations by the same factor
// keeps Sonic's jump timing and makes his jumps proportionally as high.
const S = 0.75;
export const PHYS = {
  acc: 0.046875 * S,
  dec: 0.5 * S,
  frc: 0.046875 * S,
  top: 6 * S,
  airAcc: 0.09375 * S,
  grav: 0.21875 * S,
  jump: 6.5 * S,
  jumpRelease: 4 * S,
  rollFrc: 0.0234375 * S,
  rollDec: 0.125 * S,
  rollMin: 1.03125 * S,
  unroll: 0.5 * S,
  rollTop: 12 * S,
  maxFall: 8,
  skid: 4 * S,
  spinBase: 8 * S,
};

const s8 = v => (v << 24) >> 24;
const SUBSTEP_X = 2, SUBSTEP_Y = 4;

// Enemies a spinning Sonic destroys on contact (others still hurt him)
function ballKillable(id) {
  if (id === 0x33) return true; // cannon bullet bill
  if (id >= 0x15) return false; // bowser, flames, platforms, ...
  return id !== 0x0c && id !== 0x0d && id !== 0x12; // podoboo, piranha plant, spiny
}

export class SonicPlugin {
  constructor() {
    this.vx = 0; this.vy = 0; this.fx = 0; this.fy = 0;
    this.lastX = -1; this.lastY = -1; this.lastXs = -1; this.lastYs = -1; this.lastYmf = -1;
    this.rolling = false; this.ball = false; this.jumping = false; this.ducking = false;
    this.spindash = false; this.spinRev = 0;
    this.skidding = false; this.pushing = false; this.springing = false;
    this.prevRaw = 0;
    this.native = false;
    this.anim = { frame: FR.Stand, timer: 0, idx: 0, idle: 0, key: '' };
    this.pending = null;      // Sonic as drawn by the game logic this frame
    this.display = null;      // Sonic as displayed (latched with OAM DMA)
    this.lookahead = 0;
    this.events = [];         // sound events for the audio layer
  }

  install(core) {
    this.core = core;
    const m = core.m, cpu = m.cpu, ram = m.ram;
    this.ram = ram; this.cpu = cpu;
    const H = (label, fn) => cpu.hooks.set(L[label], fn);

    // 1. Movement: Sonic physics while the player is in normal control
    H('PlayerMovementSubs', () => {
      if (!this.nativeAllowed()) { this.native = false; return HOOK_CONTINUE; }
      if (!this.native) this.enterNative();
      this.native = true;
      this.step();
      return HOOK_RTS;
    });

    // 2. Sonic is always two blocks tall (big Mario's hitbox), whether or not
    //    he has a shield. Shield = SMB's "big" state for damage and bricks.
    let inBg = false, savedSize = 0;
    H('PlayerBGCollision', () => {
      if (inBg) return HOOK_CONTINUE;
      inBg = true; savedSize = ram[R.PlayerSize];
      ram[R.PlayerSize] = 0;
      cpu.call(L.PlayerBGCollision, true);
      ram[R.PlayerSize] = savedSize;
      inBg = false;
      return HOOK_RTS;
    });
    H('PlayerHeadCollision', () => {
      if (!inBg) return HOOK_CONTINUE;
      const forced = ram[R.PlayerSize];
      ram[R.PlayerSize] = savedSize; // real size decides bump vs. break
      cpu.call(L.PlayerHeadCollision, true);
      ram[R.PlayerSize] = forced;
      return HOOK_RTS;
    });
    // ...but the bumped block's position must come from Sonic's (big) head
    const bumpY = () => { cpu.y = ram[R.CrouchingFlag] ? 1 : 0; };
    H('SmallBP', () => { bumpY(); cpu.skipHookAt = L.BigBP; return L.BigBP; });
    H('BigBP', () => { bumpY(); return HOOK_CONTINUE; });
    H('FirebarCollision', () => {
      const size = ram[R.PlayerSize];
      ram[R.PlayerSize] = 0;
      cpu.call(L.FirebarCollision, true);
      ram[R.PlayerSize] = size;
      return HOOK_RTS;
    });
    H('ChkMoveDir', () => { // Y = bounding box control (0 big, 2 crouching)
      cpu.y = ram[R.CrouchingFlag] ? 2 : 0;
      return HOOK_CONTINUE;
    });

    // 3. Spinning Sonic destroys most enemies on contact
    H('EColl', () => {
      if (this.ballAttack() && ballKillable(ram[R.Enemy_ID + cpu.x]) && ram[R.StarInvincibleTimer] === 0) {
        this.events.push('pop');
        return L.ShellOrBlockDefeat;
      }
      return HOOK_CONTINUE;
    });

    // 4. Camera with look-ahead for high speeds
    H('ScrollHandler', () => this.scrollHandler());

    // 5. Keep the level renderer ahead of a fast-moving screen
    H('UpdScrollVar', () => this.updScrollVar());

    // 6. Graphics: let SMB draw Mario (it drives timers and blink logic),
    //    then remember where he was so the renderer can draw Sonic instead.
    H('PlayerGfxHandler', () => {
      const off = ram[R.Player_SprDataOffset];
      for (let i = 0; i < 8; i++) ram[0x200 + off + i * 4] = 0xf8;
      cpu.call(L.PlayerGfxHandler, true);
      const slots = [];
      for (let i = 0; i < 8; i++) {
        const o = 0x200 + off + i * 4;
        if (ram[o] !== 0xf8) slots.push([(off >> 2) + i, ram[o], ram[o + 1], ram[o + 2], ram[o + 3]]);
      }
      this.animate();
      this.pending = slots.length ? { slots, ...this.drawState() } : this.pendingIfOffscreen(slots);
      return HOOK_RTS;
    });
    H('DrawPlayer_Intermediate', () => {
      cpu.call(L.DrawPlayer_Intermediate, true);
      const slots = [];
      for (let i = 1; i <= 8; i++) slots.push([i, ram[0x200 + i * 4], ram[0x201 + i * 4], ram[0x202 + i * 4], ram[0x203 + i * 4]]);
      this.pending = { slots, x: 0x60, y: 0x58, facing: 1, frame: FR.Stand, behind: false, ball: false, shield: 0, stars: -1, standing: true };
      return HOOK_RTS;
    });
    m.onOamDma = () => this.latch();

    // 7. "MARIO" / "LUIGI" -> "SONIC" in all text
    patchText(m.prg);
  }

  // Sonic leaves via the bottom of the screen without OAM sprites; keep drawing.
  pendingIfOffscreen() { return null; }

  latch() {
    const p = this.pending, oam = this.core.m.oam;
    this.display = null;
    if (!p) return;
    // only show Sonic while Mario's sprites are still in OAM where SMB put them
    const still = p.slots.every(([i, y, t, a, x]) => oam[i * 4] === y && oam[i * 4 + 1] === t && oam[i * 4 + 2] === a && oam[i * 4 + 3] === x);
    if (still) this.display = p;
  }

  nativeAllowed() {
    const r = this.ram;
    if (r[R.OperMode] !== 1) return false;       // title-screen demo uses Mario physics
    const ges = r[R.GameEngineSubroutine];
    if (ges !== 0x08 && ges !== 0x0a) return false; // automatic sequences use SMB physics
    if (r[R.SwimmingFlag]) return false;          // swimming uses SMB's swim physics
    if (r[R.Player_State] === 3) return false;    // climbing vines / flagpole
    return true;
  }

  enterNative() {
    const r = this.ram;
    this.vx = s8(r[R.Player_X_Speed]) / 16;
    this.vy = s8(r[R.Player_Y_Speed]) + r[R.Player_Y_MoveForce] / 256;
    this.fx = 0; this.fy = 0;
    this.rolling = false; this.spindash = false; this.ducking = false;
    this.ball = r[R.Player_State] === 1 && this.ball;
    this.jumping = false;
    this.syncWritten();
  }

  syncWritten() {
    const r = this.ram;
    this.lastX = r[R.Player_PageLoc] * 256 + r[R.Player_X_Position];
    this.lastY = r[R.Player_Y_HighPos] * 256 + r[R.Player_Y_Position];
    this.lastXs = r[R.Player_X_Speed]; this.lastYs = r[R.Player_Y_Speed]; this.lastYmf = r[R.Player_Y_MoveForce];
  }

  ballAttack() {
    if (!this.native || !this.ball || this.ram[R.AreaType] === 0) return false;
    // falling onto an enemy keeps SMB's stomp (bounce + combo points)
    if (this.ram[R.Player_State] !== 0 && this.vy > 0) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  step() {
    const r = this.ram, P = PHYS;
    const raw = r[R.SavedJoypadBits];
    const left = (raw & 2) !== 0, right = (raw & 1) !== 0, down = (raw & 4) !== 0, up = (raw & 8) !== 0;
    const jumpHeld = (raw & 0x80) !== 0, jumpPressed = jumpHeld && !(this.prevRaw & 0x80);
    this.prevRaw = raw;

    let launched = false;
    // adopt anything SMB changed since our last write (walls, bounces, springs, platforms)
    const curX = r[R.Player_PageLoc] * 256 + r[R.Player_X_Position];
    const curY = r[R.Player_Y_HighPos] * 256 + r[R.Player_Y_Position];
    if (curX !== this.lastX) this.fx = 0;
    if (curY !== this.lastY) this.fy = 0;
    if (r[R.Player_X_Speed] !== this.lastXs) this.vx = s8(r[R.Player_X_Speed]) / 16;
    if (r[R.Player_Y_Speed] !== this.lastYs || r[R.Player_Y_MoveForce] !== this.lastYmf) {
      const nvy = s8(r[R.Player_Y_Speed]) + r[R.Player_Y_MoveForce] / 256;
      if (nvy < -1 && this.vy >= -0.5) {
        // launched upward by SMB: enemy stomp bounce or a jumpspring
        if (r[R.JumpspringAnimCtrl] || nvy < -6) {
          // jumpspring: SMB's launch speeds assume Mario's heavier spring gravity;
          // rescale so the spring sends Sonic to the same height
          this.springing = true; this.ball = false; this.jumping = false; this.vy = nvy * 0.62;
        }
        else { this.vy = jumpHeld ? nvy * 1.3 : nvy; this.ball = true; this.jumping = true; }
        launched = true;
        if (r[R.Player_State] === 0) r[R.Player_State] = 2;
      } else this.vy = nvy;
    }

    let grounded = r[R.Player_State] === 0;
    if (grounded) { this.springing = false; }

    if (grounded) {
      this.jumping = false;
      if (!this.rolling && !this.spindash) this.ball = false;

      if (this.spindash) {
        // Spin dash (from Sonic 2): hold down, tap jump to rev, release down to go
        this.vx = 0;
        if (jumpPressed) { this.spinRev = Math.min(this.spinRev + 2, 8); this.events.push('rev'); }
        this.spinRev -= this.spinRev / 32;
        if (!down) {
          this.spindash = false;
          this.rolling = true; this.ball = true;
          const dir = r[R.PlayerFacingDir] === 2 ? -1 : 1;
          this.vx = dir * (P.spinBase + Math.floor(this.spinRev) / 2 * S);
          this.events.push('dash');
        }
      } else if (this.rolling) {
        if (left && this.vx > 0) this.vx = Math.max(0, this.vx - P.rollDec);
        else if (right && this.vx < 0) this.vx = Math.min(0, this.vx + P.rollDec);
        this.vx -= Math.sign(this.vx) * Math.min(Math.abs(this.vx), P.rollFrc);
        this.vx = Math.max(-P.rollTop, Math.min(P.rollTop, this.vx));
        if (Math.abs(this.vx) < P.unroll) { this.rolling = false; this.ball = false; }
      } else {
        this.skidding = false;
        if (left && !this.ducking) {
          if (this.vx > 0) { this.vx -= P.dec; if (this.vx <= 0) this.vx = -0.5 * S; if (this.vx >= P.skid) this.skidding = true; }
          else if (this.vx > -P.top) this.vx = Math.max(this.vx - P.acc, -P.top);
        } else if (right && !this.ducking) {
          if (this.vx < 0) { this.vx += P.dec; if (this.vx >= 0) this.vx = 0.5 * S; if (this.vx <= -P.skid) this.skidding = true; }
          else if (this.vx < P.top) this.vx = Math.min(this.vx + P.acc, P.top);
        } else {
          this.vx -= Math.sign(this.vx) * Math.min(Math.abs(this.vx), P.frc);
        }
        if (left && this.vx > 0.01 && this.vx < 3.9 * S) this.skidding = this.skidding || this.vx > 2 * S;
        if (right && this.vx < -0.01 && this.vx > -3.9 * S) this.skidding = this.skidding || this.vx < -2 * S;

        this.ducking = false;
        if (down && !left && !right) {
          if (Math.abs(this.vx) >= P.rollMin) { this.rolling = true; this.ball = true; this.events.push('roll'); }
          else this.ducking = Math.abs(this.vx) < 0.25;
        }
        if (this.ducking && jumpPressed && !r[R.JumpspringAnimCtrl]) {
          this.spindash = true; this.spinRev = 0; this.ball = true; this.events.push('rev');
        }
      }

      if (jumpPressed && !this.spindash && !this.ducking && !r[R.JumpspringAnimCtrl]) {
        this.vy = -P.jump;
        this.jumping = true; this.ball = true; this.rolling = false; this.skidding = false;
        r[R.Player_State] = 1; grounded = false;
        r[R.JumpSwimTimer] = 0x20;
        r[R.JumpOrigin_Y_Position] = r[R.Player_Y_Position];
        r[R.JumpOrigin_Y_HighPos] = r[R.Player_Y_HighPos];
        this.events.push('jump');
      }
    } else {
      this.rolling = false; this.spindash = false; this.ducking = false; this.skidding = false;
      if (left && this.vx > -P.top) this.vx = Math.max(this.vx - P.airAcc, -P.top);
      if (right && this.vx < P.top) this.vx = Math.min(this.vx + P.airAcc, P.top);
      if (this.vy < 0 && this.vy > -4 * S && Math.abs(this.vx) >= 0.125 * S) this.vx -= this.vx / 32;
      if (this.jumping && !jumpHeld && this.vy < -P.jumpRelease) this.vy = -P.jumpRelease;
      this.vy = Math.min(this.vy + P.grav, P.maxFall);
    }

    // facing
    if (!this.rolling && !this.spindash) {
      if (left && !right) r[R.PlayerFacingDir] = 2;
      else if (right && !left) r[R.PlayerFacingDir] = 1;
    } else if (this.vx !== 0 && !this.spindash) r[R.PlayerFacingDir] = this.vx < 0 ? 2 : 1;

    r[R.CrouchingFlag] = (grounded && (this.rolling || this.ducking || this.spindash)) ? 1 : 0;

    this.move(grounded);
  }

  move(grounded) {
    const r = this.ram;
    let x = r[R.Player_PageLoc] * 256 + r[R.Player_X_Position] + this.fx;
    let y = r[R.Player_Y_HighPos] * 256 + r[R.Player_Y_Position] + this.fy;
    const x0 = Math.floor(x);
    const dyTotal = grounded ? 0 : this.vy;
    const n = Math.max(1, Math.ceil(Math.abs(this.vx) / SUBSTEP_X), Math.ceil(Math.abs(dyTotal) / SUBSTEP_Y));
    let dx = this.vx / n, dy = dyTotal / n;
    const ges0 = r[R.GameEngineSubroutine];
    this.pushing = false;

    for (let i = 0; i < n; i++) {
      x += dx; y += dy;
      this.writePos(x, y);
      this.writeSpeeds();
      const before = { xs: r[R.Player_X_Speed], ys: r[R.Player_Y_Speed], st: r[R.Player_State] };
      this.cpu.call(L.PlayerBGCollision);
      // read back what the collision code did
      const nx = r[R.Player_PageLoc] * 256 + r[R.Player_X_Position];
      const ny = r[R.Player_Y_HighPos] * 256 + r[R.Player_Y_Position];
      if (nx !== Math.floor(x)) x = nx;
      if (ny !== Math.floor(y)) y = ny;
      if (r[R.Player_X_Speed] !== before.xs) {
        // hit a wall
        if (Math.abs(this.vx) > 0 && r[R.Player_X_Speed] === 0) { this.pushing = true; }
        this.vx = s8(r[R.Player_X_Speed]) / 16; dx = 0;
        if (this.rolling && Math.abs(this.vx) < PHYS.unroll) { /* keep rolling state until friction stops it */ }
      }
      if (r[R.Player_Y_Speed] !== before.ys) {
        this.vy = s8(r[R.Player_Y_Speed]) + r[R.Player_Y_MoveForce] / 256; dy = 0;
      }
      if (before.st !== 0 && r[R.Player_State] === 0 && dy >= 0) {
        // landed
        this.vy = 0; dy = 0; y = ny;
        this.jumping = false;
        if (!this.rolling) this.ball = false;
      }
      if (r[R.GameEngineSubroutine] !== ges0 || r[R.Player_State] === 3) break; // pipe, flagpole, vine...
    }
    if (r[R.Player_State] !== 0 && !this.jumping && grounded && this.vy === 0) {
      // walked off a ledge
      this.vy = 0;
    }
    this.fx = x - Math.floor(x); this.fy = y - Math.floor(y);
    if (this.fy < 0) this.fy = 0;
    this.writePos(x, y);
    this.writeSpeeds();
    if (r[R.Player_State] === 0) { r[R.Player_Y_Speed] = 0; r[R.Player_Y_MoveForce] = 0; }
    const moved = Math.floor(x) - x0;
    r[R.Player_X_Scroll] = Math.max(-127, Math.min(127, moved)) & 0xff;
    // pushing against a wall while holding toward it
    const raw = r[R.SavedJoypadBits];
    if (r[R.Player_State] === 0 && ((raw & 1 && r[R.PlayerFacingDir] === 1) || (raw & 2 && r[R.PlayerFacingDir] === 2)) && r[R.SideCollisionTimer]) this.pushing = true;
    this.syncWritten();
  }

  writePos(x, y) {
    const r = this.ram;
    const xi = Math.floor(x), yi = Math.floor(y);
    r[R.Player_X_Position] = xi & 0xff; r[R.Player_PageLoc] = (xi >> 8) & 0xff;
    r[R.Player_Y_Position] = yi & 0xff; r[R.Player_Y_HighPos] = (yi >> 8) & 0xff;
  }

  writeSpeeds() {
    const r = this.ram;
    const xs = Math.max(-127, Math.min(127, Math.trunc(this.vx * 16)));
    r[R.Player_X_Speed] = xs & 0xff;
    r[R.Player_X_MoveForce] = 0;
    r[R.Player_XSpeedAbsolute] = Math.min(0x7f, Math.abs(xs));
    const vyi = Math.floor(this.vy);
    r[R.Player_Y_Speed] = vyi & 0xff;
    r[R.Player_Y_MoveForce] = Math.floor((this.vy - vyi) * 256) & 0xff;
  }

  // ---------------------------------------------------------------------------
  // SMB's ScrollHandler, with a look-ahead so a fast Sonic can see further.
  scrollHandler() {
    const r = this.ram;
    if (!this.native) { this.lookahead = 0; return HOOK_CONTINUE; }
    r[R.Player_X_Scroll] = (r[R.Player_X_Scroll] + r[R.Platform_X_Scroll]) & 0xff;
    const speed = Math.abs(this.vx);
    const want = Math.max(0, Math.min(1, (speed - 2.5) / (PHYS.top - 2.5))) * 0x28;
    if (this.vx > 0 && want > this.lookahead) this.lookahead = Math.min(want, this.lookahead + 0.5);
    else if (want < this.lookahead) this.lookahead = Math.max(want, this.lookahead - 0.25);
    const target = Math.round(0x70 - this.lookahead);

    const pos = r[R.Player_Pos_ForScroll];
    if (r[R.ScrollLock] || pos < 0x50 || r[R.SideCollisionTimer]) return L.InitScrlAmt;
    const move = s8(r[R.Player_X_Scroll]);
    if (move <= 0) return L.InitScrlAmt;
    let amt;
    if (pos < target) amt = move >= 2 ? move - 1 : move;
    else amt = move + Math.min(3, Math.ceil((pos - target) / 6));
    this.cpu.y = Math.min(amt, 16);
    return L.ScrollScreen;
  }

  // SMB renders one metatile column per 4 frames; at Sonic speeds the
  // screen can outrun it, so run extra parser tasks when we fall behind.
  updScrollVar() {
    const r = this.ram, cpu = this.cpu;
    for (let iter = 0; iter < 24; iter++) {
      if (r[R.VRAM_Buffer_AddrCtrl] === 6) {
        if (iter === 0) return HOOK_RTS;
        this.flushVramBuffer2();
      }
      if (r[R.AreaParserTaskNum] === 0) {
        if (s8(r[R.ScrollThirtyTwo]) < 0x20) break;
        r[R.ScrollThirtyTwo] = (r[R.ScrollThirtyTwo] - 0x20) & 0xff;
        r[R.VRAM_Buffer2_Offset] = 0;
      }
      cpu.call(L.AreaParserTaskHandler);
      if (s8(r[R.ScrollThirtyTwo]) < 0x20) break; // not lagging: one task per frame like SMB
    }
    return HOOK_RTS;
  }

  flushVramBuffer2() {
    const r = this.ram, m = this.core.m;
    let p = R.VRAM_Buffer2;
    while (r[p]) {
      let addr = (r[p] << 8) | r[p + 1];
      const ctl = r[p + 2];
      const inc = ctl & 0x80 ? 32 : 1, rep = ctl & 0x40;
      const len = (ctl & 0x3f) || 64;
      p += 3;
      for (let i = 0; i < len; i++) {
        m.vramWrite(addr & 0x3fff, r[rep ? p : p + i]);
        addr += inc;
      }
      p += rep ? 1 : len;
    }
    r[R.VRAM_Buffer2] = 0;
    r[R.VRAM_Buffer2_Offset] = 0;
    r[R.VRAM_Buffer_AddrCtrl] = 0;
  }

  // ---------------------------------------------------------------------------
  animate() {
    const r = this.ram, a = this.anim;
    const ges = r[R.GameEngineSubroutine];
    const state = r[R.Player_State];
    const speed = this.native ? Math.abs(this.vx) : Math.abs(s8(r[R.Player_X_Speed]) / 16);
    const sp = speed / S; // speed in Sonic-1 units
    let key, frames, delay;
    const raw = r[R.SavedJoypadBits];
    const nativeBall = this.native && this.ball;
    if (ges === 0x0b) { key = 'death'; frames = [FR.Death]; delay = 99; }
    else if (r[R.PlayerChangeSizeFlag] && r[R.PlayerSize] === 1) { key = 'hurt'; frames = [FR.Injury]; delay = 99; }
    else if (state === 3) {
      key = 'hang'; frames = [FR.Hang1, FR.Hang2];
      delay = s8(r[R.Player_Y_Speed]) !== 0 && ges !== 4 ? 7 : 999;
    } else if (r[R.SwimmingFlag] && state !== 0) { key = 'swim'; frames = FR.Float; delay = 7; }
    else if (nativeBall || (!this.native && state === 1 && ges === 8 && !r[R.SwimmingFlag])) {
      key = 'roll'; frames = FR.Roll; delay = Math.max(0, 4 - Math.floor(sp));
      if (this.spindash) delay = 0;
    } else if (this.springing && state !== 0) { key = 'spring'; frames = [FR.Spring]; delay = 99; }
    else if (state === 0 || !this.native) {
      if (this.native && this.skidding) { key = 'skid'; frames = [FR.Stop1, FR.Stop2]; delay = 7; }
      else if (this.native && this.ducking) { key = 'duck'; frames = [FR.Duck]; delay = 99; }
      else if (this.native && this.pushing && speed < 0.5) { key = 'push'; frames = FR.Push; delay = 15; }
      else if (speed < 0.05 && state === 0) {
        if (this.native && (raw & 8)) { key = 'up'; frames = [FR.LookUp]; delay = 99; }
        else {
          a.idle++;
          if (a.idle > 180) { key = 'wait'; frames = [FR.Wait2, FR.Wait1, FR.Wait1, FR.Wait1, FR.Wait2, FR.Wait3, FR.Wait2, FR.Wait3]; delay = 23; }
          else { key = 'stand'; frames = [FR.Stand]; delay = 99; }
        }
      } else if (sp >= 6) { key = 'run'; frames = FR.Run; delay = Math.max(0, 8 - Math.floor(sp)); }
      else { key = 'walk'; frames = FR.Walk; delay = Math.max(0, 8 - Math.floor(sp)); }
    } else { key = 'walk'; frames = FR.Walk; delay = Math.max(0, 8 - Math.floor(sp)); }
    if (key !== 'stand' && key !== 'wait') a.idle = 0;
    if (key !== a.key) {
      const keepPhase = (key === 'walk' && a.key === 'run') || (key === 'run' && a.key === 'walk');
      a.key = key; a.timer = 0; if (!keepPhase) a.idx = 0;
    } else if (++a.timer > delay) { a.timer = 0; a.idx++; }
    a.frame = frames[a.idx % frames.length];
  }

  drawState() {
    const r = this.ram;
    const yScreen = (r[R.Player_Y_HighPos] - 1) * 256 + r[R.Player_Y_Position];
    const fiery = r[R.PlayerStatus] === 2;
    return {
      x: r[R.Player_Rel_XPos], y: yScreen,
      facing: r[R.PlayerFacingDir] === 2 ? -1 : 1,
      frame: this.anim.frame,
      behind: (r[R.Player_SprAttrib] & 0x20) !== 0,
      ball: this.anim.key === 'roll',
      grounded: r[R.Player_State] === 0,
      shield: r[R.PlayerStatus] === 0 ? 0 : (fiery ? 2 : 1),
      stars: r[R.StarInvincibleTimer] ? this.core.frameCount : -1,
      sizeChange: r[R.PlayerChangeSizeFlag] ? this.core.frameCount : -1,
      dead: r[R.GameEngineSubroutine] === 0x0b,
      tick: this.core.frameCount,
    };
  }
}

// ----------------------------------------------------------------------------
// Text patches. SMB's font: digits 0-9 are tiles $00-$09, letters A-Z $0A-$23.
const enc = s => [...s].map(ch => ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48 : ch === ' ' ? 0x24 : ch.charCodeAt(0) - 55);
export function patchText(prg) {
  const repl = (from, to) => {
    const a = enc(from), b = enc(to);
    let count = 0;
    for (let i = 0; i + a.length <= prg.length; i++) {
      let ok = true;
      for (let k = 0; k < a.length; k++) if (prg[i + k] !== a[k]) { ok = false; break; }
      if (ok) { prg.set(b, i); count++; }
    }
    return count;
  };
  repl('MARIO', 'SONIC');
  repl('LUIGI', 'SONIC');
}
