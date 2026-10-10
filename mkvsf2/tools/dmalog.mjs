import { sfFight } from './sf-fight.mjs';
const s = sfFight();
const log = [];
s.onDma = d => log.push(d);
for (let f = 0; f < 120; f++) { s.joy[0] = f % 40 < 20 ? 0x0100 : 0x0080; s.runFrame(); }
const h = (v, n = 2) => v.toString(16).padStart(n, '0');
const agg = {};
for (const d of log) {
  const k = `b${h(d.bAddr)} ctrl${h(d.ctrl)} srcbank${h(d.src >> 16)}`;
  agg[k] = agg[k] || { n: 0, ex: [] }; agg[k].n++; if (agg[k].ex.length < 6) agg[k].ex.push(`src ${h(d.src, 6)} cnt ${h(d.count, 4)} vaddr ${h(d.vaddr, 4)}`);
}
console.log(agg);
