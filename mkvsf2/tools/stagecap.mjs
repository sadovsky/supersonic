import { sfVersus } from './sf-fight.mjs';
import { mkVersus } from './mk-fight.mjs';
import { captureStage } from '../src/stage/capture.js';
import { writePng } from '../tests/png.mjs';
import { OUT } from './harness.mjs';
const [game, a = 0, b = 7] = process.argv.slice(2);
const s = game === 'mk' ? mkVersus(+a, +b) : sfVersus(+a, +b);
const cap = captureStage(s);
console.log('mode', cap.mode, 'TM', (s.ppuMid||s.ppu)[0x2c].toString(16), 'TS', (s.ppuMid||s.ppu)[0x2d].toString(16));
for (const l of cap.layers) {
  console.log('bg', l.bg + 1, l.img.w + 'x' + l.img.h, 'scroll', l.hs, l.vs);
  const bytes = new Uint8Array(l.img.data.buffer.slice(0));
  for (let i = 0; i < l.img.w * l.img.h; i++) if (!l.img.data[i]) { bytes[i * 4] = 255; bytes[i * 4 + 1] = 0; bytes[i * 4 + 2] = 255; bytes[i * 4 + 3] = 255; }
  writePng(`${OUT}/layer_${game}_${l.bg}.png`, l.img.w, l.img.h, bytes);
}
for (const y of [0, 20, 40, 80, 120, 150, 170, 190, 200, 210, 220]) console.log('line', y, [...s.lineScroll.slice(y * 8, y * 8 + 6)].join(','));
import('./harness.mjs').then(h => h.snap(s, 'stagecap_full'));
