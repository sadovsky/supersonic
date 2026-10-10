// Captures stage backgrounds by running the real game in the SNES emulator:
// it starts a fight on the wanted stage, walks the camera from one end of the
// stage to the other, and records every background line at every scroll
// position. The result is, for each layer and screen line, a strip of pixels
// plus how that line scrolls with the camera (a + b * camera), which keeps
// the games' parallax.

import { SNES, PAD } from '../snes/snes.js';
import { AI } from '../game/ai.js';

const bgr15 = c => {
  const r = (c & 31) << 3, g = ((c >> 5) & 31) << 3, b = ((c >> 10) & 31) << 3;
  return ((255 << 24) | ((b | b >> 5) << 16) | ((g | g >> 5) << 8) | (r | r >> 5)) >>> 0;
};

function run(s, n, pad = 0, pad2 = 0, each) {
  for (let i = 0; i < n; i++) { s.joy[0] = pad; s.joy[1] = pad2; if (each) each(i); s.runFrame(); }
  s.joy[0] = s.joy[1] = 0;
}
const tap = (s, pad, hold = 4, gap = 20) => { run(s, hold, pad); run(s, gap); };

// Decode one screen line (256 pixels) of a background layer into `out`,
// using that line's PPU registers (games change modes and windows mid-frame).
export function fetchLine(s, bg, y, hs, vs, out, pals) {
  const ppu = s.linePpu.subarray(y * 0x40, y * 0x40 + 0x40);
  out.fill(0);
  if (!((ppu[0x2c] >> bg) & 1)) return;           // layer not on the main screen here
  const mode = ppu[0x05] & 7;
  const bpp = ({ 0: [2, 2, 2, 2], 1: [4, 4, 2, 0], 2: [4, 4, 0, 0], 3: [8, 4, 0, 0], 4: [8, 2, 0, 0], 5: [4, 2, 0, 0], 6: [4, 0, 0, 0], 7: [0, 0, 0, 0] })[mode][bg];
  if (!bpp) return;
  const big = (ppu[0x05] >> (4 + bg)) & 1, ts = big ? 16 : 8;
  const sc = ppu[0x07 + bg];
  const mapBase = (sc & 0xfc) << 8, mapW = sc & 1 ? 64 : 32, mapH = sc & 2 ? 64 : 32;
  const nba = bg < 2 ? ppu[0x0b] : ppu[0x0c];
  const chrBase = ((bg & 1 ? nba >> 4 : nba) & 0xf) << 12;
  const py = (y + vs) & (mapH * ts - 1);
  const ty = Math.floor(py / ts), fy0 = py % ts;
  const words = bpp * 4, palBase = mode === 0 ? bg * 32 : 0;
  // window mask for this layer on the main screen
  const wsel = (ppu[0x23 + (bg >> 1)] >> ((bg & 1) * 4)) & 15;
  // windows only cut holes for the status bar: ignore them
  const masked = false;
  const logic = (ppu[0x2a] >> (bg * 2)) & 3;
  const inWin = x => {
    const w1 = wsel & 2 ? ((x >= ppu[0x26] && x <= ppu[0x27]) !== !!(wsel & 1)) : null;
    const w2 = wsel & 8 ? ((x >= ppu[0x28] && x <= ppu[0x29]) !== !!(wsel & 4)) : null;
    if (w1 === null) return w2; if (w2 === null) return w1;
    return [w1 || w2, w1 && w2, w1 !== w2, w1 === w2][logic];
  };
  for (let x = 0; x < 256; x++) {
    if (masked && inWin(x)) continue;
    const px = (x + hs) & (mapW * ts - 1), tx = Math.floor(px / ts);
    let ma = mapBase + ((ty & 31) << 5) + (tx & 31);
    if (tx & 32) ma += 0x400;
    if (ty & 32) ma += mapW === 64 ? 0x800 : 0x400;
    const e = s.vram[ma & 0x7fff];
    let fx = px % ts, fy = fy0;
    if (e & 0x4000) fx = ts - 1 - fx;
    if (e & 0x8000) fy = ts - 1 - fy;
    let tile = e & 0x3ff;
    if (big) { tile += (fx >> 3) + ((fy >> 3) << 4); fx &= 7; fy &= 7; }
    const a = (chrBase + (tile & 0x3ff) * words) & 0x7fff, sh = 7 - fx;
    let v = 0;
    for (let pl = 0; pl < bpp; pl += 2) {
      const w = s.vram[(a + (pl >> 1) * 8 + fy) & 0x7fff];
      v |= ((w >> sh) & 1) << pl; v |= ((w >> (8 + sh)) & 1) << (pl + 1);
    }
    // the alpha byte carries the tile's priority (0xFF high, 0xFE low) and BG3 palette (low bits)
    if (v) out[x] = ((pals[bpp === 8 ? v : palBase + ((e >> 10) & 7) * (1 << bpp) + v] & 0x00ffffff) | ((e & 0x2000 ? 0xff : 0xf0 | ((e >> 10) & 7)) << 24)) >>> 0;
  }
}

