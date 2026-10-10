import { sfVersus } from './sf-fight.mjs';
import { run, PAD, snap } from './harness.mjs';
const s = sfVersus(+(process.argv[2] || 0), 7);
run(s, 30);
const P = PAD;
let frameObjs = [];
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; const pc = (c.pbr << 16) | c.pc;
  if (pc === 0x0088d4 || pc === 0x008a30 || pc === 0x0089a1) { const x = c.x; if (![0x10c0, 0x1100, 0x17a0, 0x17c0, 0xc00, 0xe00].includes(x)) frameObjs.push(`${pc.toString(16)} ${x.toString(16)}:${c.dbr.toString(16)}:${(s.wram[x + 0x1e] | s.wram[x + 0x1f] << 8).toString(16)}@${s.wram[x+7] | s.wram[x+8]<<8},${s.wram[x+10]} a${s.wram[x+0x16].toString(16)} f7=${s.wram[x+0xf7].toString(16)} c1=${s.wram[x+0xc1]}`); }
  return st(); };
for (const [pad, n] of [[P.DOWN, 4], [P.DOWN | P.RIGHT, 4], [P.RIGHT, 2], [P.RIGHT | P.Y, 4], [0, 50]]) for (let i = 0; i < n; i++) { frameObjs = []; s.joy[0] = pad; s.runFrame(); if (frameObjs.length) console.log(s.frameCount, frameObjs.join('  ')); }
