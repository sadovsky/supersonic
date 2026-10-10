import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
const hist = {};
const rb = s.readB.bind(s), wb = s.writeB.bind(s);
s.readB = (r) => { const v = rb(r); if (r >= 0x40 && r < 0x44) { const k = 'R' + r.toString(16) + '@' + s.cpu.pc.toString(16) + '=' + v.toString(16); hist[k] = (hist[k] || 0) + 1; } return v; };
s.writeB = (r, v) => { if (r >= 0x40 && r < 0x44) { const k = 'W' + r.toString(16) + '@' + s.cpu.pc.toString(16) + '=' + v.toString(16); hist[k] = (hist[k] || 0) + 1; } return wb(r, v); };
run(s, 60);
console.log(hist);
// the NMI handler: what does it do?
const nmi = s.read(0xffea) | (s.read(0xffeb) << 8);
console.log('nmi vec', nmi.toString(16), 'irq', (s.read(0xffee) | (s.read(0xffef) << 8)).toString(16));
console.log('wram 0bea', s.wram[0xbea], 'state bytes 0..40', [...s.wram.slice(0, 0x40)].map(v=>v.toString(16)).join(' '));
