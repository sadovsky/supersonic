import { sfFight } from './sf-fight.mjs';
import { run } from './harness.mjs';
const s = sfFight();
const st = s.cpu.step.bind(s.cpu);
const seen = [];
s.cpu.step = () => { const c = s.cpu; if (c.pbr === 0 && (c.pc === 0x89a1 || c.pc === 0x8a30 || c.pc === 0x8a6f)) seen.push(`pc ${c.pc.toString(16)} dbr ${c.dbr.toString(16)} x ${c.x.toString(16)} y ${c.y.toString(16)} f7 ${s.wram[c.x + 0xf7]}`); return st(); };
run(s, 1);
console.log(seen.join('\n'));
// find writers to 7e7100.. region during fight load
