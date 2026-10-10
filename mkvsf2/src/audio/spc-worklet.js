// AudioWorklet: runs a snapshot of a game's sound CPU (SPC700 + S-DSP) so its
// music keeps playing, resampled from 32 kHz to the output rate.
import { SPC700 } from '../snes/spc700.js';
import { DSP } from '../snes/dsp.js';

class SpcPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.spc = null;
    this.frac = 0; this.prev = [0, 0]; this.cur = [0, 0];
    this.gain = 0; this.target = 0;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.stop) { this.target = 0; return; }
      if (m.volume !== undefined) { this.volume = m.volume; }
      if (m.snapshot) this.load(m.snapshot);
    };
    this.volume = 0.5;
  }

  load(snap) {
    const spc = new SPC700();
    Object.assign(spc, snap.cpu);
    for (const k of ['timerEnable', 'timerTarget', 'timerStage', 'timerOut', 'timerDiv']) spc[k] = [...snap.cpu[k]];
    spc.ram.set(snap.ram); spc.inPorts.set(snap.inPorts); spc.outPorts.set(snap.outPorts);
    spc.dsp = new DSP(spc); spc.dsp.regs.set(snap.dsp); spc.dsp.synth = true; spc.dsp.logKeyOns = false;
    this.spc = spc; this.gain = 0; this.target = 1;
  }

  next() {
    this.spc.run(32);
    this.prev = this.cur;
    this.cur = this.spc.dsp.sampleOut();
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    if (!this.spc) { L.fill(0); if (R !== L) R.fill(0); return true; }
    const step = 32000 / sampleRate;
    for (let i = 0; i < L.length; i++) {
      this.frac += step;
      while (this.frac >= 1) { this.frac -= 1; this.next(); }
      this.gain += (this.target - this.gain) * 0.0005;
      const g = this.gain * this.volume, t = this.frac;
      L[i] = (this.prev[0] + (this.cur[0] - this.prev[0]) * t) * g;
      R[i] = (this.prev[1] + (this.cur[1] - this.prev[1]) * t) * g;
    }
    if (this.target === 0 && this.gain < 0.001) this.spc = null;
    return true;
  }
}

registerProcessor('spc-player', SpcPlayer);
