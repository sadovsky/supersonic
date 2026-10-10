// CPU vs CPU matches for every pairing (or the given ones): checks the engine runs a match to the end.
// ROMS=folder node tests/cpu-match.mjs [a b]
import fs from 'node:fs';
import { parseSf2Rom } from '../src/rom/sf2Rom.js';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROSTER } from '../src/game/roster.js';
import { buildFighter } from '../src/game/sprites.js';
import { Match } from '../src/game/match.js';
import { AI } from '../src/game/ai.js';
import { findRoms } from './roms.mjs';
const { sf2, mk } = findRoms();
const roms = { sf2: parseSf2Rom(sf2), mk: parseMkRom(mk) };
const defs = ROSTER.map(e => buildFighter(e, roms));
const pairs = process.argv[2] ? [[+process.argv[2], +process.argv[3]]] : ROSTER.map((_, i) => [i, (i + 7) % ROSTER.length]);
let failures = 0;
for (const [i, j] of pairs) {
  const m = new Match(defs[i], i === j ? buildFighter(ROSTER[j], roms, true) : defs[j]);
  const ais = [new AI(3), new AI(3)];
  let t = 0; const stats = { hits: 0, blocks: 0, specials: 0, projectiles: 0 };
  while (!m.over && t < 60 * 60 * 6) {
    m.update(m.fighters.map((f, k) => ais[k].pad(f, m.fighters[1 - k], m)));
    for (const e of m.events) { if (e.type === 'sound' && (e.name === 'hit' || e.name === 'hitHeavy')) stats.hits++; if (e.type === 'sound' && e.name === 'block') stats.blocks++; if (e.type === 'special') stats.specials++; if (e.type === 'sound' && e.name === 'projectile') stats.projectiles++; }
    t++;
  }
  if (!m.over) failures++;
  console.log(`${defs[i].name.padEnd(12)} vs ${defs[j].name.padEnd(12)} ${m.over ? 'winner ' + (m.winner < 0 ? 'draw' : defs[[i, j][m.winner]].name) : 'NOT FINISHED'} rounds ${m.round} ${(t / 60).toFixed(0)}s`, JSON.stringify(stats));
}
process.exit(failures ? 1 : 0);
