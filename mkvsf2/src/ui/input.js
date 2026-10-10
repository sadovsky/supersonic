// Keyboard, gamepad and touch input for up to two players.
//
// Keyboard layout A (player 1): W A S D move, U I punch, J K kick, L / Space block
// Keyboard layout B (player 2 in versus): arrows move, Z X punch, C V kick, B block
//                                         (or numpad 4 5 / 1 2, 0)
// With one player both layouts control player 1.

import { B } from '../game/commands.js';

const LAYOUT_A = {
  KeyW: B.UP, KeyS: B.DOWN, KeyA: B.LEFT, KeyD: B.RIGHT,
  KeyU: B.LP, KeyI: B.HP, KeyJ: B.LK, KeyK: B.HK, KeyL: B.BL, Space: B.BL,
};
const LAYOUT_B = {
  ArrowUp: B.UP, ArrowDown: B.DOWN, ArrowLeft: B.LEFT, ArrowRight: B.RIGHT,
  KeyZ: B.LP, KeyX: B.HP, KeyC: B.LK, KeyV: B.HK, KeyB: B.BL,
  Numpad4: B.LP, Numpad5: B.HP, Numpad1: B.LK, Numpad2: B.HK, Numpad0: B.BL, Numpad3: B.BL,
};
const START_KEYS = new Set(['Enter', 'KeyP', 'Escape']);

export class Input {
  constructor() {
    this.a = 0; this.b = 0; this.touch = 0; this.start = false;
    this.latchA = 0; this.latchB = 0; // taps shorter than a frame still count
    this.keyListeners = [];
    addEventListener('keydown', e => {
      if (e.repeat && START_KEYS.has(e.code)) return;
      let used = false;
      if (LAYOUT_A[e.code]) { this.a |= LAYOUT_A[e.code]; this.latchA |= LAYOUT_A[e.code]; used = true; }
      if (LAYOUT_B[e.code]) { this.b |= LAYOUT_B[e.code]; this.latchB |= LAYOUT_B[e.code]; used = true; }
      if (START_KEYS.has(e.code)) { this.start = true; used = true; }
      for (const fn of this.keyListeners) fn(e);
      if (used) e.preventDefault();
    });
    addEventListener('keyup', e => {
      if (LAYOUT_A[e.code]) this.a &= ~LAYOUT_A[e.code];
      if (LAYOUT_B[e.code]) this.b &= ~LAYOUT_B[e.code];
    });
    addEventListener('blur', () => { this.a = this.b = this.touch = 0; });
  }

  gamepad(i) {
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    const gp = pads[i];
    if (!gp) return 0;
    let v = 0;
    const b = k => gp.buttons[k]?.pressed;
    if (b(2)) v |= B.LP; if (b(3)) v |= B.HP; if (b(0)) v |= B.LK; if (b(1)) v |= B.HK;
    if (b(4) || b(5) || b(6) || b(7)) v |= B.BL;
    if (b(9)) v |= B.START;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (b(14) || ax < -0.5) v |= B.LEFT;
    if (b(15) || ax > 0.5) v |= B.RIGHT;
    if (b(12) || ay < -0.5) v |= B.UP;
    if (b(13) || ay > 0.5) v |= B.DOWN;
    return v;
  }

  // Pads for both players. versus: split keyboards; otherwise everything drives player 1.
  pads(versus) {
    const g0 = this.gamepad(0), g1 = this.gamepad(1);
    const a = this.a | this.latchA, b = this.b | this.latchB;
    this.latchA = this.latchB = 0;
    let p1, p2;
    if (versus) { p1 = a | g0 | this.touch; p2 = b | g1; }
    else { p1 = a | b | g0 | g1 | this.touch; p2 = 0; }
    return [clean(p1), clean(p2)];
  }

  // Start / pause pressed since the last call
  takeStart() {
    const g = (this.gamepad(0) | this.gamepad(1)) & B.START;
    const s = this.start || (g && !this.gStart);
    this.gStart = !!g; this.start = false;
    return s;
  }

  bindTouch(root) {
    const active = new Map();
    const update = () => { this.touch = 0; for (const v of active.values()) this.touch |= v; };
    const hit = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('[data-btn]');
      if (!el) return 0;
      if (el.dataset.btn === 'START') { this.start = true; return 0; }
      return el.dataset.btn.split(' ').reduce((acc, n) => acc | B[n], 0);
    };
    root.addEventListener('pointerdown', e => { active.set(e.pointerId, hit(e.clientX, e.clientY)); update(); e.preventDefault(); });
    root.addEventListener('pointermove', e => { if (active.has(e.pointerId)) { active.set(e.pointerId, hit(e.clientX, e.clientY)); update(); } });
    const end = e => { active.delete(e.pointerId); update(); };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }
}

function clean(v) {
  if ((v & B.LEFT) && (v & B.RIGHT)) v &= ~(B.LEFT | B.RIGHT);
  if ((v & B.UP) && (v & B.DOWN)) v &= ~(B.UP | B.DOWN);
  return v;
}
