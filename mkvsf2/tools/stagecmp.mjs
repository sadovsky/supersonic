// Compare a captured SF2 stage with the emulator's own frame at the same camera
import fs from 'node:fs';
import { StageCapturer } from '../src/stage/capturer.js';
import { makeStage } from '../src/stage/stage.js';
import { Renderer } from '../src/render/renderer.js';
import { writePng } from '../tests/png.mjs';
import { ROMS, SF, OUT } from './harness.mjs';
const id = +process.argv[2];
const cap = new StageCapturer('sf2', new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`)));
const data = cap.captureSf2(id, []);
const s = cap.last; if (!s) throw new Error('set this.last = s in captureSf2 to compare');
const camNow = s.wram[0x19e7] | s.wram[0x19e8] << 8;
writePng(`${OUT}/cmp_emu.png`, 256, 224, s.renderFrame({ layers: +(process.env.L || 3), ignoreBrightness: true }));
const st = makeStage(data, { ground: 208 });
const r = new Renderer(256, 224);
st.draw(r, camNow - data.refMin);
writePng(`${OUT}/cmp_cap.png`, 256, 224, r.bytes);
console.log('cam', camNow, data.refMin, data.refMax);
