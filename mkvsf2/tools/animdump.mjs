import { sfFight } from './sf-fight.mjs';
const s = sfFight();
const h = (v, n = 2) => v.toString(16).padStart(n, '0');
let line = '';
for (let o = 0; o < 0x200; o++) { if (o % 32 === 0) line += '\n' + h(0x6880 + o, 4) + ': '; line += h(s.wram[0x6880 + o]) + ' '; }
console.log(line);
line = '';
for (let o = 0x1a0; o < 0x1c0; o++) line += h(s.wram[0x6880 + o]) + ' ';
console.log('at 6a1c-ish', line);
