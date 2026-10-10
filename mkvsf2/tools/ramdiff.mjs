import { sfFight } from './sf-fight.mjs';
import { run, snap } from './harness.mjs';
const s = sfFight();
run(s, 200);
const w = (m, a) => m[a] | (m[a + 1] << 8);
const A = s.wram.slice(0, 0x2000); run(s, 40, 0x0100); const B = s.wram.slice(0, 0x2000); snap(s,'sfA'); run(s, 40, 0x0200); const C = s.wram.slice(0, 0x2000); snap(s,'sfB');
for (let a = 0; a < 0x2000; a++) {
  const x = w(A, a), y = w(B, a), z = w(C, a);
  if (y - x > 15 && y - x < 200 && y - z > 15 && y - z < 200) console.log(a.toString(16), x, y, z);
}
