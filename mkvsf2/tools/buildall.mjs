import fs from 'node:fs';
import { parseSf2Rom } from '../src/rom/sf2Rom.js';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROSTER } from '../src/game/roster.js';
import { buildFighter } from '../src/game/sprites.js';
import { ROMS, SF, MK } from './harness.mjs';
const t0 = Date.now();
const roms = { sf2: parseSf2Rom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`))), mk: parseMkRom(new Uint8Array(fs.readFileSync(`${ROMS}/${MK}`))) };
console.log('parse', Date.now() - t0);
for (const e of ROSTER) {
  const t = Date.now();
  const f = buildFighter(e, roms);
  const miss = Object.entries(f.anims).filter(([k, a]) => !a.frames.length).map(([k]) => k);
  console.log(e.name.padEnd(12), 'ms', Date.now() - t, 'anims', Object.keys(f.anims).length, 'h', f.height, 'foot', f.foot, 'body', JSON.stringify(f.body), 'specials', f.specials.map(s => s.name + (s.projData ? '*' : '')).join(','), miss.length ? 'MISSING ' + miss : '',
    'reach lp', f.anims.lp?.reachMax, 'hk', f.anims.hk?.reachMax);
}
