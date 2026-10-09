// Scenario helpers for targeted headless tests.
import { makeGame } from './play.mjs';
import { R, L } from '../src/smb/symbols.js';
import { BTN } from '../src/game/core.js';
export { R, L, BTN };

export async function scenario({ world = 1, area = 0 } = {}) {
  const g = await makeGame();
  const { core, ram } = g;
  for (let i = 0; i < 40; i++) core.frame(0);
  ram[R.ContinueWorld] = world - 1;
  core.frame(BTN.A | BTN.START);
  ram[R.AreaNumber] = area;
  core.m.cpu.call(L.LoadAreaPointer);
  const api = {
    g, core, ram, sonic: g.sonic,
    get x() { return ram[R.Player_PageLoc] * 256 + ram[R.Player_X_Position]; },
    get y() { return (ram[R.Player_Y_HighPos] - 1) * 256 + ram[R.Player_Y_Position]; },
    get ges() { return ram[R.GameEngineSubroutine]; },
    get state() { return ram[R.Player_State]; },
    peaceful: false,
    frame(b) {
      if (api.peaceful) for (let e = 0; e < 5; e++) if (ram[R.Enemy_ID + e] < 0x15 || ram[R.Enemy_ID + e] === 0x33) ram[R.Enemy_Flag + e] = 0;
      core.frame(b);
    },
    run(n, b = 0) { for (let i = 0; i < n; i++) api.frame(typeof b === 'function' ? b(i) : b); return api; },
    until(cond, b = 0, max = 2000) { api.ok = false; for (let i = 0; i < max; i++) { if (cond()) { api.ok = true; break; } api.frame(typeof b === 'function' ? b(i) : b); } return api; },
    // walk to a world x position and stop there (simple bang-bang controller)
    goto(tx, max = 1500) {
      let stuck = 0, jump = 0;
      for (let i = 0; i < max; i++) {
        if (jump > 0) { jump--; api.frame((tx > api.x ? BTN.RIGHT : BTN.LEFT) | BTN.A); continue; }
        if (Math.abs(tx - api.x) > 8 && api.x === api._lastX && api.state === 0) { if (++stuck > 20) { stuck = 0; jump = 35; api.frame(0); continue; } } else stuck = 0;
        api._lastX = api.x;
        const dx = tx - api.x, v = g.sonic.vx;
        if (Math.abs(dx) <= 2 && Math.abs(v) < 0.1) return api;
        const stopDist = v * v / (2 * 0.375) * Math.sign(v);
        let b = 0;
        if (dx - stopDist > 2) b = (v < 1.2 ? BTN.RIGHT : 0); else if (dx - stopDist < -2) b = (v > -1.2 ? BTN.LEFT : 0);
        if (Math.sign(dx) !== Math.sign(v) && Math.abs(v) > 0.3) b = v > 0 ? BTN.LEFT : BTN.RIGHT;
        api.frame(b);
      }
      return api;
    },
    snap(name) { g.snap(name, 2); return api; },
    log(...a) { console.log(`[x=${api.x} y=${api.y} st=${api.state} ges=${api.ges} vx=${g.sonic.vx.toFixed(2)} vy=${g.sonic.vy.toFixed(2)}]`, ...a); return api; },
    block(px, py) { const col = (px >> 4) & 31, row = (py - 32) >> 4; return ram[0x500 + (col >= 16 ? 0xd0 : 0) + row * 16 + (col & 15)]; },
  };
  api.run(5);
  api.until(() => api.ges === 8 && ram[R.OperMode_Task] === 3, 0, 600);
  return api;
}