const SPAN = 2048, BASE = 512;   // strip storage: u from -512 to 1535

// Accumulates background lines while the camera moves.
class Recorder {
  constructor(layers, lines = 224) {
    this.layers = layers; this.lines = lines;
    this.data = new Map();
    this.buf = new Uint32Array(256);
    this.refMin = Infinity; this.refMax = -Infinity;
  }
  sample(s, ref) {
    this.refMin = Math.min(this.refMin, ref); this.refMax = Math.max(this.refMax, ref);
    if (this.bg3prio === undefined) this.bg3prio = ((s.ppuMid || s.ppu)[0x05] & 0x0f) === 9;
    if (this.backdrop === undefined) this.backdrop = Array.from(s.lineBackdrop.subarray(0, this.lines), bgr15);
    const pals = Array.from(s.cgram, bgr15);
    for (const bg of this.layers) {
      for (let y = 0; y < this.lines; y++) {
        const hs = s.lineScroll[y * 8 + bg * 2], vs = s.lineScroll[y * 8 + bg * 2 + 1];
        const key = bg * 1000 + y;
        let d = this.data.get(key);
        if (!d) { d = { samples: [], px: new Uint32Array(SPAN), votes: new Int16Array(SPAN), lo: Infinity, hi: -Infinity, prev: null }; this.data.set(key, d); }
        // unwrap the 10-bit scroll against the previous sample
        let h = hs & 0x3ff;
        if (d.prev !== null) { while (h - d.prev > 512) h -= 1024; while (d.prev - h > 512) h += 1024; }
        d.prev = h;
        d.samples.push([ref, h]);
        fetchLine(s, bg, y, h & 0x3ff, (vs << 22) >> 22, this.buf, pals);
        // every pixel keeps the value it showed most often (a majority vote), so
        // passing things (banners, effects, half-streamed columns) drop out
        for (let x = 0; x < 256; x++) {
          const u = h + x + BASE;
          if (u < 0 || u >= SPAN) continue;
          const v = this.buf[x];
          if (d.votes[u] === 0) { d.px[u] = v; d.votes[u] = 1; } else if (d.px[u] === v) d.votes[u]++; else d.votes[u]--;
          if (u < d.lo) d.lo = u; if (u > d.hi) d.hi = u;
        }
      }
    }
  }
  finish(backdrop) {
    // every line keeps its scroll for each camera position seen (the games'
    // parallax isn't always linear): refs is shared, scrolls[i] matches refs[i]
    const refSet = new Set();
    for (const d of this.data.values()) for (const [r] of d.samples) refSet.add(r);
    const refs = Int16Array.from([...refSet].sort((x, y) => x - y));
    const layers = [];
    for (const bg of this.layers) {
      const lines = [];
      for (let y = 0; y < this.lines; y++) {
        const d = this.data.get(bg * 1000 + y);
        if (!d || d.hi < d.lo) { lines.push(null); continue; }
        const sum = new Float64Array(refs.length), cnt = new Uint16Array(refs.length);
        for (const [r, h] of d.samples) { const i = refs.indexOf(r); sum[i] += h; cnt[i]++; }
        const scroll = new Int16Array(refs.length);
        let last = d.samples[0][1];
        for (let i = 0; i < refs.length; i++) { if (cnt[i]) last = Math.round(sum[i] / cnt[i]); scroll[i] = last; }
        const strip = d.px.slice(d.lo, d.hi + 1);
        lines.push(strip.some(c => c) ? { scroll, u0: d.lo - BASE, strip } : null);
      }
      // lines the game leaves blank (above and below the picture) copy the nearest one
      // (only a few lines: the game blanks the screen there; elsewhere empty means empty)
      const first = lines.findIndex(Boolean);
      if (first > 0 && first <= 32) for (let y = 0; y < first; y++) lines[y] = lines[Math.min(lines.length - 1, 2 * first - y)] || lines[first];
      let last = lines.length - 1; while (last > 0 && !lines[last]) last--;
      if (last >= lines.length - 16) for (let y = last + 1; y < lines.length; y++) lines[y] = lines[last];
      layers.push({ bg, lines });
    }
    return { refMin: refs[0], refMax: refs[refs.length - 1], refs, layers, backdrop: this.backdrop ?? backdrop, bg3prio: this.bg3prio };
  }
}

