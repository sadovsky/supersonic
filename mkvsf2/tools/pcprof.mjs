import { load, run, tap, PAD, SF } from './harness.mjs';
const s = load(SF);
run(s, 1500); tap(s, PAD.START); run(s, 120); tap(s, PAD.START); run(s, 120);
const hist = {};
const st = s.cpu.step.bind(s.cpu);
s.cpu.step = () => { const k = ((s.cpu.pbr << 16) | s.cpu.pc).toString(16); hist[k] = (hist[k] || 0) + 1; return st(); };
run(s, 30);
console.log(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 25));
console.log('ports cpu->spc', [...s.spc.inPorts].map(v=>v.toString(16)), 'spc->cpu', [...s.spc.outPorts].map(v=>v.toString(16)), 'spc pc', s.spc.pc.toString(16));
