// AudioWorklet that synthesizes the NES sound channels from the register
// writes SMB's sound engine makes each frame, plus a few Sonic sound effects.

const CPU_HZ = 1789773;
const FRAME_HZ = 60.0988;
const LENGTHS = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
const DUTY = [[0, 1, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], [1, 0, 0, 1, 1, 1, 1, 1]];
const NOISE_PERIOD = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const TRI = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

class Envelope {
  constructor() { this.start = false; this.divider = 0; this.decay = 0; this.loop = false; this.constant = false; this.vol = 0; }
  clock() {
    if (this.start) { this.start = false; this.decay = 15; this.divider = this.vol; return; }
    if (this.divider > 0) { this.divider--; return; }
    this.divider = this.vol;
    if (this.decay > 0) this.decay--; else if (this.loop) this.decay = 15;
  }
  output() { return this.constant ? this.vol : this.decay; }
}

class Pulse {
  constructor(ones) {
    this.ones = ones; this.env = new Envelope(); this.enabled = false;
    this.duty = 0; this.step = 0; this.timer = 0; this.counter = 0; this.length = 0; this.halt = false;
    this.sweepOn = false; this.sweepPeriod = 0; this.sweepNeg = false; this.sweepShift = 0; this.sweepDiv = 0; this.sweepReload = false;
  }
  write(r, v) {
    switch (r) {
      case 0: this.duty = v >> 6; this.halt = this.env.loop = (v & 0x20) !== 0; this.env.constant = (v & 0x10) !== 0; this.env.vol = v & 15; break;
      case 1: this.sweepOn = (v & 0x80) !== 0; this.sweepPeriod = (v >> 4) & 7; this.sweepNeg = (v & 8) !== 0; this.sweepShift = v & 7; this.sweepReload = true; break;
      case 2: this.timer = (this.timer & 0x700) | v; break;
      case 3:
        this.timer = (this.timer & 0xff) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTHS[v >> 3];
        this.step = 0; this.env.start = true; break;
    }
  }
  target() {
    const c = this.timer >> this.sweepShift;
    return this.sweepNeg ? this.timer - c - (this.ones ? 1 : 0) : this.timer + c;
  }
  muted() { return this.timer < 8 || this.target() > 0x7ff; }
  clockSweep() {
    if (this.sweepDiv === 0 && this.sweepOn && this.sweepShift && !this.muted()) this.timer = Math.max(0, this.target());
    if (this.sweepDiv === 0 || this.sweepReload) { this.sweepDiv = this.sweepPeriod; this.sweepReload = false; }
    else this.sweepDiv--;
  }
  clockLength() { if (!this.halt && this.length > 0) this.length--; }
  run(cycles) { // cycles in CPU clocks
    this.counter -= cycles;
    const period = (this.timer + 1) * 2;
    while (this.counter <= 0) { this.counter += period; this.step = (this.step + 1) & 7; }
  }
  output() {
    if (!this.length || this.muted()) return 0;
    return DUTY[this.duty][this.step] ? this.env.output() : 0;
  }
}

class Triangle {
  constructor() { this.enabled = false; this.timer = 0; this.counter = 0; this.step = 0; this.length = 0; this.control = false; this.linReload = 0; this.lin = 0; this.reloadFlag = false; }
  write(r, v) {
    switch (r) {
      case 0: this.control = (v & 0x80) !== 0; this.linReload = v & 0x7f; break;
      case 2: this.timer = (this.timer & 0x700) | v; break;
      case 3: this.timer = (this.timer & 0xff) | ((v & 7) << 8); if (this.enabled) this.length = LENGTHS[v >> 3]; this.reloadFlag = true; break;
    }
  }
  clockLinear() {
    if (this.reloadFlag) this.lin = this.linReload; else if (this.lin > 0) this.lin--;
    if (!this.control) this.reloadFlag = false;
  }
  clockLength() { if (!this.control && this.length > 0) this.length--; }
  run(cycles) {
    if (!this.length || !this.lin || this.timer < 2) return;
    this.counter -= cycles;
    const period = this.timer + 1;
    while (this.counter <= 0) { this.counter += period; this.step = (this.step + 1) & 31; }
  }
  output() { return TRI[this.step]; }
}

class Noise {
  constructor() { this.env = new Envelope(); this.enabled = false; this.mode = false; this.period = 4; this.counter = 0; this.shift = 1; this.length = 0; this.halt = false; }
  write(r, v) {
    switch (r) {
      case 0: this.halt = this.env.loop = (v & 0x20) !== 0; this.env.constant = (v & 0x10) !== 0; this.env.vol = v & 15; break;
      case 2: this.mode = (v & 0x80) !== 0; this.period = NOISE_PERIOD[v & 15]; break;
      case 3: if (this.enabled) this.length = LENGTHS[v >> 3]; this.env.start = true; break;
    }
  }
  clockLength() { if (!this.halt && this.length > 0) this.length--; }
  run(cycles) {
    this.counter -= cycles;
    while (this.counter <= 0) {
      this.counter += this.period;
      const fb = (this.shift & 1) ^ ((this.shift >> (this.mode ? 6 : 1)) & 1);
      this.shift = (this.shift >> 1) | (fb << 14);
    }
  }
  output() { return (!this.length || (this.shift & 1)) ? 0 : this.env.output(); }
}

