// The S-DSP: eight BRR sample voices with ADSR/GAIN envelopes, pitch
// modulation, noise and echo, mixed at 32 kHz. Used two ways:
//   - while the games run in the emulator (stage capture), to note which
//     samples are keyed on, so sound effects can be lifted from sound RAM;
//   - in the audio worklet, together with the SPC700, to play the games'
//     music from a snapshot of the sound CPU.

const RATES = [0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80, 64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];
const OFFSETS = [0, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0];

const clamp16 = v => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);

class Voice {
  constructor() {
    this.buf = new Int16Array(12); this.bufPos = 0; // decoded samples ring
    this.brrAddr = 0; this.brrOffset = 1; this.interp = 0;
    this.env = 0; this.envMode = 'release'; this.konDelay = 0;
    this.hidden = 0; this.out = 0; this.p1 = 0; this.p2 = 0;
    this.decoded = new Int16Array(16); this.decPos = 16;
    this.history = new Int16Array(4);
    this.pos = 0;
  }
}

export class DSP {
  constructor(spc) {
    this.spc = spc;
    this.regs = new Uint8Array(128);
    this.keyOns = [];   // { voice, srcn, pitch, t }
    this.voices = Array.from({ length: 8 }, () => new Voice());
    this.counter = 0;
    this.noise = 0x4000;
    this.echoPos = 0; this.echoHist = [new Int16Array(8), new Int16Array(8)]; this.firPos = 0;
    this.endx = 0;
    this.logKeyOns = true;
    this.synth = false;
  }

  // Without synthesis running, report every voice as ended
  read(a) { return a === 0x7c ? (this.synth ? this.endx : 0xff) : this.regs[a]; }
  write(a, v) {
    this.regs[a] = v;
    if (a === 0x7c) { this.endx = 0; return; }
    if (a === 0x4c) {
      for (let i = 0; i < 8; i++) if (v & (1 << i)) {
        const b = i << 4;
        if (this.logKeyOns) {
          const k = { voice: i, srcn: this.regs[b + 4], pitch: this.regs[b + 2] | (this.regs[b + 3] << 8), t: this.spc.cycles };
          // decode the sample now: some games stream sounds into a shared buffer
          if (this.grabSamples) k.data = decodeBrr(this.spc.ram, this.sample(k.srcn).start, 3000);
          this.keyOns.push(k);
        }
        this.keyOn(i);
      }
    }
    if (a === 0x5c) for (let i = 0; i < 8; i++) if (v & (1 << i)) this.voices[i].envMode = 'release';
  }

  // Directory entry for a sample number: [start, loop]
  sample(srcn) {
    const dir = this.regs[0x5d] << 8, ram = this.spc.ram;
    const p = (dir + srcn * 4) & 0xffff;
    return { start: ram[p] | (ram[(p + 1) & 0xffff] << 8), loop: ram[(p + 2) & 0xffff] | (ram[(p + 3) & 0xffff] << 8) };
  }

  keyOn(i) {
    const v = this.voices[i];
    v.brrAddr = this.sample(this.regs[(i << 4) + 4]).start;
    v.decPos = 16; v.p1 = v.p2 = 0; v.pos = 0;
    v.history.fill(0);
    v.env = 0; v.envMode = 'attack'; v.konDelay = 5;
    this.endx &= ~(1 << i);
  }

  decodeBlock(v, i) {
    const ram = this.spc.ram;
    const a = v.brrAddr & 0xffff;
    const hdr = ram[a];
    const shift = hdr >> 4, filter = (hdr >> 2) & 3;
    for (let k = 0; k < 16; k++) {
      const byte = ram[(a + 1 + (k >> 1)) & 0xffff];
      let s = k & 1 ? byte & 15 : byte >> 4;
      if (s >= 8) s -= 16;
      s = shift <= 12 ? (s << shift) >> 1 : (s < 0 ? -2048 : 0);
      const p1 = v.p1, p2 = v.p2;
      if (filter === 1) s += p1 + (-p1 >> 4);
      else if (filter === 2) s += (p1 << 1) + ((-p1 * 3) >> 5) - p2 + (p2 >> 4);
      else if (filter === 3) s += (p1 << 1) + ((-p1 * 13) >> 6) - p2 + ((p2 * 3) >> 4);
      s = clamp16(s);
      s = (s << 17) >> 16 >> 1;   // 15-bit wrap
      v.p2 = v.p1; v.p1 = s;
      v.decoded[k] = s;
    }
    v.decPos = 0;
    if (hdr & 1) {
      this.endx |= 1 << i;
      if (hdr & 2) v.brrAddr = this.sample(this.regs[(i << 4) + 4]).loop;
      else { v.envMode = 'release'; v.env = 0; v.brrAddr = (a + 9) & 0xffff; v.ended = true; return; }
    } else v.brrAddr = (a + 9) & 0xffff;
    v.ended = false;
  }

