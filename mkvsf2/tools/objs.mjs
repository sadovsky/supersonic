import { sfFight } from './sf-fight.mjs';
import { run } from './harness.mjs';
const s = sfFight();
let dbrAt = {};
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { if (s.cpu.pbr === 0 && s.cpu.pc === 0x88d4) { const x = s.cpu.x; dbrAt[x.toString(16)] = { dbr: s.cpu.dbr.toString(16), ptr: (s.wram[x + 0x1e] | (s.wram[x + 0x1f] << 8)).toString(16), x: s.wram[x+7]|(s.wram[x+8]<<8), y: s.wram[x+10]|(s.wram[x+11]<<8), f1: s.wram[x+1].toString(16) }; } return st(); };
run(s, 1);
console.log(dbrAt);
