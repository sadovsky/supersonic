// Capture a stage with its sounds and write each sound event to WAV: node tools/soundtest.mjs sf|mk id
import fs from 'node:fs';
import { StageCapturer } from '../src/stage/capturer.js';
import { ROSTER } from '../src/game/roster.js';
import { ROMS, SF, MK, OUT } from './harness.mjs';
const [game, id] = process.argv.slice(2);
const cap = new StageCapturer(game, new Uint8Array(fs.readFileSync(`${ROMS}/${game === 'mk' ? MK : SF}`)));
const entry = ROSTER.find(e => e.game === (game === 'mk' ? 'mk' : 'sf2') && e.index === +id);
const t0 = Date.now();
const d = game === 'mk' ? cap.captureMk(+id, +id, entry.specials) : cap.captureSf2(+id, entry.specials);
console.log(entry.name, 'captured in', Date.now() - t0, 'ms');
for (const [name, list] of Object.entries(d.sounds)) { if (!list.length) continue;
  console.log(name.padEnd(28), list.map(k => `f${k.f}:s${k.srcn} ${(k.data.length / k.rate).toFixed(2)}s@${Math.round(k.rate)}`).join('  '));
  // mix to a wav at 32 kHz
  const len = Math.max(...list.map(k => Math.round(k.f / 60 * 32000 + k.data.length / k.rate * 32000))) + 100;
  const mix = new Float32Array(len);
  for (const k of list) { const o = Math.round(k.f / 60 * 32000), step = k.rate / 32000; for (let i = 0; i * step < k.data.length; i++) mix[o + i] += k.data[Math.floor(i * step)] * 0.8; }
  const pcm = Int16Array.from(mix, v => Math.max(-32768, Math.min(32767, v * 32767)));
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(32000, 24); h.writeUInt32LE(64000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length * 2, 40);
  fs.writeFileSync(`${OUT}/snd_${game}${id}_${name.replace(/\W+/g, '_')}.wav`, Buffer.concat([h, Buffer.from(pcm.buffer)]));
}