  rateTick(rate) {
    if (!rate) return false;
    return ((this.counter + OFFSETS[rate]) % RATES[rate]) === 0;
  }

  envelope(v, i) {
    const b = i << 4, adsr1 = this.regs[b + 5], adsr2 = this.regs[b + 6], gain = this.regs[b + 7];
    if (v.envMode === 'release') { v.env -= 8; if (v.env < 0) v.env = 0; return; }
    let rate, env = v.env;
    if (adsr1 & 0x80) {
      if (v.envMode === 'attack') {
        rate = (adsr1 & 15) * 2 + 1;
        if (this.rateTick(rate)) env += rate < 31 ? 0x20 : 0x400;
        if (env >= 0x7e0) { env = Math.min(env, 0x7ff); v.envMode = 'decay'; }
      } else if (v.envMode === 'decay') {
        rate = ((adsr1 >> 4) & 7) * 2 + 16;
        if (this.rateTick(rate)) env -= ((env - 1) >> 8) + 1;
        if ((env >> 8) === (adsr2 >> 5)) v.envMode = 'sustain';
      } else {
        rate = adsr2 & 31;
        if (this.rateTick(rate)) env -= ((env - 1) >> 8) + 1;
      }
    } else if (gain & 0x80) {
      rate = gain & 31;
      if (this.rateTick(rate)) {
        switch ((gain >> 5) & 3) {
          case 0: env -= 32; break;                       // linear decrease
          case 1: env -= ((env - 1) >> 8) + 1; break;    // exponential decrease
          case 2: env += 32; break;                       // linear increase
          case 3: env += env < 0x600 ? 32 : 8; break;     // bent increase
        }
      }
    } else env = (gain & 0x7f) << 4;                      // direct
    v.env = env < 0 ? 0 : env > 0x7ff ? 0x7ff : env;
  }

