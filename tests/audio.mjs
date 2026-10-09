// Runs the APU worklet in Node against a real game session and writes a WAV.
import fs from 'node:fs';
import { scenario, R, BTN } from './scenario.mjs';
const SR = 44100;
let Proc;
globalThis.sampleRate = SR;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null, postMessage() {} }; } };
globalThis.registerProcessor = (name, cls) => { Proc = cls; };
await import('../src/audio/apu-worklet.js');
const apu = new Proc();
const t = await scenario();
const frames = +process.argv[2] || 600;
const out = new Float32Array(Math.ceil(frames * SR / 60.0988) + 1024);
let pos = 0;
const block = [new Float32Array(128)];
for (let f = 0; f < frames; f++) {
  t.frame(f > 60 && f % 90 < 20 ? BTN.RIGHT | BTN.A : BTN.RIGHT);
  apu.port.onmessage({ data: { type: 'frame', w: [...t.core.m.apuWrites], e: [...t.sonic.events] } });
  t.sonic.events.length = 0;
  // render roughly one frame of samples
  const need = Math.round((f + 1) * SR / 60.0988) - pos;
  let done = 0;
  while (done < need) {
    apu.process([], [block]);
    out.set(block[0].subarray(0, Math.min(128, need - done)), pos + done);
    done += 128;
  }
  pos += need;
}
const pcm = Buffer.alloc(44 + pos * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + pos * 2, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(pos * 2, 40);
let peak = 0;
for (let i = 0; i < pos; i++) { const v = Math.max(-1, Math.min(1, out[i])); peak = Math.max(peak, Math.abs(v)); pcm.writeInt16LE(Math.round(v * 32767), 44 + i * 2); }
fs.writeFileSync(process.env.OUT + '/game.wav', pcm);
console.log('samples', pos, 'peak', peak.toFixed(3));
