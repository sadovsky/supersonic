// Turns the decoded ROM data into fighters the engine can use: for every
// move an animation (frames with pixels, origin and timing) plus hit
// geometry measured from the pixels themselves:
//   body   the idle frame's extent (the fighter's push box and hurt box)
//   box    each frame's opaque bounding box
//   reach  the part of a frame that sticks out in front of the idle body;
//          during an attack, the frames that reach furthest are active.
// All coordinates are relative to the fighter's origin with the fighter
// facing right; y grows downwards.

import { ANIMS, MOVES } from './roster.js';

const HOLD = 1e9;
const LOOPING = new Set(['idle', 'walkF', 'walkB', 'crouch', 'dizzy', 'victory', 'block', 'crouchBlock']);

function measure(fr) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) if (fr.pix[y * fr.w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0: x0 - fr.ox, y0: y0 - fr.oy, x1: x1 + 1 - fr.ox, y1: y1 + 1 - fr.oy };
}

// The pixels beyond `front`: where an attack connects.
function reachOf(fr, front) {
  // furthest column, then only the tip (the last 28 pixels) counts
  let far = -1;
  for (let y = 0; y < fr.h; y++) for (let x = fr.w - 1; x > far; x--) if (fr.pix[y * fr.w + x]) { far = x; break; }
  const from = Math.max(front + fr.ox, far - 28);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let y = 0; y < fr.h; y++) for (let x = Math.max(0, from); x < fr.w; x++) if (fr.pix[y * fr.w + x]) {
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (n < 10) return null;
  return { x0: x0 - fr.ox, y0: y0 - fr.oy, x1: x1 + 1 - fr.ox, y1: y1 + 1 - fr.oy };
}

// Build one animation from a list of {fr, dur}.
function makeAnim(list, loop) {
  return { frames: list.map(({ fr, dur }) => ({ ...fr, dur, box: measure(fr) })), loop };
}

