// Snapshot the sound CPU during a fight and render its music to WAV: node tools/music.mjs sf|mk [secs]
import fs from 'node:fs';
import { sfVersus } from './sf-fight.mjs';
import { mkVersus } from './mk-fight.mjs';
import { SPC700 } from '../src/snes/spc700.js';
import { DSP } from '../src/snes/dsp.js';
import { OUT } from './harness.mjs';
const [game, secs = '10'] = process.argv.slice(2);
const s = game === 'mk' ? mkVersus(4, 1) : sfVersus(0, 7);
// copy the sound CPU into a standalone one
const spc = new SPC700();
Object.assign(spc, { a: s.spc.a, x: s.spc.x, y: s.spc.y, sp: s.spc.sp, pc: s.spc.pc, n: s.spc.n, v: s.spc.v, p: s.spc.p, b: s.spc.b, h: s.spc.h, i: s.spc.i, z: s.spc.z, c: s.spc.c, iplEnabled: s.spc.iplEnabled, dspAddr: s.spc.dspAddr });
spc.ram.set(s.spc.ram); spc.inPorts.set(s.spc.inPorts); spc.outPorts.set(s.spc.outPorts);
for (const k of ['timerEnable', 'timerTarget', 'timerStage', 'timerOut', 'timerDiv']) spc[k] = [...s.spc[k]];
spc.dsp = new DSP(spc); spc.dsp.regs.set(s.spc.dsp.regs); spc.dsp.synth = true;
// voices that were playing: restart nothing, the driver keys new notes on
const n = 32000 * +secs, pcm = new Int16Array(n * 2);
const t0 = Date.now();
let peak = 0;
for (let i = 0; i < n; i++) { spc.run(32); const [l, r] = spc.dsp.sampleOut(); pcm[i * 2] = Math.max(-32768, Math.min(32767, l * 32767)); pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, r * 32767)); peak = Math.max(peak, Math.abs(l)); }
console.log('rendered', secs, 's in', Date.now() - t0, 'ms; peak', peak.toFixed(3), 'keyons', spc.dsp.keyOns.length);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + n * 4, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(32000, 24); hdr.writeUInt32LE(128000, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(n * 4, 40);
fs.writeFileSync(`${OUT}/music_${game}.wav`, Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
// loudness per second
const rms = []; for (let sec = 0; sec < +secs; sec++) { let acc = 0; for (let i = sec * 32000; i < (sec + 1) * 32000; i++) acc += (pcm[i * 2] / 32768) ** 2; rms.push(Math.sqrt(acc / 32000).toFixed(3)); }
console.log('rms per second', rms.join(' '));
