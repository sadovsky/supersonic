import { load, run, tap, snap, PAD, SF } from './harness.mjs';
const s = load(SF);
const hex = (v, n = 2) => v.toString(16).padStart(n, '0');
for (let k = 0; k < 6; k++) {
  run(s, 150);
  const p = s.ppu;
  console.log('frame', s.frameCount, 'inidisp', hex(p[0]), 'mode', hex(p[5]), 'TM', hex(p[0x2c]), 'TS', hex(p[0x2d]), 'sc', [7,8,9,10].map(i=>hex(p[i])).join(' '), 'nba', hex(p[0xb]), hex(p[0xc]), 'obsel', hex(p[1]), 'hdma', hex(s.hdmaen||0), 'cgadsub', hex(p[0x31]), 'cgwsel', hex(p[0x30]),'pc', hex(s.cpu.pbr), hex(s.cpu.pc,4));
}
