// Web Worker: captures stages for one game in the background.
import { StageCapturer } from './capturer.js';
import { ROSTER } from '../game/roster.js';

let cap = null;
onmessage = e => {
  const { game, rom, stages } = e.data;
  if (rom) cap = new StageCapturer(game, rom);
  for (const id of stages) {
    try {
      const fighter = ROSTER.find(f => f.game === game && f.index === id);
      const data = game === 'mk' ? cap.captureMk(id, id, fighter.specials) : cap.captureSf2(id, fighter.specials);
      data.fighter = fighter.name;
      const transfer = [];
      for (const L of data.layers) for (const l of L.lines) if (l && !transfer.includes(l.strip.buffer)) transfer.push(l.strip.buffer);
      for (const parts of Object.values(data.sounds)) for (const p of parts) if (!transfer.includes(p.data.buffer)) transfer.push(p.data.buffer);
      postMessage({ game, id, data }, transfer);
    } catch (err) {
      postMessage({ game, id, error: String(err && err.stack || err) });
    }
  }
};
