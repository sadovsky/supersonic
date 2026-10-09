// Keyboard, gamepad and touch input mapped onto an NES controller.
import { BTN } from './game/core.js';

const KEYMAP = {
  ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT,
  ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  ArrowUp: BTN.UP, KeyW: BTN.UP,
  ArrowDown: BTN.DOWN, KeyS: BTN.DOWN,
  KeyZ: BTN.A, Space: BTN.A, KeyJ: BTN.A, KeyK: BTN.A,
  KeyX: BTN.B, KeyL: BTN.B, ShiftLeft: BTN.B,
  Enter: BTN.START, KeyP: BTN.START,
  Backspace: BTN.SELECT, Tab: BTN.SELECT,
};

export class Input {
  constructor() {
    this.keys = 0;
    this.touch = 0;
    addEventListener('keydown', e => {
      const b = KEYMAP[e.code];
      if (b) { this.keys |= b; e.preventDefault(); }
    });
    addEventListener('keyup', e => {
      const b = KEYMAP[e.code];
      if (b) { this.keys &= ~b; e.preventDefault(); }
    });
    addEventListener('blur', () => { this.keys = 0; });
  }

  pad() {
    let v = 0;
    for (const gp of navigator.getGamepads?.() || []) {
      if (!gp) continue;
      const b = i => gp.buttons[i]?.pressed;
      if (b(0) || b(3)) v |= BTN.A;          // A / Y jump
      if (b(1) || b(2)) v |= BTN.B;          // B / X fire
      if (b(9)) v |= BTN.START;
      if (b(8)) v |= BTN.SELECT;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (b(14) || ax < -0.5) v |= BTN.LEFT;
      if (b(15) || ax > 0.5) v |= BTN.RIGHT;
      if (b(12) || ay < -0.5) v |= BTN.UP;
      if (b(13) || ay > 0.5) v |= BTN.DOWN;
    }
    return v;
  }

  state() {
    let v = this.keys | this.pad() | this.touch;
    // a real d-pad can't press opposite directions at once
    if ((v & BTN.LEFT) && (v & BTN.RIGHT)) v &= ~(BTN.LEFT | BTN.RIGHT);
    if ((v & BTN.UP) && (v & BTN.DOWN)) v &= ~(BTN.UP | BTN.DOWN);
    return v;
  }

  bindTouch(root) {
    const active = new Map(); // pointerId -> button bits
    const update = () => { this.touch = 0; for (const b of active.values()) this.touch |= b; };
    const hit = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const t = el?.closest?.('[data-btn]');
      if (!t) return 0;
      return t.dataset.btn.split(' ').reduce((acc, n) => acc | BTN[n], 0);
    };
    root.addEventListener('pointerdown', e => { active.set(e.pointerId, hit(e.clientX, e.clientY)); update(); e.preventDefault(); });
    root.addEventListener('pointermove', e => { if (active.has(e.pointerId)) { active.set(e.pointerId, hit(e.clientX, e.clientY)); update(); } });
    const end = e => { active.delete(e.pointerId); update(); };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }
}