  // One 32 kHz output sample. Returns [left, right] as floats.
  sampleOut() {
    const R = this.regs;
    if (++this.counter >= 30720) this.counter = 0;
    if (this.rateTick(R[0x6c] & 31)) {
      const fb = ((this.noise << 13) ^ (this.noise << 14)) & 0x4000;
      this.noise = fb ^ (this.noise >> 1);
    }
    const flg = R[0x6c];
    let L = 0, Rr = 0, eL = 0, eR = 0;
    let prevOut = 0;
    for (let i = 0; i < 8; i++) {
      const v = this.voices[i], b = i << 4;
      if (v.konDelay > 0) { v.konDelay--; if (v.konDelay === 0) { v.decPos = 16; } prevOut = 0; continue; }
      if (flg & 0x80) { v.envMode = 'release'; v.env = 0; }
      // pitch with modulation from the previous voice
      let pitch = (R[b + 2] | (R[b + 3] << 8)) & 0x3fff;
      if (i > 0 && (R[0x2d] >> i) & 1) pitch += ((prevOut >> 5) * pitch) >> 10;
      // fetch / interpolate (4-point, close to the hardware's gaussian)
      while (v.pos >= 0x1000) {
        v.pos -= 0x1000;
        if (v.decPos >= 16) this.decodeBlock(v, i);
        const h = v.history; h[0] = h[1]; h[1] = h[2]; h[2] = h[3]; h[3] = v.decoded[v.decPos++];
      }
      const h = v.history, f = v.pos / 0x1000;
      let s = (R[0x3d] >> i) & 1 ? ((this.noise << 17) >> 16) >> 1
        : cubic(h[0], h[1], h[2], h[3], f);
      v.pos += Math.min(pitch, 0x3fff);
      this.envelope(v, i);
      s = (s * v.env) >> 11;
      prevOut = s;
      R[b + 8] = v.env >> 4; R[b + 9] = (s >> 7) & 0xff;
      const vl = (R[b] << 24) >> 24, vr = (R[b + 1] << 24) >> 24;
      const ol = (s * vl) >> 7, or = (s * vr) >> 7;
      L += ol; Rr += or;
      if ((R[0x4d] >> i) & 1) { eL += ol; eR += or; }
    }
    // echo
    const ram = this.spc.ram;
    const esa = R[0x6d] << 8, edl = (R[0x7d] & 15) * 0x800 || 4;
    const ea = (esa + this.echoPos) & 0xffff;
    const inL = (((ram[ea] | (ram[(ea + 1) & 0xffff] << 8)) << 16) >> 16) >> 1;
    const inR = (((ram[(ea + 2) & 0xffff] | (ram[(ea + 3) & 0xffff] << 8)) << 16) >> 16) >> 1;
    const hL = this.echoHist[0], hR = this.echoHist[1];
    this.firPos = (this.firPos + 1) & 7;
    hL[this.firPos] = inL; hR[this.firPos] = inR;
    let fL = 0, fR = 0;
    for (let k = 0; k < 8; k++) {
      const c = (R[0x0f + k * 0x10] << 24) >> 24;
      fL += (hL[(this.firPos + k + 1) & 7] * c) >> 6;
      fR += (hR[(this.firPos + k + 1) & 7] * c) >> 6;
    }
    fL = clamp16(fL); fR = clamp16(fR);
    const mvl = (R[0x0c] << 24) >> 24, mvr = (R[0x1c] << 24) >> 24, evl = (R[0x2c] << 24) >> 24, evr = (R[0x3c] << 24) >> 24;
    let outL = clamp16(((clamp16(L) * mvl) >> 7) + ((fL * evl) >> 7));
    let outR = clamp16(((clamp16(Rr) * mvr) >> 7) + ((fR * evr) >> 7));
    if (!(flg & 0x20)) {
      const efb = (R[0x0d] << 24) >> 24;
      const wL = clamp16(clamp16(eL) + ((fL * efb) >> 7)) & ~1, wR = clamp16(clamp16(eR) + ((fR * efb) >> 7)) & ~1;
      ram[ea] = wL & 0xff; ram[(ea + 1) & 0xffff] = (wL >> 8) & 0xff;
      ram[(ea + 2) & 0xffff] = wR & 0xff; ram[(ea + 3) & 0xffff] = (wR >> 8) & 0xff;
    }
    this.echoPos += 4; if (this.echoPos >= edl) this.echoPos = 0;
    if (flg & 0x40) outL = outR = 0;
    return [outL / 16384, outR / 16384];   // samples are kept at half scale
  }
}

function cubic(a, b, c, d, t) {
  // Catmull-Rom between b and c
  const v = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  return clamp16(Math.round(v));
}

// Decode a BRR sample from SPC RAM into floats (stops at the end flag).
export function decodeBrr(ram, start, maxBlocks = 4000) {
  const out = [];
  let p1 = 0, p2 = 0, a = start;
  for (let n = 0; n < maxBlocks; n++) {
    const hdr = ram[a & 0xffff];
    const shift = hdr >> 4, filter = (hdr >> 2) & 3;
    for (let i = 0; i < 16; i++) {
      const byte = ram[(a + 1 + (i >> 1)) & 0xffff];
      let s = i & 1 ? byte & 15 : byte >> 4;
      if (s >= 8) s -= 16;
      s = shift <= 12 ? (s << shift) >> 1 : (s < 0 ? -2048 : 0);
      if (filter === 1) s += p1 + (-p1 >> 4);
      else if (filter === 2) s += (p1 << 1) + ((-p1 * 3) >> 5) - p2 + (p2 >> 4);
      else if (filter === 3) s += (p1 << 1) + ((-p1 * 13) >> 6) - p2 + ((p2 * 3) >> 4);
      s = clamp16(s);
      s = (s << 17) >> 16 >> 1;
      p2 = p1; p1 = s;
      out.push(s / 16384);
    }
    a += 9;
    if (hdr & 1) break;
  }
  return Float32Array.from(out);
}
