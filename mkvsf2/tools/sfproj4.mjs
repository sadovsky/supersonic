import { sfVersus } from './sf-fight.mjs';
import { run, PAD } from './harness.mjs';
const s = sfVersus(0, 7);
run(s, 30);
const P = PAD;
for (const [pad, n] of [[P.DOWN, 4], [P.DOWN | P.RIGHT, 4], [P.RIGHT, 2], [P.RIGHT | P.Y, 4]]) run(s, n, pad);
run(s, 20);
// which OAM buffer entries ($0700) are written by which PC, along with the object X register
const writers = {};
s.onWrite = (a, v) => { const o = a & 0xffff, b = a >> 16; if ((b < 0x40 || b === 0x7e) && o >= 0x700 && o < 0x900 && (o & 3) === 2) { const k = ((s.cpu.pbr << 16) | s.cpu.pc).toString(16); (writers[k] ||= new Set()).add(`D${s.cpu.d.toString(16)} DB${s.cpu.dbr.toString(16)} Y${s.cpu.y.toString(16)}`); } };
run(s, 1);
for (const [k, v] of Object.entries(writers)) console.log(k, [...v].slice(0, 12).join(' | '));
for (let base = 0x400; base < 0x2000; base += 0x20) { const w = s.wram[base + 0x1e] | s.wram[base + 0x1f] << 8; if (w === 0x86ba) { console.log('obj', base.toString(16), 'f7', s.wram[base + 0xf7], '18', (s.wram[base+0x18]|s.wram[base+0x19]<<8).toString(16), '1a', (s.wram[base+0x1a]|s.wram[base+0x1b]<<8).toString(16)); } }
