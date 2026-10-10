// The S-DSP's registers, plus a log of key-ons (which sample each voice
// starts). Enough to find and decode the games' sound samples; it does not
// synthesize audio.

export class DSP {
  constructor(spc) {
    this.spc = spc;
    this.regs = new Uint8Array(128);
    this.keyOns = [];   // { voice, srcn, pitch, t }
    this.t = 0;
  }
  read(a) { return a === 0x7c ? 0xff : this.regs[a]; }   // ENDX: report voices as ended
  write(a, v) {
    this.regs[a] = v;
    if (a === 0x4c) for (let i = 0; i < 8; i++) if (v & (1 << i)) {
      const b = i << 4;
      this.keyOns.push({ voice: i, srcn: this.regs[b + 4], pitch: this.regs[b + 2] | (this.regs[b + 3] << 8), vol: this.regs[b], t: this.spc.cycles });
    }
  }
  // Directory entry for a sample number: [start, loop]
  sample(srcn) {
    const dir = this.regs[0x5d] << 8, ram = this.spc.ram;
    const p = dir + srcn * 4;
    return { start: ram[p] | (ram[p + 1] << 8), loop: ram[p + 2] | (ram[p + 3] << 8) };
  }
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
      s = Math.max(-32768, Math.min(32767, s));
      s = (s << 17) >> 16 >> 1; // 15-bit wrap like the hardware
      p2 = p1; p1 = s;
      out.push(s / 16384);
    }
    a += 9;
    if (hdr & 1) break;
  }
  return Float32Array.from(out);
}
