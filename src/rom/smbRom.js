// Parses and validates the user's Super Mario Bros. ROM (iNES format).

export const SMB_SHA1 = 'facee9c577a5262dbe33ac4930bb0b58c8c037f7'; // PRG+CHR of Super Mario Bros. (World)

export async function sha1Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function looksLikeSmb(bytes) {
  return bytes.length >= 16 + 0xa000 && bytes[0] === 0x4e && bytes[1] === 0x45 && bytes[2] === 0x53 && bytes[3] === 0x1a
    && bytes[4] === 2 && bytes[5] === 1;
}

export async function parseSmbRom(bytes) {
  if (!looksLikeSmb(bytes)) throw new Error('That file is not an NES ROM of Super Mario Bros. (expected 32 KB PRG + 8 KB CHR).');
  const hasTrainer = (bytes[6] & 4) !== 0;
  const off = 16 + (hasTrainer ? 512 : 0);
  const prg = bytes.slice(off, off + 0x8000);
  const chr = bytes.slice(off + 0x8000, off + 0xa000);
  const both = new Uint8Array(0xa000); both.set(prg); both.set(chr, 0x8000);
  const hash = await sha1Hex(both);
  if (hash !== SMB_SHA1) throw new Error('This SMB ROM is not the expected revision (Super Mario Bros. (World)). Checksum: ' + hash);
  return { prg, chr };
}
