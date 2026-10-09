// Smoke test: god-mode bot attempts every level; reports progress and crashes.
import { scenario, R } from './scenario.mjs';
const AREAS = [[0, 2, 3, 4], [0, 2, 3, 4], [0, 1, 2, 3], [0, 2, 3, 4], [0, 1, 2, 3], [0, 1, 2, 3], [0, 2, 3, 4], [0, 1, 2, 3]];
const only = process.argv[2] ? process.argv[2].split(',') : null;
for (let w = 1; w <= 8; w++) {
  for (let l = 0; l < 4; l++) {
    const name = `${w}-${l + 1}`;
    if (only && !only.includes(name)) continue;
    const t0 = Date.now();
    let res;
    try {
      const t = await scenario({ world: w, area: AREAS[w - 1][l] });
      t.ram[R.LevelNumber] = l;
      const startLevel = l, startWorld = w - 1;
      let done = false, f = 0, maxX = 0;
      const max = +process.env.FRAMES || 7000;
      for (; f < max && !done; f += 50) {
        t.botTo(1e9, 50);
        maxX = Math.max(maxX, t.x);
        if (t.ram[R.LevelNumber] !== startLevel || t.ram[R.WorldNumber] !== startWorld || t.ram[R.OperMode] === 2) done = true;
      }
      res = done ? `cleared in ${f} frames (mode ${t.ram[R.OperMode]})` : `not cleared, max x ${maxX}, now x ${t.x} ges ${t.ges}`;
      t.snap(`lvl_${name}`);
    } catch (e) { res = 'CRASH ' + e.message; }
    console.log(name, res, `${Date.now() - t0}ms`);
  }
}
