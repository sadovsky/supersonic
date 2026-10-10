// The game's screens: title, mode menu, character select, VS, the fight,
// continue and ending. Pure logic plus drawing into a Renderer, so the same
// code runs in the browser and in the headless tests.

import { ROSTER } from '../game/roster.js';
import { buildFighter } from '../game/sprites.js';
import { Match, VIEW_W, VIEW_H } from '../game/match.js';
import { AI } from '../game/ai.js';
import { B } from '../game/commands.js';
import { rgb, mix } from '../render/renderer.js';
import { drawMatch, plainStage } from '../render/scene.js';

const WHITE = rgb(255, 255, 255), RED = rgb(230, 40, 30), GOLD = rgb(255, 200, 40), BLUE = rgb(80, 150, 255), GREY = rgb(150, 150, 160), DARK = rgb(12, 10, 18);
const MODES = ['ARCADE', 'VERSUS', 'CPU BATTLE'];
const LEVELS = ['EASY', 'NORMAL', 'HARD', 'MASTER'];
const ATTACK = B.LP | B.HP | B.LK | B.HK;

// Select grid: MK on the top row, SF2 below
const GRID = [[0, 1, 2, 3, 4, 5, 6, -1], [7, 8, 9, 10, 11, 12, 13, 14]];

export class App {
  constructor(roms, opts = {}) {
    this.roms = roms;
    this.defs = ROSTER.map(e => buildFighter(e, roms));
    this.altDefs = new Map();
    this.stages = opts.stages || null;   // optional provider: (gameName, fighterName) => stage
    this.screen = 'title';
    this.t = 0;
    this.menu = 0;
    this.level = 1;
    this.prev = [0, 0];
    this.events = [];
    this.cursor = [[0, 0], [1, 0]];
    this.chosen = [null, null];
  }

  def(i, alt) {
    if (!alt) return this.defs[i];
    if (!this.altDefs.has(i)) this.altDefs.set(i, buildFighter(ROSTER[i], this.roms, true));
    return this.altDefs.get(i);
  }

  sound(name) { this.events.push({ type: 'sound', name }); }
  voice(name) { this.events.push({ type: 'voice', name }); }

  go(screen) { this.screen = screen; this.t = 0; }

  // ---------------------------------------------------------------- update
  update(pads, start) {
    this.events = [];
    this.t++;
    const pressed = pads.map((p, i) => p & ~this.prev[i]);
    this.prev = pads;
    switch (this.screen) {
      case 'title':
        if (start || (pressed[0] & ATTACK)) { this.go('menu'); this.sound('select'); }
        if (this.t > 60 * 25) this.startDemo();
        break;
      case 'menu': {
        const p = pressed[0] | pressed[1];
        if (p & B.UP) { this.menu = (this.menu + MODES.length) % (MODES.length + 1); this.sound('move'); }
        if (p & B.DOWN) { this.menu = (this.menu + 1) % (MODES.length + 1); this.sound('move'); }
        if (this.menu === MODES.length && (p & (B.LEFT | B.RIGHT))) { this.level = (this.level + (p & B.LEFT ? 3 : 1)) % 4; this.sound('move'); }
        if (start || (p & ATTACK)) {
          if (this.menu === MODES.length) { this.level = (this.level + 1) % 4; this.sound('move'); break; }
          this.mode = ['arcade', 'versus', 'watch'][this.menu];
          this.sound('select');
          if (this.mode === 'watch') this.startDemo(false);
          else { this.go('select'); this.chosen = [null, null]; this.voice('choose'); }
        }
        break;
      }
      case 'select': this.updateSelect(pressed, start); break;
      case 'vs': if (this.t > 150 || (this.t > 30 && start)) this.startFight(); break;
      case 'fight': this.updateFight(pads, start); break;
      case 'continue':
        if (start || (pressed[0] & ATTACK)) { this.sound('select'); this.go('vs'); }
        else if (this.t > 60 * 10) this.go('title');
        break;
      case 'ending': if (this.t > 60 * 3 && (start || (pressed[0] & ATTACK))) this.go('title'); break;
    }
    return this.events;
  }

  cell([c, r]) { return GRID[r][c]; }

