import { mkToSelect } from './mk-fight.mjs';
import { run, tap, PAD } from './harness.mjs';
const s = mkToSelect();
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (((c.pbr << 16) | c.pc) === 0x988f6b) { const ret = s.read(c.s + 1) | (s.read(c.s + 2) << 8) | (s.read(c.s + 3) << 16); console.log('988f6b A', c.a.toString(16), 'X', c.x.toString(16), 'Y', c.y.toString(16), 'from', ret.toString(16), 'f', s.frameCount, '0201', s.wram[0x201], 'da', s.wram[0x1da]); } return st(); };
tap(s, PAD.B, 6, 30); run(s, 600);
