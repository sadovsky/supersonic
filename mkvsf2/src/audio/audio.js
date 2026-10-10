// Sound: synthesized hit/block/whoosh effects, plus sampled voices and sound
// effects when a sample bank (decoded from the ROMs' sound data) is attached.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bank = new Map();       // event key -> [{ f, rate, data }] recorded from the games
    this.buffers = new WeakMap();
    this.musicNode = null;
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
      this.ctx.audioWorklet?.addModule(new URL('./spc-worklet.js', import.meta.url)).then(() => {
        this.musicNode = new AudioWorkletNode(this.ctx, 'spc-player', { outputChannelCount: [2] });
        this.musicNode.connect(this.out);
        if (this.pendingMusic) this.playMusic(this.pendingMusic);
      }).catch(e => console.warn('music unavailable', e));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.6; }

  // Register a recorded sound event (a few samples with their start frames)
  addEvent(key, parts) { if (!this.bank.has(key)) this.bank.set(key, parts); }

  play(key, vol = 1) {
    const parts = this.bank.get(key);
    if (!parts || !this.ctx) return false;
    const now = this.ctx.currentTime;
    for (const p of parts) {
      let buf = this.buffers.get(p);
      if (!buf) {
        // AudioBuffers need a supported rate: resample to 32 kHz
        const n = Math.max(1, Math.round(p.data.length * 32000 / p.rate));
        buf = this.ctx.createBuffer(1, n, 32000);
        const d = buf.getChannelData(0), k = p.rate / 32000;
        for (let i = 0; i < n; i++) { const x = i * k, j = x | 0, t = x - j; d[i] = (p.data[j] * (1 - t) + (p.data[j + 1] || 0) * t) * 0.9; }
        this.buffers.set(p, buf);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(g); g.connect(this.out); src.start(now + p.f / 60);
    }
    return true;
  }

  playMusic(snapshot) {
    if (!snapshot) return this.stopMusic();
    if (!this.musicNode) { this.pendingMusic = snapshot; return; }
    this.pendingMusic = null;
    this.musicNode.port.postMessage({ snapshot, volume: this.muted ? 0 : 0.55 });
  }
  stopMusic() { this.pendingMusic = null; this.musicNode?.port.postMessage({ stop: true }); }

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
      if (e.type === 'voice') { this.play(`${e.game}:${e.name}`, 1); continue; }
      if (e.type === 'special') { this.play(`special:${e.fighter}:${e.name}`, 1); continue; }
      if (e.type !== 'sound') continue;
      if (e.game && this.play(`${e.game}:${e.name}`, e.vol)) continue;
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
