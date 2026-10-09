// Works out where (in NES screen pixels) Sonic and his shield/stars go,
// given the draw state recorded by the Sonic plugin. Returns draw ops that
// both the browser compositor and the headless test compositor consume.

export const SONIC_SCALE = 0.8; // Genesis Sonic is ~40px tall; 0.8 makes him two NES blocks

const FIRE_TINT = true;

export function placeSonic(d, assets, k = SONIC_SCALE) {
  if (!d) return [];
  const ops = [];
  const frame = assets.frames[d.frame];
  const cx = d.x + 8;
  const feetY = d.y + 32;
  let oy;
  if (frame) {
    if (d.ball) {
      oy = d.grounded ? feetY - (frame.h - frame.oy) * k : d.y + 17;
    } else {
      oy = feetY - 20 * k;
    }
    ops.push({ kind: 'sonic', img: frame, x: d.facing < 0 ? cx - (frame.w - frame.ox) * k : cx - frame.ox * k, y: oy - frame.oy * k, w: frame.w * k, h: frame.h * k, flip: d.facing < 0, behind: d.behind });
  } else {
    oy = feetY - 20 * k;
  }
  // shield: flickers while gaining/losing it
  if (d.shield && !d.dead && !(d.sizeChange >= 0 && (d.sizeChange >> 2) & 1)) {
    const img = assets.shield[((d.tick ?? 0) >> 1) % 3];
    const scy = d.ball && !d.grounded ? oy : feetY - 20 * k;
    ops.push({ kind: 'shield', img, fire: d.shield === 2 && FIRE_TINT, x: cx - img.ox * k, y: scy - img.oy * k, w: img.w * k, h: img.h * k, flip: false, behind: d.behind, alpha: 0.6 });
  }
  if (d.stars >= 0 && !d.dead) {
    const img = assets.stars[(d.stars >> 2) % 4];
    const scy = d.ball && !d.grounded ? oy : feetY - 20 * k;
    ops.push({ kind: 'stars', img, x: cx - img.ox * k, y: scy - img.oy * k, w: img.w * k, h: img.h * k, flip: (d.stars >> 4) & 1, behind: false });
  }
  return ops;
}
