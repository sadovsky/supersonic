// Sound: synthesized hit/block/whoosh effects, plus sampled voices and sound
// effects when a sample bank (decoded from the ROMs' sound data) is attached.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.samples = new Map();    // name -> AudioBuffer
    this.sampleData = new Map(); // name -> { rate, data: Float32Array } waiting for a context
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.6;
      this.out.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      for (const [k, v] of this.sampleData) this.addSample(k, v);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.6; }

  // Register a decoded sample: { rate, data: Float32Array }
  addSample(name, s) {
    this.sampleData.set(name, s);
    if (!this.ctx || !s.data.length) return;
    const buf = this.ctx.createBuffer(1, s.data.length, s.rate);
    buf.copyToChannel(s.data, 0);
    this.samples.set(name, buf);
  }

  play(name, vol = 1, rate = 1) {
    const buf = this.samples.get(name);
    if (!buf || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.out); src.start();
    return true;
  }

  burst(dur, freq, q, vol, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  }

  tone(dur, f0, f1, vol, type = 'square') {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur);
  }

  handle(events) {
    if (!this.ctx || this.muted) return;
    for (const e of events) {
      if (e.type === 'voice') { this.play('voice:' + e.name, 1); continue; }
      if (e.type === 'special') { this.play(`special:${e.name}`, 1) || this.play(`special:${e.game}`, 0.8); continue; }
      if (e.type !== 'sound') continue;
      if (this.play('sfx:' + e.name, e.vol)) continue;
      switch (e.name) {
        case 'hit': this.burst(0.12, 900, 0.8, 0.7); this.tone(0.08, 220, 80, 0.25); break;
        case 'hitHeavy': this.burst(0.22, 500, 0.7, 0.9); this.tone(0.18, 160, 40, 0.4, 'sawtooth'); break;
        case 'block': this.tone(0.06, 1800, 1200, 0.18); this.burst(0.05, 3000, 2, 0.3); break;
        case 'jump': this.burst(0.15, 1500, 0.5, 0.12 * e.vol, 'highpass'); break;
        case 'land': this.burst(0.1, 200, 1, 0.3 * e.vol, 'lowpass'); break;
        case 'projectile': this.burst(0.35, 700, 0.6, 0.35); this.tone(0.3, 300, 900, 0.12, 'triangle'); break;
        case 'throw': this.burst(0.3, 300, 0.5, 0.5, 'lowpass'); break;
        case 'move': this.tone(0.04, 880, 880, 0.12); break;
        case 'select': this.tone(0.12, 660, 1320, 0.18); break;
        case 'pause': this.tone(0.1, 440, 220, 0.15); break;
      }
    }
  }
}