// Our pad bits (see game/commands.js) to each game's SNES buttons
const OUR = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, LP: 16, HP: 32, LK: 64, HK: 128, BL: 256 };
const SNES_BUTTONS = {
  sf2: { LP: PAD.Y, HP: PAD.L, LK: PAD.B, HK: PAD.R, BL: 0 },
  mk: { LP: PAD.B, HP: PAD.Y, LK: PAD.A, HK: PAD.X, BL: PAD.L },
};
function toSnes(game, pad) {
  let v = 0;
  if (pad & OUR.UP) v |= PAD.UP; if (pad & OUR.DOWN) v |= PAD.DOWN; if (pad & OUR.LEFT) v |= PAD.LEFT; if (pad & OUR.RIGHT) v |= PAD.RIGHT;
  for (const k of ['LP', 'HP', 'LK', 'HK', 'BL']) if (pad & OUR[k]) v |= SNES_BUTTONS[game][k];
  return v;
}

const FRAME_CYCLES = 1024000 / 60;

// Copy of the sound CPU's state, enough to keep its music playing elsewhere
function soundSnapshot(s) {
  const spc = s.spc, st = {};
  for (const k of ['a', 'x', 'y', 'sp', 'pc', 'n', 'v', 'p', 'b', 'h', 'i', 'z', 'c', 'iplEnabled', 'dspAddr']) st[k] = spc[k];
  for (const k of ['timerEnable', 'timerTarget', 'timerStage', 'timerOut', 'timerDiv']) st[k] = [...spc[k]];
  return { cpu: st, ram: spc.ram.slice(), inPorts: spc.inPorts.slice(), outPorts: spc.outPorts.slice(), dsp: spc.dsp.regs.slice() };
}

export class StageCapturer {
  constructor(game, rom) {
    this.game = game === 'sf' ? 'sf2' : game; this.rom = rom;
    this.base = null;
  }

  // Run `steps` ([pad, frames] with our pad bits) and return the sounds started
  // that aren't part of the music: [{ f: frame offset, rate, data }]
  listen(s, steps, music, extra = 0) {
    const dsp = s.spc.dsp;
    dsp.grabSamples = true; dsp.keyOns.length = 0;
    const t0 = s.spc.cycles;
    for (const [pad, n] of steps) run(s, n, toSnes(this.game, pad));
    if (extra) run(s, extra);
    dsp.grabSamples = false;
    const out = [];
    for (const k of dsp.keyOns) {
      if (music.has(k.srcn) || !k.data || k.data.length < 64) continue;
      const f = Math.round((k.t - t0) / FRAME_CYCLES);
      // the same sound started on two voices at once (stereo): keep one
      if (out.some(o => o.f === f && o.srcn === k.srcn)) continue;
      out.push({ f, srcn: k.srcn, rate: 32000 * k.pitch / 4096, data: k.data });
    }
    dsp.keyOns.length = 0;
    // times relative to the first sound; nothing past three seconds
    const f0 = out.length ? Math.min(...out.map(o => o.f)) : 0;
    return out.map(o => ({ ...o, f: o.f - f0 })).filter(o => o.f < 180);
  }

