// find the projectile object's animation for an SF2 character (object sharing the player's anim table)
import fs from 'node:fs';
import { sfVersus } from './sf-fight.mjs';
import { run, PAD, ROMS, SF } from './harness.mjs';
import { loRom } from '../src/rom/sf2Rom.js';
const m = loRom(new Uint8Array(fs.readFileSync(`${ROMS}/${SF}`)));
const c = +process.argv[2], seqName = process.argv[3];
const anim = m.copy(m.r24(0x07eaa3 + c * 3), 0x880);
const w = o => anim[o] | anim[o + 1] << 8;
const s = sfVersus(c, 0);
run(s, 30);
const P = PAD, F = P.RIGHT, B = P.LEFT, D = P.DOWN;
const seqs = { qcf: [[D, 4], [D | F, 4], [F, 2], [F | P.Y, 4]], charge: [[B, 70], [F, 2], [F | P.Y, 4]] };
for (const [pad, n] of seqs[seqName]) run(s, n, pad);
const found = new Set();
for (let k = 0; k < 30; k++) { run(s, 1); for (let o = 0x1000; o < 0x1a00; o += 0x20) { if (o === 0xc00 || o === 0xe00) continue; const t = s.wram[o + 0x18] | s.wram[o + 0x19] << 8; if (t === 0x6880) { const cur = (s.wram[o + 0x1a] | s.wram[o + 0x1b] << 8) - 0x6880; let best = -1, bo = -1; for (let a = 0; a < (w(0) >> 1); a++) { const st = w(a * 2); if (st <= cur && st > bo) { bo = st; best = a; } } found.add(`obj ${o.toString(16)} anim ${best.toString(16)} (+${cur - bo})`); } } }
console.log(c, [...found].join(', '));