export function buildFighter(entry, roms, alt = false) {
  const game = entry.game;
  const src = game === 'sf2' ? roms.sf2.fighters[entry.index] : roms.mk.fighters[entry.index];
  const palettes = src.palettes;
  const mainPal = game === 'sf2' ? palettes[alt ? 1 : 0] : palettes[alt ? 2 : 0];
  const fxPal = game === 'sf2' ? palettes[2] : palettes[1];
  // SF2 draws its fighters facing left: mirror them so everything faces right
  // cx re-centres every frame on the middle of the idle body
  let cx = 0;
  const flipCache = new Map();
  const withPal = (fr, pal) => {
    if (game !== 'sf2') return { pix: fr.pix, w: fr.w, h: fr.h, ox: fr.ox + cx, oy: fr.oy, pal };
    let pix = flipCache.get(fr);
    if (!pix) {
      pix = new Uint8Array(fr.pix.length);
      for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) pix[y * fr.w + x] = fr.pix[y * fr.w + fr.w - 1 - x];
      flipCache.set(fr, pix);
    }
    return { pix, w: fr.w, h: fr.h, ox: fr.w - fr.ox + cx, oy: fr.oy, pal };
  };

  // Raw animation from the ROM by id. Returns [{fr, dur}], loop
  function rom(id, opts = {}) {
    const pal = opts.fx ? fxPal : mainPal;
    if (game === 'sf2') {
      const a = src.anims[id];
      if (!a || !a.frames.length) return null;
      // frames only upload the tiles that changed, so replay the uploads in order
      const base = opts.after !== undefined ? src.anims[opts.after].frames.map(f => f.gfx) : [idleGfx];
      return { list: a.frames.map((f, i) => ({ fr: withPal(src.frame(f.gfx, [...base, ...a.frames.slice(0, i).map(q => q.gfx)]), pal), dur: f.dur >= 0xff ? HOLD : Math.max(1, f.dur) })), loop: a.loop };
    }
    const a = src.anims[id];
    if (!a || !a.frames.length) return null;
    const t = opts.ticks || 4;
    return { list: a.frames.map(n => ({ fr: withPal(src.frame(n), pal), dur: t })), loop: a.loop };
  }

  const idleGfx = game === 'sf2' ? src.anims[ANIMS.sf2.idle].frames[0].gfx : 0;
  const tmpl = ANIMS[game];
  {
    const idleId = Array.isArray(tmpl.idle) ? tmpl.idle[0] : tmpl.idle;
    const ib = measure(rom(idleId).list[0].fr);
    cx = Math.round((ib.x0 + ib.x1) / 2);
  }
  const anims = {};
  for (const [key, spec] of Object.entries(tmpl)) {
    const [id, ticks] = Array.isArray(spec) ? spec : [spec, 0];
    const r = rom(id, { ticks });
    if (!r) continue;
    // only the idle-type animations loop; moves always end
    anims[key] = makeAnim(r.list, LOOPING.has(key) ? Math.max(0, r.loop) : -1);
  }
  // MK attacks: the punch animations retract with a second animation
  if (game === 'mk') {
    const then = { lp: 0x14, hp: 0x3a };
    for (const [k, id] of Object.entries(then)) {
      const r = rom(id, { ticks: 3 });
      if (r && anims[k]) anims[k] = makeAnim([...anims[k].frames.map(f => ({ fr: f, dur: f.dur })), ...r.list], -1);
    }
    // the knocked-down fall ends lying on the ground
    if (anims.lie) for (const k of ['launch', 'fall', 'sweepFall']) if (anims[k]) anims[k] = makeAnim([...anims[k].frames.map(f => ({ fr: f, dur: f.dur })), { fr: anims.lie.frames[0], dur: HOLD }], -1);
  }

  // Body: the idle frame
  const idle = anims.idle.frames[0];
  const body = idle.box;
  const foot = body.y1;
  const height = body.y1 - body.y0;
  const front = body.x1 - 6;

  // Attack geometry: the reach of each frame; active frames are those that reach furthest
  for (const a of Object.values(anims)) {
    let best = -1e9;
    for (const f of a.frames) { f.reach = reachOf(f, front); if (f.reach) best = Math.max(best, f.reach.x1); }
    a.reachMax = best;
    a.frames.forEach((f, i) => { f.active = !!f.reach && f.reach.x1 >= best - 8; });
    a.length = a.frames.reduce((s, f) => s + (f.dur >= HOLD ? 0 : f.dur), 0);
  }
  // MK holds the extended frame of an attack for a while
  if (game === 'mk') for (const k of Object.keys(MOVES)) {
    const a = anims[k]; if (!a) continue;
    const i = a.frames.findIndex(f => f.active);
    if (i >= 0) a.frames[i] = { ...a.frames[i], dur: a.frames[i].dur + (k === 'lp' || k === 'lk' || k === 'clp' || k === 'clk' ? 4 : 9) };
  }

  // Specials
  const specials = (entry.specials || []).map(sp => {
    const s = { ...sp };
    const t = game === 'mk' ? 4 : 0;
    const main = rom(sp.anim, { ticks: t });
    if (!main) return null;
    s.animData = makeAnim(main.list, sp.kind === 'spin' || sp.kind === 'flurry' || sp.kind === 'dash' ? (main.loop >= 0 ? main.loop : 0) : -1);
    if (sp.startAnim !== undefined) { const r = rom(sp.startAnim, { ticks: t }); if (r) s.startData = makeAnim(r.list, -1); }
    if (sp.endAnim !== undefined) { const r = rom(sp.endAnim, { ticks: t }); if (r) s.endData = makeAnim(r.list, -1); }
    if (sp.proj !== undefined) {
      const r = rom(sp.proj, { ticks: 4, fx: game === 'sf2', after: game === 'sf2' ? sp.after : undefined });
      if (r) s.projData = makeAnim(r.list, r.loop >= 0 ? r.loop : 0);
    }
    if (sp.impact !== undefined) { const r = rom(sp.impact, { ticks: 4 }); if (r) s.impactData = makeAnim(r.list, -1); }
    for (const d of [s.animData, s.startData, s.endData]) if (d) {
      let best = -1e9;
      for (const f of d.frames) { f.reach = reachOf(f, front); if (f.reach) best = Math.max(best, f.reach.x1); }
      d.reachMax = best;
      d.frames.forEach(f => { f.active = !!f.reach && f.reach.x1 >= best - 10; });
      d.length = d.frames.reduce((a, f) => a + (f.dur >= HOLD ? 0 : f.dur), 0);
    }
    if (s.projData) for (const f of s.projData.frames) f.reach = f.box;
    return s;
  }).filter(Boolean);

  const bodyHalf = Math.round((body.x1 - body.x0) * 0.42);
  return { entry, name: entry.name, game, anims, specials, body, bodyHalf, foot, height, front, palette: mainPal };
}

export { HOLD };