  // Sound events for one fighter: round start, hits, specials, KO
  sounds(s, specials, health, music, intro) {
    const ev = {};
    if (intro) ev.roundStart = intro;
    const start = s.saveState();
    const approach = [[OUR.RIGHT, 70], [0, 6]];
    const tryEvent = (name, steps, extra = 50) => { s.loadState(start); const r = this.listen(s, steps, music, extra); if (r.length) ev[name] = r; };
    tryEvent('hit', [...approach, [OUR.LP, 4]], 40);
    tryEvent('hitHeavy', [...approach, [OUR.HP, 4]], 50);
    tryEvent('swing', [[OUR.HK, 4]], 30);
    tryEvent('land', [[OUR.UP, 6]], 60);
    // the swing sound is played on its own when an attack starts: keep it out of the hit events
    const swing = new Set((ev.swing || []).map(p => p.srcn));
    for (const k of ['hit', 'hitHeavy', 'ko']) if (ev[k]) {
      const parts = ev[k].filter(p => !swing.has(p.srcn));
      const f0 = parts.length ? Math.min(...parts.map(p => p.f)) : 0;
      if (parts.length) ev[k] = parts.map(p => ({ ...p, f: p.f - f0 })); else delete ev[k];
    }
    const ai = new AI(4);
    ai.chargeTime = 75;   // the games want a longer charge than ours
    for (const sp of specials) {
      ai.queue = [];
      ai.push(...ai.motion(sp, ai.buttonFor(sp)));
      const steps = ai.queue.map(q => [q.pad, q.n]);
      tryEvent('special:' + sp.name, [[0, 2], ...steps], 90);
    }
    // KO: leave the opponent one point of health and hit them
    s.loadState(start);
    health(1);
    const ko = this.listen(s, [...approach, [OUR.HP, 4]], music, 240);
    if (ko.length) ev.ko = ko;
    return ev;
  }

