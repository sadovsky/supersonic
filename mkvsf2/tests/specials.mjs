// Every special move in the move list can be performed with the documented input.
import { parseSf2Rom } from '../src/rom/sf2Rom.js';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROSTER } from '../src/game/roster.js';
import { buildFighter } from '../src/game/sprites.js';
import { Match } from '../src/game/match.js';
import { AI } from '../src/game/ai.js';
import { findRoms } from './roms.mjs';
const { sf2, mk } = findRoms();
const roms = { sf2: parseSf2Rom(sf2), mk: parseMkRom(mk) };
let fail = 0;
for (const e of ROSTER) {
  const def = buildFighter(e, roms);
  for (const sp of def.specials) {
    const m = new Match(def, buildFighter(ROSTER[e.game === 'mk' ? 7 : 0], roms));
    while (m.phase !== 'fight') m.update([0, 0]);
    // close enough for grabs
    if (sp.kind === 'grab') m.fighters[1].x = m.fighters[0].x + 40;
    const ai = new AI(); ai.chargeTime = 50;
    ai.push(...ai.motion(sp, ai.buttonFor(sp)));
    let got = null;
    for (let t = 0; t < 120 && !got; t++) {
      const pad = ai.queue.length ? AI.abs((() => { const q = ai.queue[0]; if (--q.n <= 0) ai.queue.shift(); return q.pad; })(), m.fighters[0].face) : 0;
      m.update([pad, 0]);
      const f = m.fighters[0];
      if (f.state === 'special') got = f.special.name;
    }
    const ok = got === sp.name;
    if (!ok) fail++;
    console.log(ok ? 'ok  ' : 'FAIL', e.name.padEnd(12), sp.name.padEnd(20), ok ? '' : `got ${got}`);
  }
}
console.log(fail ? `${fail} failed` : 'all specials work');
process.exit(fail ? 1 : 0);
