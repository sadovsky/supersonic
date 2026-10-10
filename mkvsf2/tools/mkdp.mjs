import { mkFight } from './mk-fight.mjs';
const s = mkFight();
const st = s.cpu.step.bind(s.cpu);
const h = v => v.toString(16).padStart(2, '0');
let n = 0;
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x988c9f && n < 2) { n++; let t = 'da=' + s.wram[0x1da] + ' 0201=' + s.wram[0x201] + '\n'; for (let o = 0x1c0; o < 0x200; o++) { if (o % 16 === 0) t += '\n' + o.toString(16) + ': '; t += h(s.wram[o]) + ' '; } console.log(t); } return st(); };
for (let f = 0; f < 3; f++) s.runFrame();
let t = '';
for (const b of [0x1180, 0x11e9]) { t += '\n'; for (let o = 0; o < 0x69; o++) { if (o % 16 === 0) t += '\n' + (b + o).toString(16) + ': '; t += h(s.wram[b + o]) + ' '; } }
console.log(t);
