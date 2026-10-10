// Turns a running game's PPU state into stage images: each background layer
// rendered over its whole tilemap, plus the scroll it had when captured.

const bgr15 = c => {
  const r = (c & 31) << 3, g = ((c >> 5) & 31) << 3, b = ((c >> 10) & 31) << 3;
  return ((255 << 24) | ((b | b >> 5) << 16) | ((g | g >> 5) << 8) | (r | r >> 5)) >>> 0;
};

const BPP = { 0: [2, 2, 2, 2], 1: [4, 4, 2, 0], 2: [4, 4, 0, 0], 3: [8, 4, 0, 0], 4: [8, 2, 0, 0], 5: [4, 2, 0, 0], 6: [4, 0, 0, 0], 7: [0, 0, 0, 0] };

export function renderLayer(s, bg, ppu = s.ppuMid || s.ppu) {
  const mode = ppu[0x05] & 7, bpp = BPP[mode][bg];
  if (!bpp) return null;
  const sc = ppu[0x07 + bg];
  const mapBase = (sc & 0xfc) << 8;
  const mapW = sc & 1 ? 64 : 32, mapH = sc & 2 ? 64 : 32;
  const nba = bg < 2 ? ppu[0x0b] : ppu[0x0c];
  const chrBase = ((bg & 1 ? nba >> 4 : nba) & 0xf) << 12;
  const W = mapW * 8, H = mapH * 8;
  const data = new Uint32Array(W * H);
  const pals = [];
  for (let i = 0; i < 256; i++) pals.push(bgr15(s.cgram[i]));
  const palBase = mode === 0 ? bg * 32 : 0;
  for (let ty = 0; ty < mapH; ty++) for (let tx = 0; tx < mapW; tx++) {
    let ma = mapBase + ((ty & 31) << 5) + (tx & 31);
    if (tx & 32) ma += 0x400;
    if (ty & 32) ma += mapW === 64 ? 0x800 : 0x400;
    const e = s.vram[ma & 0x7fff];
    const tile = e & 0x3ff, pal = (e >> 10) & 7, hf = e & 0x4000, vf = e & 0x8000;
    const words = bpp * 4;
    const a = (chrBase + tile * words) & 0x7fff;
    for (let y = 0; y < 8; y++) {
      const fy = vf ? 7 - y : y;
      for (let x = 0; x < 8; x++) {
        const fx = hf ? 7 - x : x, sh = 7 - fx;
        let v = 0;
        for (let pl = 0; pl < bpp; pl += 2) {
          const w = s.vram[(a + (pl >> 1) * 8 + fy) & 0x7fff];
          v |= ((w >> sh) & 1) << pl;
          v |= ((w >> (8 + sh)) & 1) << (pl + 1);
        }
        if (!v) continue;
        const ci = bpp === 8 ? v : palBase + pal * (1 << bpp) + v;
        data[(ty * 8 + y) * W + tx * 8 + x] = pals[ci];
      }
    }
  }
  return { w: W, h: H, data };
}

// Snapshot of what a stage needs: layer images, scrolls, main-screen layers, backdrop colour
export function captureStage(s) {
  const ppu = (s.ppuMid || s.ppu).slice();
  const scroll = (s.scrollMid || s.scroll).slice();
  const layers = [];
  for (let bg = 0; bg < 4; bg++) {
    if (!((ppu[0x2c] | ppu[0x2d]) & (1 << bg))) continue;
    const img = renderLayer(s, bg, ppu);
    if (img) layers.push({ bg, img, hs: scroll[bg * 2], vs: scroll[bg * 2 + 1] });
  }
  return { mode: ppu[0x05] & 7, layers, backdrop: bgr15(s.cgram[0]), lineScroll: s.lineScroll ? s.lineScroll.slice() : null };
}
