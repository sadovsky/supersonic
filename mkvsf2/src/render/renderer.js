// Software renderer into a 32-bit RGBA frame buffer (little-endian ABGR words).
// The browser shows the buffer on a canvas scaled with crisp pixels; the
// headless tests write it to PNG.

import { glyph, FONT_W, FONT_H } from './font.js';

export const rgb = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;

export class Renderer {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.bytes = new Uint8ClampedArray(w * h * 4);
    this.buf = new Uint32Array(this.bytes.buffer);
  }

  clear(c) { this.buf.fill(c); }

  fillRect(x, y, w, h, c, alpha = 1) {
    x = Math.round(x); y = Math.round(y);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      if (alpha >= 1) this.buf.fill(c, row + x0, row + x1);
      else for (let xx = x0; xx < x1; xx++) this.buf[row + xx] = blend(this.buf[row + xx], c, alpha);
    }
  }

  // Vertical gradient between two colours
  gradient(y, h, c0, c1) {
    for (let i = 0; i < h; i++) this.fillRect(0, y + i, this.w, 1, mix(c0, c1, i / Math.max(1, h - 1)));
  }

  // Draw an indexed frame with its origin at (sx, sy).
  // opts: flip, tint (rgb word), tintAmount 0..1, alpha, silhouette (rgb word)
  sprite(fr, sx, sy, flip = false, opts = {}) {
    const pal = opts.pal || fr.pal;
    const x0 = Math.round(flip ? sx - (fr.w - fr.ox) : sx - fr.ox);
    const y0 = Math.round(sy - fr.oy);
    const { w, h, pix } = fr;
    const tint = opts.tint, ta = opts.tintAmount ?? 0.5, alpha = opts.alpha ?? 1;
    for (let y = 0; y < h; y++) {
      const Y = y0 + y; if (Y < 0 || Y >= this.h) continue;
      const row = Y * this.w;
      for (let x = 0; x < w; x++) {
        const v = pix[y * w + (flip ? w - 1 - x : x)];
        if (!v) continue;
        const X = x0 + x; if (X < 0 || X >= this.w) continue;
        let c = opts.silhouette !== undefined ? opts.silhouette : pal[v];
        if (tint !== undefined) c = mix(c, tint, ta);
        this.buf[row + X] = alpha >= 1 ? c : blend(this.buf[row + X], c, alpha);
      }
    }
  }

  // Nearest-neighbour scaled sprite, origin at (sx, sy)
  spriteScaled(fr, sx, sy, scale, flip = false, opts = {}) {
    const pal = opts.pal || fr.pal;
    const W = Math.ceil(fr.w * scale), H = Math.ceil(fr.h * scale);
    const x0 = Math.round(sx - (flip ? fr.w - fr.ox : fr.ox) * scale), y0 = Math.round(sy - fr.oy * scale);
    const clip = opts.clip || { x0: 0, y0: 0, x1: this.w, y1: this.h };
    for (let y = 0; y < H; y++) {
      const Y = y0 + y; if (Y < clip.y0 || Y >= clip.y1) continue;
      const srow = Math.min(fr.h - 1, (y / scale) | 0) * fr.w;
      for (let x = 0; x < W; x++) {
        const X = x0 + x; if (X < clip.x0 || X >= clip.x1) continue;
        let sxp = Math.min(fr.w - 1, (x / scale) | 0); if (flip) sxp = fr.w - 1 - sxp;
        const v = fr.pix[srow + sxp];
        if (!v) continue;
        let c = opts.silhouette !== undefined ? opts.silhouette : pal[v];
        if (opts.tint !== undefined) c = mix(c, opts.tint, opts.tintAmount ?? 0.5);
        this.buf[Y * this.w + X] = c;
      }
    }
  }

  // A pre-rendered layer {w, h, data: Uint32Array, 0 = transparent} at an offset, wrapping horizontally
  layer(img, ox, oy, wrap = false) {
    ox = Math.round(ox); oy = Math.round(oy);
    for (let y = 0; y < this.h; y++) {
      const sy = y - oy; if (sy < 0 || sy >= img.h) continue;
      const row = y * this.w, srow = sy * img.w;
      for (let x = 0; x < this.w; x++) {
        let sx = x - ox;
        if (wrap) sx = ((sx % img.w) + img.w) % img.w; else if (sx < 0 || sx >= img.w) continue;
        const c = img.data[srow + sx];
        if (c) this.buf[row + x] = c;
      }
    }
  }

  textWidth(s, scale = 1) { return s.length * FONT_W * scale; }

  text(s, x, y, c, scale = 1, shadow = rgb(0, 0, 0)) {
    if (shadow !== null) this.textRaw(s, x + scale, y + scale, shadow, scale);
    this.textRaw(s, x, y, c, scale);
  }

  textRaw(s, x, y, c, scale) {
    x = Math.round(x); y = Math.round(y);
    for (const ch of s) {
      const g = glyph(ch);
      for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r * 5 + k] === '1') {
        const col = typeof c === 'function' ? c(r / 6) : c;
        this.fillRect(x + k * scale, y + r * scale, scale, scale, col);
      }
      x += FONT_W * scale;
    }
  }

  textCenter(s, cx, y, c, scale = 1, shadow) { this.text(s, cx - this.textWidth(s, scale) / 2, y, c, scale, shadow); }
}

export function mix(a, b, t) {
  const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
  const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
  return rgb(ar + (br - ar) * t | 0, ag + (bg - ag) * t | 0, ab + (bb - ab) * t | 0);
}
function blend(dst, src, a) { return mix(dst, src, a); }