  // SF2: stage id = the owner's character id (0 Ryu .. 7 Dhalsim). The owner
  // fights (as player 1) so their voices are loaded and can be recorded.
  captureSf2(stage, specials = []) {
    const s = new SNES(this.rom);
    if (!this.base) {
      run(s, 1500); tap(s, PAD.START, 4, 120); tap(s, PAD.START, 4, 120);
      run(s, 6, 0, PAD.START); run(s, 40);              // player 2 joins: versus
      this.base = s.saveState();
    } else s.loadState(this.base);
    s.cpu.hooks = new Map([[0x00e90b, c => { c.a = (c.a & 0xff00) | stage; }]]);
    s.wram[0xcd1] = stage; s.wram[0xed1] = stage === 0 ? 4 : 0;
    const keepAlive = () => { s.wram[0xc2b] = s.wram[0xc35] = 0xb0; s.wram[0xe2b] = s.wram[0xe35] = 0xb0; };
    s.spc.dsp.grabSamples = true; s.spc.dsp.keyOns.length = 0;
    const t0 = s.spc.cycles;
    tap(s, PAD.B, 4, 30); run(s, 6, 0, PAD.B);
    run(s, 1150, 0, 0, keepAlive);
    // the announcer: sounds in the last two seconds before the fight starts
    const introAll = s.spc.dsp.keyOns.map(k => ({ f: Math.round((k.t - t0) / FRAME_CYCLES), srcn: k.srcn, rate: 32000 * k.pitch / 4096, data: k.data }));
    s.spc.dsp.grabSamples = false;
    // music: what plays for a few seconds of idling
    const music = new Set();
    s.spc.dsp.keyOns.length = 0;
    run(s, 300, 0, 0, () => { keepAlive(); });
    for (const k of s.spc.dsp.keyOns) music.add(k.srcn);
    s.spc.dsp.keyOns.length = 0;
    const musicSnap = soundSnapshot(s);
    const intro = introAll.filter(k => !music.has(k.srcn) && k.f > 450 && k.data && k.data.length > 64);
    const t1 = intro.length ? intro[0].f : 0; intro.forEach(k => { k.f -= t1; });
    intro.splice(0, intro.length, ...intro.filter(k => k.f < 120));
    const fight = s.saveState();
    const sounds = this.sounds(s, specials, v => { s.wram[0xe2b] = s.wram[0xe35] = v; }, music, intro);
    s.loadState(fight);
    // sweep the camera ($19E7) across the stage; the game clamps it to the stage
    const rec = new Recorder([0, 1]);
    const cam = () => s.wram[0x19e7] | (s.wram[0x19e8] << 8);
    const setCam = v => { s.wram[0x19e7] = v & 0xff; s.wram[0x19e8] = (v >> 8) & 0xff; };
    // the game streams new tile columns as the camera moves, so move it smoothly:
    // first to the left end, then all the way to the right end, recording all along
    let want = cam();
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 400; i++) {
        want += 2 * dir;
        keepAlive(); setCam(want); s.runFrame();
        rec.sample(s, cam());
        if (Math.abs(cam() - want) > 12) { want = cam(); break; }   // clamped: reached the end
      }
    }
    return { ...rec.finish(bgr15(s.cgram[0])), music: musicSnap, sounds };
  }

  // MK: stage = 0..6 (the game picks $000C mod 7). Player 1 is `fighter`.
  captureMk(stage, fighter = 1, specials = []) {
    const s = new SNES(this.rom);
    if (!this.base) {
      for (let k = 0; k < 10; k++) for (let f = 0; f < 150; f++) { s.joy[0] = (f % 30) < 8 && k > 3 ? PAD.START : 0; s.runFrame(); if (k > 8 && f > 60) break; }
      s.joy[0] = 0;
      run(s, 120);
      run(s, 6, 0, PAD.START); run(s, 30);            // player 2 joins: a two-player fight
      this.base = s.saveState();
    } else s.loadState(this.base);
    s.wram[0x201] = s.wram[0x19ae] = fighter; s.wram[0x1b10] = fighter === 1 ? 5 : 1;
    s.cpu.hooks = new Map([[0xa4b381, () => { s.wram[0x0c] = stage; s.wram[0x0d] = 0; }]]);
    s.spc.dsp.grabSamples = true; s.spc.dsp.keyOns.length = 0;
    const t0 = s.spc.cycles;
    run(s, 6, PAD.B); run(s, 30); run(s, 6, 0, PAD.B);
    run(s, 1400);
    const introAll = s.spc.dsp.keyOns.map(k => ({ f: Math.round((k.t - t0) / FRAME_CYCLES), srcn: k.srcn, rate: 32000 * k.pitch / 4096, data: k.data }));
    s.spc.dsp.grabSamples = false;
    const music = new Set();
    s.spc.dsp.keyOns.length = 0;
    run(s, 300);
    for (const k of s.spc.dsp.keyOns) music.add(k.srcn);
    s.spc.dsp.keyOns.length = 0;
    const musicSnap = soundSnapshot(s);
    const intro = introAll.filter(k => !music.has(k.srcn) && k.f > 600 && k.data && k.data.length > 64);
    const t1 = intro.length ? intro[0].f : 0; intro.forEach(k => { k.f -= t1; });
    intro.splice(0, intro.length, ...intro.filter(k => k.f < 120));
    const fight = s.saveState();
    const sounds = this.sounds(s, specials, v => { s.wram[0x4fb] = v; }, music, intro);
    s.loadState(fight);
    const rec = new Recorder([0, 1]);   // BG3 holds the status bar
    const cam = () => s.wram[0x42b] | (s.wram[0x42c] << 8);
    const setCam = v => { s.wram[0x42b] = v & 0xff; s.wram[0x42c] = (v >> 8) & 0xff; };
    let want = cam();
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 500; i++) {
        want += 2 * dir;
        setCam(want); s.runFrame();
        rec.sample(s, cam());
        if (Math.abs(cam() - want) > 12) { want = cam(); break; }
      }
    }
    return { ...rec.finish(bgr15(s.cgram[0])), music: musicSnap, sounds };
  }
}
