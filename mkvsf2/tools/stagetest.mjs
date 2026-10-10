import fs from 'node:fs';
import { StageCapturer } from '../src/stage/capturer.js';
import { makeStage } from '../src/stage/stage.js';
import { Renderer } from '../src/render/renderer.js';
import { writePng } from '../tests/png.mjs';
import { ROMS, SF, MK, OUT } from './harness.mjs';
const [game, id] = process.argv.slice(2);
const cap = new StageCapturer(game, new Uint8Array(fs.readFileSync(`${ROMS}/${game === 'mk' ? MK : SF}`)));
const t0 = Date.now();
const data = game === 'mk' ? cap.captureMk(+id, +id, []) : cap.captureSf2(+id, []);
console.log('captured in', Date.now() - t0, 'ms', 'ref', data.refMin, data.refMax, data.layers.map(l => l.bg + ':' + l.lines.filter(Boolean).length).join(' '));
const st = makeStage(data);
const r = new Renderer(256, 224);
const files = [];
for (const k of [0, 0.5, 1]) { st.draw(r, (st.width - 256) * k); const f = `${OUT}/stage_${game}_${id}_${k}.png`; writePng(f, 256, 224, r.bytes); files.push(f); }
console.log(files.join(' '));
if (cap.last) { const s = cap.last; writePng(`${OUT}/stage_emu.png`, 256, 224, s.renderFrame()); const c = s.wram[0x42b] | s.wram[0x42c] << 8; st.draw(r, c - data.refMin); writePng(`${OUT}/stage_same.png`, 256, 224, r.bytes); console.log('cam', c, 'TMW', (s.ppuMid||s.ppu)[0x2e].toString(16), 'W', [...(s.ppuMid||s.ppu).slice(0x23, 0x2a)].map(v=>v.toString(16))); }
if (cap.last) { const s = cap.last; console.log([0, 10, 20, 30, 40, 60, 80, 100, 112, 130, 160, 180, 200, 220].map(y => `${y}:m${s.linePpu[y * 64 + 5].toString(16)} tm${s.linePpu[y * 64 + 0x2c].toString(16)} sc${s.linePpu[y * 64 + 7].toString(16)}/${s.linePpu[y * 64 + 8].toString(16)} tmw${s.linePpu[y*64+0x2e].toString(16)}`).join(' ')); }
for (const bg of [0, 1, 2]) { const st2 = makeStage({ ...data, layers: data.layers.filter(l => l.bg === bg), backdrop: 0xffff00ff }); st2.draw(r, 50); writePng(`${OUT}/stage_bg${bg}.png`, 256, 224, r.bytes); }
const L3 = data.layers.find(l => l.bg === 2); if (L3) console.log('bg3 lines', [20, 60, 100, 140].map(y => { const l = L3.lines[y]; return l ? `${y}: a${l.a.toFixed(1)} b${l.b.toFixed(2)} w${l.strip.length} nz${l.strip.filter(c => c).length} hi${l.strip.filter(c => c >>> 24 === 0xff).length}` : y + ':none'; }).join(' | '));
