import { load, run, SF, MK } from './harness.mjs';
for (const g of [SF, MK]) {
  const s = load(g);
  const seen = {};
  const orig = s.readCpuReg.bind(s);
  s.readCpuReg = (off) => { if (off >= 0x4016 && off < 0x4220 && off !== 0x4210 && off !== 0x4212) seen[off.toString(16)] = (seen[off.toString(16)] || 0) + 1; return orig(off); };
  run(s, 900);
  console.log(g, seen, 'nmitimen', s.nmitimen.toString(16));
}
