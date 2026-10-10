// Draws a match: stage, fighters, projectiles, effects and the HUD.

import { rgb, mix } from './renderer.js';
import { VIEW_W, VIEW_H, GROUND } from '../game/match.js';

const WHITE = rgb(255, 255, 255), BLACK = rgb(0, 0, 0), RED = rgb(200, 16, 16), YELLOW = rgb(255, 216, 0);
const BAR_BG = rgb(120, 0, 0), BAR = rgb(255, 214, 0), BAR_LOW = rgb(255, 120, 0);

// Placeholder stage until a captured one is available
export const plainStage = {
  name: 'Arena',
  width: 640,
  draw(r, camX) {
    r.gradient(0, GROUND - 40, rgb(24, 22, 60), rgb(150, 70, 60));
    // distant pillars
    for (let i = 0; i < 12; i++) {
      const x = ((i * 90 - camX * 0.5) % 1080 + 1080) % 1080 - 120;
      r.fillRect(x, 60, 26, GROUND - 100, rgb(40, 30, 50));
      r.fillRect(x - 4, 56, 34, 8, rgb(60, 45, 70));
    }
    r.gradient(GROUND - 40, VIEW_H - GROUND + 40, rgb(70, 60, 64), rgb(30, 26, 30));
    for (let i = 0; i < 20; i++) {
      const x = ((i * 64 - camX) % 1280 + 1280) % 1280 - 320;
      r.fillRect(x, GROUND - 40, 2, VIEW_H, rgb(50, 44, 48));
    }
  },
};

export function drawMatch(r, m, stage = plainStage) {
  const shake = m.shakeT ? (m.tick % 2 ? 1 : -1) * Math.min(3, m.shakeT) : 0;
  const camX = m.camX + shake;
  stage.draw(r, camX - VIEW_W / 2, m.tick);
  const sx = x => x - camX + VIEW_W / 2;

  // shadows
  for (const f of m.fighters) {
    const w = f.def.bodyHalf * 2.4 * Math.max(0.4, 1 - f.y / 160);
    r.fillRect(sx(f.x) - w / 2, GROUND - 3, w, 4, BLACK, 0.35);
  }
  // the fighter who is attacking is drawn in front
  const order = [...m.fighters].sort((a, b) => (a.attacking ? 1 : 0) - (b.attacking ? 1 : 0));
  for (const f of order) drawFighter(r, f, sx(f.x), m);
  for (const p of m.projectiles) {
    const fr = p.anim.frames[p.fi];
    const cy = (fr.box.y0 + fr.box.y1) / 2;
    r.sprite(fr, sx(p.x), p.y - cy, p.face < 0);
  }
  drawEffects(r, m, sx);
  drawHud(r, m);
}

function drawFighter(r, f, x, m) {
  const fr = f.frame;
  const y = GROUND - f.def.foot - f.y;
  const opts = {};
  if (f.state === 'frozen') { opts.tint = rgb(120, 200, 255); opts.tintAmount = 0.6; }
  else if (f.flash > 6 && (m.tick >> 1) % 2) { opts.tint = rgb(255, 255, 160); opts.tintAmount = 0.75; }
  else if (f.flash > 0 && f.flash % 3 === 0) { opts.tint = WHITE; opts.tintAmount = 0.6; }
  if (f.invuln > 0 && f.state === 'special' && f.special && f.special.kind === 'teleport') opts.alpha = 0.5;
  r.sprite(fr, x, y, f.face < 0, opts);
}

function drawEffects(r, m, sx) {
  for (const e of m.effects) {
    if (e.type === 'spark') {
      const k = e.t / e.ticks, n = e.kind === 'heavy' ? 10 : 7, len = (e.kind === 'heavy' ? 18 : 11) * (0.4 + k);
      const col = e.kind === 'block' ? rgb(160, 200, 255) : e.kind === 'heavy' ? rgb(255, 230, 120) : WHITE;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + e.t * 0.2;
        for (let d = len * 0.4; d < len; d += 1.5) r.fillRect(sx(e.x) + Math.cos(a) * d, e.y + Math.sin(a) * d, 2, 2, mix(col, rgb(255, 120, 0), k));
      }
      if (e.t < 3) r.fillRect(sx(e.x) - 4, e.y - 4, 8, 8, WHITE);
    } else if (e.type === 'drop') {
      r.fillRect(sx(e.x), e.y, 2, 2, rgb(170, 0, 0));
    } else if (e.type === 'text') {
      r.textCenter(e.text, sx(e.x), e.y, YELLOW, 1);
    }
  }
}

function bar(r, x, y, w, frac, rightAlign) {
  r.fillRect(x - 1, y - 1, w + 2, 9, BLACK);
  r.fillRect(x, y, w, 7, BAR_BG);
  const fw = Math.round(w * frac);
  const c = frac < 0.25 ? BAR_LOW : BAR;
  r.fillRect(rightAlign ? x + w - fw : x, y, fw, 7, c);
  r.fillRect(rightAlign ? x + w - fw : x, y, fw, 2, mix(c, WHITE, 0.5));
}

export function drawHud(r, m) {
  const [a, b] = m.fighters;
  const W = VIEW_W, bw = 100;
  bar(r, 12, 14, bw, a.hp / 1000, true);
  bar(r, W - 12 - bw, 14, bw, b.hp / 1000, false);
  r.text(a.def.name.toUpperCase(), 12, 25, WHITE);
  r.text(b.def.name.toUpperCase(), W - 12 - r.textWidth(b.def.name.toUpperCase()), 25, WHITE);
  // game badges
  const badge = (f, x) => r.text(f.def.game === 'mk' ? 'MK' : 'SF', x, 4, f.def.game === 'mk' ? rgb(255, 80, 40) : rgb(80, 160, 255));
  badge(a, 12); badge(b, W - 24);
  // round wins
  for (let i = 0; i < m.wins[0]; i++) r.fillRect(bw + 2 - i * 9, 26, 6, 6, YELLOW);
  for (let i = 0; i < m.wins[1]; i++) r.fillRect(W - bw - 8 + i * 9, 26, 6, 6, YELLOW);
  const t = String(Math.max(0, m.timeLeft)).padStart(2, '0');
  r.textCenter(t, W / 2, 10, m.timeLeft <= 10 ? RED : WHITE, 2);
  for (const bn of m.banners) {
    if (bn.t < 0) continue;
    const pulse = bn.kind === 'fight' || bn.kind === 'finish' || bn.kind === 'fatal';
    const scale = bn.kind === 'win' ? 2 : 3;
    const col = bn.kind === 'fatal' || bn.kind === 'finish' ? RED : bn.kind === 'fight' ? YELLOW : WHITE;
    const y = bn.kind === 'win' ? 52 : 78;
    const grow = pulse && bn.t < 8 ? (bn.t + 1) / 8 : 1;
    const s = Math.max(1, Math.round(scale * grow));
    r.textCenter(bn.text, W / 2, y, col, s);
  }
}
