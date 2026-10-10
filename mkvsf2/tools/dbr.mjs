import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
tap(s, PAD.B); run(s, 180);
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const c = s.cpu; if (c.pbr === 0 && [0xd732, 0xd7f2, 0xccef, 0xcd35].includes(c.pc)) console.log(c.pc.toString(16), 'dbr', c.dbr.toString(16), 'x', c.x.toString(16), 'y', c.y.toString(16)); return st(); };
tap(s, PAD.B); run(s, 400);
