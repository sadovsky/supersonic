// 3x5 digit/hex font for labelling development sheets
const G = { 0: '75557', 1: '26227', 2: '71747', 3: '71717', 4: '55711', 5: '74717', 6: '74757', 7: '71111', 8: '75757', 9: '75717', a: '25755', b: '65656', c: '74447', d: '65556', e: '74647', f: '74644', ' ': '00000', ':': '02020', '-': '00700', x: '05250' };
export function text(img, W, x, y, s, rgb = [255, 255, 0]) {
  for (const ch of String(s).toLowerCase()) {
    const g = G[ch] || G[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((+('0x' + g[r]) >> (2 - c)) & 1) {
      for (let k = 0; k < 4; k++) { const p = ((y + r) * W + x + c) * 4; img[p] = rgb[0]; img[p + 1] = rgb[1]; img[p + 2] = rgb[2]; img[p + 3] = 255; }
    }
    x += 4;
  }
}
