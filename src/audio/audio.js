// Main-thread side of the audio: forwards each frame's sound-register writes
// to the APU worklet. Browsers only allow audio after a user gesture, so we
// keep a shadow copy of every register and replay it when audio starts.

export class Audio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.shadow = new Map();
    this.muted = false;
    this.starting = false;
    this.sonicJump = true;
  }

  async resume() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    if (this.starting) return;
    this.starting = true;
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule(new URL('./apu-worklet.js', import.meta.url));
      const node = new AudioWorkletNode(ctx, 'nes-apu', { outputChannelCount: [1] });
      const gain = ctx.createGain(); gain.gain.value = 0.9;
      node.connect(gain).connect(ctx.destination);
      // bring the synth up to date with everything written so far
      const w = [];
      for (const [a, v] of this.shadow) if (a !== 0x4003 && a !== 0x4007 && a !== 0x400b && a !== 0x400f) w.push(a, v);
      node.port.postMessage({ type: 'frame', w, e: [] });
      node.port.postMessage({ type: 'mute', value: this.muted });
      this.ctx = ctx; this.node = node;
      if (ctx.state !== 'running') await ctx.resume();
    } catch (e) {
      console.warn('Audio unavailable', e);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.node?.port.postMessage({ type: 'mute', value: this.muted });
  }

  frame(writes, events) {
    for (let i = 0; i < writes.length; i += 2) this.shadow.set(writes[i], writes[i + 1]);
    if (!this.node) return;
    this.node.port.postMessage({ type: 'frame', w: writes.slice(), e: events.slice() });
  }
}
