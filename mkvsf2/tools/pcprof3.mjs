import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
const log = [];
const wb = s.writeB.bind(s);
s.writeB = (r, v) => { if (r === 0) log.push(`f${s.frameCount} l${s.line} pc ${s.cpu.pbr.toString(16)}:${s.cpu.pc.toString(16)} = ${v.toString(16)}`); return wb(r, v); };
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
console.log(log.slice(-30).join('\n'));
