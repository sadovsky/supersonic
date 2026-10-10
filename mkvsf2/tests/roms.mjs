// Finds the two ROMs (.sfc/.smc, or inside .zip) in $ROMS for headless tests.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
function unzip(buf) {
  const out = [];
  for (let p = 0; p + 30 < buf.length && buf.readUInt32LE(p) === 0x04034b50;) {
    const method = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + csize);
    out.push(method === 8 ? zlib.inflateRawSync(data) : data);
    p += 30 + nlen + xlen + csize;
  }
  return out;
}
export function findRoms(dir = process.env.ROMS || '/tmp/claude-0/-home-user-supersonic/95b0bd18-d1ab-5346-8b3f-3765e31ee336/scratchpad/roms') {
  const found = {};
  for (const name of fs.readdirSync(dir)) {
    const buf = fs.readFileSync(path.join(dir, name));
    for (let rom of name.toLowerCase().endsWith('.zip') ? unzip(buf) : [buf]) {
      if (rom.length % 0x8000 === 512) rom = rom.subarray(512);
      const title = rom.subarray(0x7fc0, 0x7fd5).toString('latin1');
      if (title.startsWith('Street Fighter 2')) found.sf2 = new Uint8Array(rom);
      if (title.startsWith('MORTAL KOMBAT')) found.mk = new Uint8Array(rom);
    }
  }
  if (!found.sf2 || !found.mk) throw new Error('Set ROMS to a folder with both ROMs');
  return found;
}
