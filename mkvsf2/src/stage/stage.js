// A captured stage, drawn line by line with each line's own scroll rate.

import { GROUND, VIEW_W } from '../game/match.js';

export function makeStage(data, opts = {}) {
  const { refMin, refMax, layers, backdrop } = data;
  const travel = Math.max(0, refMax - refMin);
  const shiftY = GROUND - (opts.ground ?? 196);   // where the game's fighters stand
  // SNES mode 1 priority, back to front: BG3 low, BG3 high (unless BG3 is on top),
  // BG2 low, BG1 low, BG2 high, BG1 high, then BG3 high when it has priority
  const byBg = bg => layers.find(l => l.bg === bg);
  const passes = [[2, 0], [2, 1], [1, 0], [0, 0], [1, 1], [0, 1]];
  if (data.bg3prio) { passes.splice(1, 1); passes.push([2, 1]); }
  const plan = passes.map(([bg, hi]) => [byBg(bg), hi]).filter(([l]) => l);
  return {
    name: opts.name || 'stage',
    width: VIEW_W + travel,
    draw(r, camLeft) {
      const ref = refMin + Math.max(0, Math.min(travel, camLeft));
      // position among the recorded camera positions
      const refs = data.refs;
      let k = 0;
      while (k < refs.length - 2 && refs[k + 1] <= ref) k++;
      const t = refs.length > 1 ? Math.max(0, Math.min(1, (ref - refs[k]) / ((refs[k + 1] - refs[k]) || 1))) : 0;
      if (typeof backdrop === 'number') r.buf.fill(backdrop);
      else for (let y = 0; y < r.h; y++) r.buf.fill(backdrop[Math.max(0, Math.min(backdrop.length - 1, y - shiftY))], y * r.w, (y + 1) * r.w);
      for (const [L, hi] of plan) {
        for (let y = 0; y < r.h; y++) {
          const sy = Math.max(0, Math.min(L.lines.length - 1, y - shiftY));
          const line = L.lines[sy];
          if (!line) continue;
          const strip = line.strip, row = y * r.w;
          const sc = line.scroll, hs = sc.length > 1 ? sc[k] + (sc[k + 1] - sc[k]) * t : sc[0];
          const start = Math.round(hs) - line.u0;
          for (let x = 0; x < r.w; x++) {
            const i = Math.max(0, Math.min(strip.length - 1, start + x));
            const c = strip[i];
            if (c && (c >>> 24 === 0xff) === !!hi) r.buf[row + x] = c | 0xff000000;
          }
        }
      }
    },
  };
}
