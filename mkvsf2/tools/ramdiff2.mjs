import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
tap(s, PAD.B); run(s, 180); tap(s, PAD.B); run(s, 300);
const A = s.wram.slice(0, 0x2000);
const hits = [];
for (let a = 0; a < 0x2000; a++) if (A[a] === 0xb0 && A[a+1] === 0) hits.push(a.toString(16));
console.log('b0 words', hits.join(' '));
// track over time
const track = {};
for (let k = 0; k < 30; k++) { run(s, 20, 0); for (const h of hits) { const a = parseInt(h, 16); (track[h] ||= []).push(s.wram[a] | (s.wram[a + 1] << 8)); } }
for (const [k, v] of Object.entries(track)) if (new Set(v).size > 1) console.log(k, v.join(','));
