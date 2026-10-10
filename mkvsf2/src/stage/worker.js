// Web Worker: captures stages for one game in the background.
import { StageCapturer } from './capturer.js';

let cap = null;
onmessage = e => {
  const { game, rom, stages } = e.data;
  if (rom) cap = new StageCapturer(game, rom);
  for (const id of stages) {
    try {
      const data = game === 'mk' ? cap.captureMk(id) : cap.captureSf2(id);
      const transfer = [];
      for (const L of data.layers) for (const l of L.lines) if (l && !transfer.includes(l.strip.buffer)) transfer.push(l.strip.buffer);
      postMessage({ game, id, data }, transfer);
    } catch (err) {
      postMessage({ game, id, error: String(err && err.stack || err) });
    }
  }
};
