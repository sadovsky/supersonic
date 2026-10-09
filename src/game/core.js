// SmbCore: SMB's original program running on our Machine, plus the hooks
// that turn Mario into Sonic.

import { Machine } from '../nes/machine.js';
import { L } from '../smb/symbols.js';

export class SmbCore {
  constructor(prg, chr) {
    this.m = new Machine(prg, chr);
    this.m.sprite0Loop = [L.Sprite0Hit, L.HBlankDelay];
    this.nmiVector = this.m.prg[0x7ffa] | (this.m.prg[0x7ffb] << 8);
    this.frameCount = 0;
    this.plugins = [];
  }

  use(plugin) { this.plugins.push(plugin); plugin.install?.(this); return this; }

  boot() {
    this.m.reset(L.Start, L.EndlessLoop);
  }

  frame(buttons, buttons2 = 0) {
    this.m.buttons = buttons;
    this.m.buttons2 = buttons2;
    for (const p of this.plugins) p.beforeFrame?.(this);
    this.m.runFrame(this.nmiVector);
    for (const p of this.plugins) p.afterFrame?.(this);
    this.frameCount++;
  }

  get ram() { return this.m.ram; }
}

// Controller bits as SMB's joypad reader assembles them (first bit read = A)
export const BTN = { A: 1, B: 2, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128 };
