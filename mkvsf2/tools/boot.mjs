// Boot a ROM headlessly and save snapshots: node tools/boot.mjs rom.sfc outdir frames [input script]
import fs from 'node:fs';
import { SNES, PAD } from '../src/snes/snes.js';
import { writePng } from '../tests/png.mjs';
const [rom, out, frames = '300', every = '60'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const s = new SNES(new Uint8Array(fs.readFileSync(rom)));
const t0 = Date.now();
for (let f = 0; f < +frames; f++) {
  // press START on some frames to get through menus
  s.joy[0] = (f % 120 > 100 && f > 600) ? PAD.START : 0;
  try { s.runFrame(); } catch (e) { console.log('frame', f, e.message, 'pc', s.cpu.pbr.toString(16), s.cpu.pc.toString(16)); break; }
  if (f % +every === 0) writePng(`${out}/f${String(f).padStart(5, '0')}.png`, 256, 224, s.renderFrame());
}
console.log('done', Date.now() - t0, 'ms', 'pc', s.cpu.pbr.toString(16), s.cpu.pc.toString(16), 'spc pc', s.spc.pc.toString(16));
