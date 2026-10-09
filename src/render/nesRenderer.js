// Draws what SMB put in nametables/OAM using the CHR tiles from the ROM.
// Output is three 256x240 RGBA layers so a high-resolution Sonic can be
// composited between them:
//   back   = backdrop colour + sprites flagged "behind background"
//   bg     = background tiles (transparent where colour index is 0)
//   front  = normal sprites

// FCEUX-style NES palette (gives SMB its familiar #5C94FC sky).
const NES_RGB = [
  0x747474, 0x24188c, 0x0000a8, 0x44009c, 0x8c0074, 0xa80010, 0xa40000, 0x7c0800,
  0x402c00, 0x004400, 0x005000, 0x003c14, 0x183c5c, 0x000000, 0x000000, 0x000000,
  0xbcbcbc, 0x0070ec, 0x2038ec, 0x8000f0, 0xbc00bc, 0xe40058, 0xd82800, 0xc84c0c,
  0x887000, 0x009400, 0x00a800, 0x009038, 0x008088, 0x000000, 0x000000, 0x000000,
  0xfcfcfc, 0x3cbcfc, 0x5c94fc, 0xcc88fc, 0xf478fc, 0xfc74b4, 0xfc7460, 0xfc9838,
  0xf0bc3c, 0x80d010, 0x4cdc48, 0x58f898, 0x00e8d8, 0x787878, 0x000000, 0x000000,
  0xfcfcfc, 0xa8e4fc, 0xc4d4fc, 0xd4c8fc, 0xfcc4fc, 0xfcc4d8, 0xfcbcb0, 0xfcd8a8,
  0xfce4a0, 0xe0fca0, 0xa8f0bc, 0xb0fccc, 0x9cfcf0, 0xc4c4c4, 0x000000, 0x000000,
];

// little-endian ABGR words for writing into Uint32 views of ImageData
export const NES_ABGR = NES_RGB.map(c => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0);
export const nesRgb = i => NES_RGB[i & 0x3f];

export class NesRenderer {
  constructor(chr) {
    // decode all 512 CHR tiles to colour indices once
    this.tiles = new Uint8Array(512 * 64);
    for (let t = 0; t < 512; t++) {
      for (let row = 0; row < 8; row++) {
        const lo = chr[t * 16 + row], hi = chr[t * 16 + row + 8];
        for (let col = 0; col < 8; col++) {
          const b = 7 - col;
          this.tiles[t * 64 + row * 8 + col] = ((lo >> b) & 1) | (((hi >> b) & 1) << 1);
        }
      }
    }
    this.back = new Uint32Array(256 * 240);
    this.bg = new Uint32Array(256 * 240);
    this.front = new Uint32Array(256 * 240);
    this.bgOpaque = new Uint8Array(256 * 240);
    this.hidden = new Set(); // OAM indices not to draw (the player's Mario sprites)
  }

  render(m, oam, top, main, splitLine) {
    const pal = m.palette;
    const backdrop = NES_ABGR[pal[0]];
    this.back.fill(backdrop);
    this.bg.fill(0);
    this.front.fill(0);
    this.bgOpaque.fill(0);
    const showBg = (m.mask & 0x08) !== 0;
    const showSpr = (m.mask & 0x10) !== 0;

    if (showBg) {
      this.renderBg(m, top, 0, splitLine);
      this.renderBg(m, main, splitLine, 240);
    }
    if (showSpr) this.renderSprites(m, oam, main.ctrl);
  }

  renderBg(m, st, y0, y1) {
    if (y1 <= y0) return;
    const nt = m.nametables, pal = m.palette, tiles = this.tiles;
    const base = (st.ctrl & 0x10) ? 256 : 0;
    const ntSel = st.ctrl & 1;
    for (let y = y0; y < y1; y++) {
      let wy = y + st.scrollY;
      let ntY = 0;
      if (wy >= 240) { wy -= 240; }
      const tileRow = wy >> 3, fineY = wy & 7;
      for (let x = 0; x < 256; x++) {
        const wx = (x + st.scrollX + ntSel * 256) & 511;
        const table = (wx >> 8) & 1;
        const tx = (wx & 255) >> 3;
        const ntBase = table * 0x400;
        const tileId = nt[ntBase + tileRow * 32 + tx];
        const c = tiles[(base + tileId) * 64 + fineY * 8 + (wx & 7)];
        if (c === 0) continue;
        const attr = nt[ntBase + 0x3c0 + (tileRow >> 2) * 8 + (tx >> 2)];
        const shift = ((tileRow & 2) << 1) | (tx & 2);
        const p = (attr >> shift) & 3;
        const i = y * 256 + x;
        this.bg[i] = NES_ABGR[pal[p * 4 + c]];
        this.bgOpaque[i] = 1;
      }
    }
  }

  renderSprites(m, oam, ctrl) {
    const pal = m.palette, tiles = this.tiles;
    const base = (ctrl & 0x08) ? 256 : 0;
    // draw from last to first so lower OAM indices end up on top
    for (let s = 63; s >= 0; s--) {
      if (this.hidden.has(s)) continue;
      const sy = oam[s * 4] + 1;
      if (sy >= 240) continue;
      const tile = oam[s * 4 + 1], attr = oam[s * 4 + 2], sx = oam[s * 4 + 3];
      const p = 4 + (attr & 3);
      const behind = (attr & 0x20) !== 0;
      const fh = (attr & 0x40) !== 0, fv = (attr & 0x80) !== 0;
      const layer = behind ? this.back : this.front;
      for (let r = 0; r < 8; r++) {
        const y = sy + r;
        if (y >= 240) break;
        const tr = fv ? 7 - r : r;
        for (let col = 0; col < 8; col++) {
          const x = sx + col;
          if (x >= 256) break;
          const tc = fh ? 7 - col : col;
          const c = tiles[(base + tile) * 64 + tr * 8 + tc];
          if (c === 0) continue;
          layer[y * 256 + x] = NES_ABGR[pal[p * 4 + c]];
        }
      }
    }
  }
}