  updateSelect(pressed, start) {
    const players = this.mode === 'versus' ? [0, 1] : [0];
    for (const p of players) {
      if (this.chosen[p] !== null) continue;
      const cur = this.cursor[p], k = pressed[p];
      if (k & B.LEFT) cur[0] = (cur[0] + 7) % 8;
      if (k & B.RIGHT) cur[0] = (cur[0] + 1) % 8;
      if (k & (B.UP | B.DOWN)) cur[1] ^= 1;
      if (k & (B.LEFT | B.RIGHT | B.UP | B.DOWN)) this.sound('move');
      if ((k & ATTACK) || (start && p === 0)) {
        let i = this.cell(cur);
        if (i < 0) i = Math.random() * ROSTER.length | 0;  // the ? box: random
        this.chosen[p] = i; this.sound('select');
        this.voice('name:' + ROSTER[i].name);
      }
    }
    if (players.every(p => this.chosen[p] !== null)) {
      if (this.selectDone === undefined) this.selectDone = this.t;
      if (this.t - this.selectDone > 40) {
        this.selectDone = undefined;
        if (this.mode === 'arcade') this.makeLadder();
        this.p1 = this.chosen[0];
        this.p2 = this.mode === 'versus' ? this.chosen[1] : this.ladder[this.stageNo];
        this.go('vs');
      }
    }
  }

