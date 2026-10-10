// Renders snapshots of a CPU vs CPU match: ROMS=... OUT=... node tests/snap-match.mjs a b [every] [count]
import fs from 'node:fs';
import { parseSf2Rom } from '../src/rom/sf2Rom.js';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROSTER } from '../src/game/roster.js';
import { buildFighter } from '../src/game/sprites.js';
import { Match, VIEW_W, VIEW_H } from '../src/game/match.js';
import { AI } from '../src/game/ai.js';
import { Renderer } from '../src/render/renderer.js';
import { drawMatch } from '../src/render/scene.js';
import { writePng } from './png.mjs';
import { findRoms } from './roms.mjs';
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-supersonic/95b0bd18-d1ab-5346-8b3f-3765e31ee336/scratchpad/out';
const { sf2, mk } = findRoms();
const roms = { sf2: parseSf2Rom(sf2), mk: parseMkRom(mk) };
const [a = 4, b = 7, every = 30, count = 16] = process.argv.slice(2).map(Number);
const m = new Match(buildFighter(ROSTER[a], roms), buildFighter(ROSTER[b], roms, a === b));
const ais = [new AI(3), new AI(3)];
const r = new Renderer(VIEW_W, VIEW_H);
const files = [];
for (let t = 0, n = 0; n < count && !m.over; t++) {
  m.update(m.fighters.map((f, k) => ais[k].pad(f, m.fighters[1 - k], m)));
  if (t % every === 0 && t > 100) { drawMatch(r, m); const f = `${OUT}/snap_${n++}.png`; writePng(f, VIEW_W, VIEW_H, r.bytes); files.push(f); }
}
console.log(files.join(' '));
