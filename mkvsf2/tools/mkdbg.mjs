import fs from 'node:fs';
import { parseMkRom } from '../src/rom/mkRom.js';
import { ROMS, MK } from './harness.mjs';
const mk = parseMkRom(new Uint8Array(fs.readFileSync(`${ROMS}/${MK}`)));
const F = mk.fighters[1], m = mk.m;
console.log('animTab', F.animTab.toString(16), 'hdr', [0,1,2,3,4].map(k => m.r16(F.animTab - 10 + k*2).toString(16)), 'sizes', m.r16(F.animTab-12).toString(16));
try { const fr = F.frame(0x63); console.log(fr.w, fr.h, fr.ox, fr.oy, fr.pix.reduce((a,b)=>a+(b?1:0),0)); } catch (e) { console.log(e); }