// Extra voice for Sonic's own sound effects (rendered in the same 8-bit style)
class SonicSfx {
  constructor(sr) { this.sr = sr; this.voices = []; }
  trigger(name) {
    const v = { name, t: 0, phase: 0, noise: 1 };
    // only one of each kind at a time
    this.voices = this.voices.filter(o => o.name !== name && !(name === 'dash' && o.name === 'rev'));
    this.voices.push(v);
  }
  sample() {
    let out = 0;
    const dt = 1 / this.sr;
    this.voices = this.voices.filter(v => {
      v.t += dt;
      let f, vol, len, sq = true, nz = 0;
      switch (v.name) {
        case 'jump': len = 0.2; f = 330 * Math.pow(3.2, v.t / len); vol = 0.32 * (1 - v.t / len); break;
        case 'roll': len = 0.25; f = 1400 - 4000 * v.t; vol = 0.0; nz = 0.22 * (1 - v.t / len); break;
        case 'rev': len = 0.28; f = 500 + 2500 * v.t; vol = 0.22 * (1 - v.t / len); nz = 0.12 * (1 - v.t / len); break;
        case 'dash': len = 0.35; f = 1500 - 3000 * v.t; vol = 0.18 * (1 - v.t / len); nz = 0.25 * (1 - v.t / len); break;
        case 'pop': len = 0.18; f = 900 - 3000 * v.t; vol = 0.0; nz = 0.3 * (1 - v.t / len); break;
        default: return false;
      }
      if (v.t >= len) return false;
      v.phase = (v.phase + Math.max(20, f) * dt) % 1;
      if (sq && vol > 0) out += (v.phase < 0.25 ? 1 : -1) * vol;
      if (nz > 0) {
        if (Math.random() < Math.max(20, f) * 4 * dt) v.noise = Math.random() < 0.5 ? 1 : -1;
        out += v.noise * nz;
      }
      return true;
    });
    return out * 0.5;
  }
}

class APU extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p1 = new Pulse(true); this.p2 = new Pulse(false); this.tri = new Triangle(); this.noise = new Noise();
    this.queue = [];
    this.cyclesPerSample = CPU_HZ / sampleRate;
    this.samplesPerFrame = sampleRate / FRAME_HZ;
    this.frameLeft = 0;
    this.seqCycles = 0; this.seqStep = 0;
    this.hp = 0; this.hpPrev = 0; this.lp = 0;
    this.sfx = new SonicSfx(sampleRate);
    this.muted = false;
    this.port.onmessage = e => {
      const d = e.data;
      if (d.type === 'frame') { this.queue.push(d); if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 3).forEach(f => this.apply(f)); }
      else if (d.type === 'mute') this.muted = d.value;
    };
  }

  apply(f) {
    const w = f.w;
    for (let i = 0; i < w.length; i += 2) this.write(w[i], w[i + 1]);
    for (const ev of f.e || []) this.sfx.trigger(ev);
  }

  write(a, v) {
    if (a < 0x4004) this.p1.write(a & 3, v);
    else if (a < 0x4008) this.p2.write(a & 3, v);
    else if (a < 0x400c) this.tri.write(a & 3, v);
    else if (a < 0x4010) this.noise.write(a & 3, v);
    else if (a === 0x4015) {
      this.p1.enabled = !!(v & 1); this.p2.enabled = !!(v & 2); this.tri.enabled = !!(v & 4); this.noise.enabled = !!(v & 8);
      if (!this.p1.enabled) this.p1.length = 0;
      if (!this.p2.enabled) this.p2.length = 0;
      if (!this.tri.enabled) this.tri.length = 0;
      if (!this.noise.enabled) this.noise.length = 0;
    }
  }

  quarter() { this.p1.env.clock(); this.p2.env.clock(); this.noise.env.clock(); this.tri.clockLinear(); }
  half() { this.p1.clockLength(); this.p2.clockLength(); this.tri.clockLength(); this.noise.clockLength(); this.p1.clockSweep(); this.p2.clockSweep(); }

  process(_, outputs) {
    const out = outputs[0][0];
    const c = this.cyclesPerSample;
    for (let i = 0; i < out.length; i++) {
      if (this.frameLeft <= 0) {
        this.frameLeft += this.samplesPerFrame;
        const f = this.queue.shift();
        if (f) this.apply(f);
      }
      this.frameLeft--;
      // frame sequencer, 4-step mode (~240 Hz)
      this.seqCycles += c;
      if (this.seqCycles >= 7457.5) {
        this.seqCycles -= 7457.5;
        this.quarter();
        if (this.seqStep & 1) this.half();
        this.seqStep = (this.seqStep + 1) & 3;
      }
      this.p1.run(c); this.p2.run(c); this.tri.run(c); this.noise.run(c);
      const pul = this.p1.output() + this.p2.output();
      const pulse = pul ? 95.88 / (8128 / pul + 100) : 0;
      const t = this.tri.output() / 8227 + this.noise.output() / 12241;
      const tnd = t ? 159.79 / (1 / t + 100) : 0;
      let s = pulse + tnd;
      // DC-blocking high-pass, gentle low-pass
      this.hp = 0.996 * (this.hp + s - this.hpPrev); this.hpPrev = s;
      this.lp += (this.hp - this.lp) * 0.6;
      let v = this.lp * 1.6 + this.sfx.sample();
      out[i] = this.muted ? 0 : Math.max(-1, Math.min(1, v));
    }
    for (let ch = 1; ch < outputs[0].length; ch++) outputs[0][ch].set(out);
    return true;
  }
}

registerProcessor('nes-apu', APU);