  // Arcade: every fighter from the other game, in random order
  makeLadder() {
    const mine = ROSTER[this.chosen[0]].game;
    const others = ROSTER.map((e, i) => i).filter(i => ROSTER[i].game !== mine);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [others[i], others[j]] = [others[j], others[i]]; }
    this.ladder = others; this.stageNo = 0;
  }

  startDemo(attract = true) {
    this.mode = attract ? 'attract' : 'watch';
    this.p1 = Math.random() * ROSTER.length | 0;
    do this.p2 = Math.random() * ROSTER.length | 0; while (ROSTER[this.p2].game === ROSTER[this.p1].game);
    this.go('vs');
  }

  startFight() {
    const a = this.def(this.p1), b = this.def(this.p2, this.p1 === this.p2);
    const stage = this.stages ? this.stages(ROSTER[this.p2], ROSTER[this.p1]) : plainStage;
    this.stage = stage || plainStage;
    this.match = new Match(a, b, { stageW: this.stage.width || 640 });
    const cpu = this.mode === 'versus' ? [] : this.mode === 'arcade' ? [1] : [0, 1];
    const lvl = this.mode === 'arcade' ? Math.min(4, this.level + 1 + Math.floor((this.stageNo || 0) / 3)) : this.level + 1;
    this.ais = [cpu.includes(0) ? new AI(lvl) : null, cpu.includes(1) ? new AI(lvl) : null];
    this.paused = false;
    this.go('fight');
    this.events.push({ type: 'music', game: ROSTER[this.p2].game, stage: this.stage.name });
  }

  updateFight(pads, start) {
    const m = this.match;
    if (this.mode === 'attract' && (start || pads[0] & ATTACK)) { this.go('title'); this.events.push({ type: 'music', stop: true }); return; }
    if (start && this.mode !== 'attract') { this.paused = !this.paused; this.sound('pause'); }
    if (this.paused) return;
    const input = m.fighters.map((f, i) => this.ais[i] ? this.ais[i].pad(f, m.fighters[1 - i], m) : pads[i]);
    m.update(input);
    this.events.push(...m.events);
    if (m.over && !this.overT) this.overT = this.t;
    if (m.over && this.t - this.overT > 30) {
      this.overT = 0;
      this.events.push({ type: 'music', stop: true });
      if (this.mode === 'arcade') {
        if (m.winner === 0) {
          this.stageNo++;
          if (this.stageNo >= this.ladder.length) { this.go('ending'); this.voice('wins'); return; }
          this.p2 = this.ladder[this.stageNo]; this.go('vs');
        } else this.go('continue');
      } else if (this.mode === 'versus') { this.chosen = [null, null]; this.go('select'); }
      else if (this.mode === 'watch') this.startDemo(false);
      else this.go('title');
    }
  }

  // ------------------------------------------------------------------ draw
  draw(r) {
    switch (this.screen) {
      case 'title': return this.drawTitle(r);
      case 'menu': return this.drawMenu(r);
      case 'select': return this.drawSelect(r);
      case 'vs': return this.drawVs(r);
      case 'fight':
        drawMatch(r, this.match, this.stage);
        if (this.paused) { r.fillRect(0, 0, VIEW_W, VIEW_H, DARK, 0.5); r.textCenter('PAUSED', VIEW_W / 2, 100, WHITE, 2); }
        if (this.mode === 'attract' && (this.t >> 5) % 2) r.textCenter('PRESS START', VIEW_W / 2, 200, WHITE, 1);
        return;
      case 'continue': return this.drawContinue(r);
      case 'ending': return this.drawEnding(r);
    }
  }

  frameOf(def, key, t) {
    const a = def.anims[key] || def.anims.idle;
    const total = a.frames.reduce((s, f) => s + Math.min(f.dur, 40), 0);
    let k = t % Math.max(1, total);
    for (const f of a.frames) { k -= Math.min(f.dur, 40); if (k < 0) return f; }
    return a.frames[a.frames.length - 1];
  }

  backdrop(r) {
    r.gradient(0, VIEW_H, rgb(30, 4, 6), rgb(4, 4, 20));
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + this.t * (1 + i % 3) * 0.3) % VIEW_W, y = (i * 53) % VIEW_H;
      r.fillRect(x, y, 1, 1, rgb(90, 60, 60));
    }
  }

  drawLogo(r, y) {
    const flame = k => mix(rgb(255, 230, 60), rgb(200, 20, 10), k);
    const steel = k => mix(rgb(220, 240, 255), rgb(40, 90, 220), k);
    r.textCenter('MORTAL KOMBAT', VIEW_W / 2, y, flame, 3);
    r.textCenter('VS', VIEW_W / 2, y + 28, WHITE, 2);
    r.textCenter('STREET FIGHTER II', VIEW_W / 2, y + 48, steel, 2);
  }

  drawTitle(r) {
    this.backdrop(r);
    // a line-up of fighters along the bottom
    const n = this.defs.length;
    for (let i = 0; i < n; i++) {
      const d = this.defs[i], f = this.frameOf(d, 'idle', this.t + i * 7);
      const x = 12 + i * ((VIEW_W - 24) / (n - 1));
      r.spriteScaled(f, x, 210 - d.foot * 0.55, 0.55, d.game === 'sf2', { tint: d.game === 'mk' ? rgb(80, 0, 0) : rgb(0, 20, 80), tintAmount: 0.25 });
    }
    this.drawLogo(r, 30);
    if ((this.t >> 5) % 2) r.textCenter('PRESS START', VIEW_W / 2, 120, WHITE, 1);
    if (this.stageStatus) r.textCenter(this.stageStatus, VIEW_W / 2, 4, GREY, 1, null);
  }

  drawMenu(r) {
    this.backdrop(r);
    this.drawLogo(r, 16);
    MODES.forEach((m, i) => {
      const sel = this.menu === i;
      r.textCenter(m, VIEW_W / 2, 100 + i * 18, sel ? GOLD : GREY, 2);
    });
    const sel = this.menu === MODES.length;
    r.textCenter(`CPU: ${LEVELS[this.level]}`, VIEW_W / 2, 100 + MODES.length * 18 + 6, sel ? GOLD : GREY, 1);
    r.textCenter('PUNCH OR KICK TO SELECT', VIEW_W / 2, 206, GREY, 1, null);
    if (this.stageStatus) r.textCenter(this.stageStatus, VIEW_W / 2, 196, GREY, 1, null);
  }

  drawSelect(r) {
    this.backdrop(r);
    r.textCenter('CHOOSE YOUR FIGHTER', VIEW_W / 2, 4, GOLD, 1);
    const cw = 32, ch = 44, gx = 0, gy = 122;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      const i = GRID[row][col];
      const x = gx + col * cw, y = gy + row * ch;
      r.fillRect(x + 1, y + 1, cw - 2, ch - 2, row === 0 ? rgb(60, 10, 10) : rgb(10, 20, 60));
      const clip = { x0: x + 1, y0: y + 1, x1: x + cw - 1, y1: y + ch - 1 };
      if (i < 0) { r.textCenter('?', x + cw / 2, y + 12, WHITE, 3); continue; }
      const d = this.defs[i], f = d.anims.idle.frames[0];
      // head-and-shoulders crop
      r.spriteScaled(f, x + cw / 2, y + 8 - d.body.y0 * 0.62, 0.62, false, { clip });
    }
    r.textCenter('MORTAL KOMBAT', VIEW_W / 2, gy - 9, RED, 1, null);
    r.textCenter('STREET FIGHTER II', VIEW_W / 2, gy + 2 * ch + 3, BLUE, 1, null);
    const players = this.mode === 'versus' ? [0, 1] : [0];
    for (const p of players) {
      const [col, row] = this.cursor[p];
      const x = gx + col * cw, y = gy + row * ch;
      const c = p === 0 ? (this.chosen[0] !== null ? WHITE : (this.t >> 3) % 2 ? RED : GOLD) : (this.chosen[1] !== null ? WHITE : (this.t >> 3) % 2 ? BLUE : rgb(120, 255, 120));
      r.fillRect(x, y, cw, 2, c); r.fillRect(x, y + ch - 2, cw, 2, c); r.fillRect(x, y, 2, ch, c); r.fillRect(x + cw - 2, y, 2, ch, c);
      r.text(p === 0 ? '1P' : '2P', x + 3, y + 3, c, 1);
      // large preview
      const idx = this.chosen[p] ?? this.cell(this.cursor[p]);
      const px = p === 0 ? 46 : VIEW_W - 46;
      if (idx >= 0) {
        const d = this.def(idx, p === 1 && this.chosen[0] === idx);
        const f = this.frameOf(d, this.chosen[p] !== null ? 'victory' : 'idle', this.t);
        r.sprite(f, px, 116 - d.foot, p === 1);
        r.textCenter(d.name.toUpperCase(), px, 118, WHITE, 1);
      }
    }
    if (this.mode !== 'versus') {
      r.textCenter('VS', VIEW_W - 64, 46, GREY, 2);
      r.textCenter(this.mode === 'arcade' ? 'THE OTHER' : '', VIEW_W - 64, 68, GREY, 1, null);
      r.textCenter(this.mode === 'arcade' ? 'WORLD AWAITS' : '', VIEW_W - 64, 78, GREY, 1, null);
    }
  }

  drawVs(r) {
    this.backdrop(r);
    const a = this.def(this.p1), b = this.def(this.p2, this.p1 === this.p2);
    const slide = Math.min(1, this.t / 25);
    const fa = this.frameOf(a, 'idle', this.t), fb = this.frameOf(b, 'idle', this.t);
    r.sprite(fa, -40 + 120 * slide, 170 - a.foot);
    r.sprite(fb, VIEW_W + 40 - 120 * slide, 170 - b.foot, true);
    r.textCenter(a.name.toUpperCase(), 80, 180, a.game === 'mk' ? RED : BLUE, 1);
    r.textCenter(b.name.toUpperCase(), VIEW_W - 80, 180, b.game === 'mk' ? RED : BLUE, 1);
    if (this.t > 25) r.textCenter('VS', VIEW_W / 2, 80, (this.t >> 2) % 2 ? GOLD : WHITE, 4);
    if (this.mode === 'arcade') r.textCenter(`BATTLE ${this.stageNo + 1} OF ${this.ladder.length}`, VIEW_W / 2, 20, GREY, 1);
  }

  drawContinue(r) {
    this.backdrop(r);
    const d = this.def(this.p1);
    r.sprite(this.frameOf(d, 'dizzy', this.t), VIEW_W / 2, 170 - d.foot);
    r.textCenter('CONTINUE?', VIEW_W / 2, 40, WHITE, 2);
    r.textCenter(String(Math.max(0, 9 - Math.floor(this.t / 60))), VIEW_W / 2, 64, RED, 3);
  }

  drawEnding(r) {
    this.backdrop(r);
    const d = this.def(this.p1);
    r.sprite(this.frameOf(d, 'victory', this.t), VIEW_W / 2, 180 - d.foot);
    r.textCenter(d.name.toUpperCase(), VIEW_W / 2, 24, GOLD, 2);
    r.textCenter('HAS CONQUERED', VIEW_W / 2, 46, WHITE, 1);
    r.textCenter(d.game === 'mk' ? 'THE WORLD WARRIORS' : 'THE MORTAL KOMBATANTS', VIEW_W / 2, 58, WHITE, 1);
    r.textCenter(d.game === 'mk' ? 'MORTAL KOMBAT REIGNS' : 'STREET FIGHTER REIGNS', VIEW_W / 2, 196, d.game === 'mk' ? RED : BLUE, 1);
  }
}
