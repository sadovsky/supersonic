// Helpers for scripted runs of the games in the development emulator.
import fs from 'node:fs';
import { SNES, PAD } from '../src/snes/snes.js';
import { writePng } from '../tests/png.mjs';
export { PAD };
export const ROMS = process.env.ROMS || '/tmp/claude-0/-home-user-supersonic/95b0bd18-d1ab-5346-8b3f-3765e31ee336/scratchpad/roms';
export const OUT = process.env.OUT || '/tmp/claude-0/-home-user-supersonic/95b0bd18-d1ab-5346-8b3f-3765e31ee336/scratchpad/out';
export const MK = 'Mortal Kombat (USA) (Rev 1).sfc', SF = 'Street Fighter II (USA).sfc';
export function load(name) { return new SNES(new Uint8Array(fs.readFileSync(`${ROMS}/${name}`))); }
export function run(s, n, pad = 0) { for (let i = 0; i < n; i++) { s.joy[0] = pad; s.runFrame(); } }
// tap a button: hold for `hold` frames then release for `gap`
export function tap(s, pad, hold = 4, gap = 20) { run(s, hold, pad); run(s, gap, 0); }
export function snap(s, name, opts) { fs.mkdirSync(OUT, { recursive: true }); writePng(`${OUT}/${name}.png`, 256, 224, s.renderFrame(opts)); }
export function save(s) { return structuredClone({ wram: s.wram, vram: s.vram, cgram: s.cgram, oam: s.oam }); }
