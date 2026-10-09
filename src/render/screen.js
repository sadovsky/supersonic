// Browser compositor: NES layers are upscaled with nearest-neighbour, and
// Sonic is drawn on top at the canvas's full resolution so his Genesis art
// stays sharp.

import { NesRenderer } from './nesRenderer.js';
import { placeSonic } from './sonicPlacement.js';

function toCanvas(img, tint) {
  const c = document.createElement('canvas');
  c.width = img.w; c.height = img.h;
  const ctx = c.getContext('2d');
  const data = new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h);
  if (tint) {
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      // turn the blue shield into a fiery one (swap blue into red/orange)
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = Math.max(b, r); d[i + 1] = Math.round((g + b) * 0.45); d[i + 2] = Math.round(r * 0.3);
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export class Screen {
  constructor(canvas, chr, sonicAssets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nes = new NesRenderer(chr);
    this.assets = sonicAssets;
    this.layers = ['back', 'bg', 'front'].map(() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 240;
      const ctx = c.getContext('2d');
      return { c, ctx, img: ctx.createImageData(256, 240) };
    });
    // cache Sonic frames as canvases, keyed by the RGBA object
    this.cache = new Map();
    this.scale = 3;
  }

  imageFor(img, tint) {
    const key = tint ? 'fire' : 'plain';
    let m = this.cache.get(img);
    if (!m) { m = {}; this.cache.set(img, m); }
    if (!m[key]) m[key] = toCanvas(img, tint);
    return m[key];
  }

  resize(cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    // 8:7 pixel aspect is what a TV showed; keep square pixels for crispness
    const s = Math.max(1, Math.min(cssW / 256, cssH / 240));
    const w = Math.floor(256 * s), h = Math.floor(240 * s);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scale = this.canvas.width / 256;
  }

  draw(m, sonicDisplay) {
    const nes = this.nes;
    nes.hidden = new Set(sonicDisplay ? sonicDisplay.slots.map(s => s[0]) : []);
    nes.render(m, m.oam, m.frameTop, m.frameMain, m.splitSeen ? 32 : 0);
    const bufs = [nes.back, nes.bg, nes.front];
    this.layers.forEach((L, i) => {
      new Uint32Array(L.img.data.buffer).set(bufs[i]);
      L.ctx.putImageData(L.img, 0, 0);
    });
    const ctx = this.ctx, s = this.scale;
    ctx.imageSmoothingEnabled = false;
    const W = this.canvas.width, H = this.canvas.height;
    const ops = placeSonic(sonicDisplay, this.assets);
    const drawOps = (behind) => {
      for (const op of ops) {
        if (!!op.behind !== behind) continue;
        const img = this.imageFor(op.img, op.fire);
        ctx.save();
        if (op.alpha) ctx.globalAlpha = op.alpha;
        const x = op.x * s, y = op.y * s, w = op.w * s, h = op.h * s;
        if (op.flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
        else ctx.drawImage(img, x, y, w, h);
        ctx.restore();
      }
    };
    ctx.drawImage(this.layers[0].c, 0, 0, W, H);
    drawOps(true);
    ctx.drawImage(this.layers[1].c, 0, 0, W, H);
    ctx.drawImage(this.layers[2].c, 0, 0, W, H);
    drawOps(false);
  }
}
