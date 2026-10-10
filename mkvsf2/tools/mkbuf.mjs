import { mkFight } from './mk-fight.mjs';
const s = mkFight();
s.runFrame();
const h = (v) => v.toString(16).padStart(2, '0');
let t = '';
for (let o = 0; o < 0x100; o++) { if (o % 32 === 0) t += '\n' + o.toString(16).padStart(4, '0') + ': '; t += h(s.wram[0x10000 + o]) + ' '; }
console.log(t);
console.log('0201', s.wram[0x201] | s.wram[0x202] << 8, '0203', (s.wram[0x203] | s.wram[0x204] << 8).toString(16), 'da', s.wram[0xda], '03d3', (s.wram[0x3d3]|s.wram[0x3d4]<<8).toString(16), (s.wram[0x3d5]|s.wram[0x3d6]<<8).toString(16));
