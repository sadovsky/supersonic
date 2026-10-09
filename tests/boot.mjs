import fs from 'node:fs';
import { parseSmbRom } from '../src/rom/smbRom.js';
import { SmbCore, BTN } from '../src/game/core.js';
import { NesRenderer } from '../src/render/nesRenderer.js';
import { writePng } from './png.mjs';

const romDir = process.env.ROMS;
const smb = await parseSmbRom(new Uint8Array(fs.readFileSync(romDir + '/smb.nes')));
const core = new SmbCore(smb.prg, smb.chr);
core.boot();
const r = new NesRenderer(smb.chr);
const snap = (name) => {
  const m = core.m;
  r.render(m, m.oam, m.frameTop, m.frameMain, m.splitSeen ? 32 : 0);
  const out = new Uint32Array(256 * 240);
  for (let i = 0; i < out.length; i++) out[i] = r.front[i] || (r.bgOpaque[i] ? r.bg[i] : r.back[i]);
  writePng(`${process.env.OUT}/${name}.png`, 256, 240, new Uint8Array(out.buffer));
};
const script = JSON.parse(process.argv[2] || '[]'); // [[frames, buttons], ...]
let n = 0;
const t0 = Date.now();
for (const [frames, buttons, shot] of script) {
  for (let i = 0; i < frames; i++) core.frame(buttons);
  n += frames;
  if (shot) snap(shot);
}
console.log('frames', n, 'ms', Date.now() - t0, 'steps', core.m.cpu.steps);
