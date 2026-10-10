import { sfFight } from './sf-fight.mjs';
import { run } from './harness.mjs';
const s = sfFight();
const h = (v, n = 2) => v.toString(16).padStart(n, '0');
for (const base of [0xc00, 0xe00]) {
  const w = o => s.wram[base + o] | (s.wram[base + o + 1] << 8);
  console.log('obj', h(base, 4), '$18', h(w(0x18), 4), '$1a', h(w(0x1a), 4), '$1c', h(w(0x1c), 4), '$20', h(w(0x20), 4), '$1e', h(w(0x1e), 4), 'f7', s.wram[base + 0xf7], 'c1', s.wram[base + 0xc1]);
  let line = '';
  for (let o = 0; o < 0x100; o++) { if (o % 32 === 0) line += '\n' + h(o) + ': '; line += h(s.wram[base + o]) + ' '; }
  console.log(line);
}
