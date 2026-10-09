// ROM file handling: identify which ROM a file is, unzip .zip files, and keep
// the ROMs in IndexedDB so the player only has to pick them once.

const DB = 'super-sonic-bros', STORE = 'roms';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRom(key, bytes) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('Could not cache ROM', e); }
}

export async function loadRom(key) {
  try {
    const db = await openDb();
    return await new Promise((res) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => res(req.result ? new Uint8Array(req.result) : null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

export async function forgetRoms() {
  try {
    const db = await openDb();
    await new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; });
  } catch { /* ignore */ }
}

// Minimal .zip reader (stored or deflated entries) using DecompressionStream.
export async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // find end of central directory
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
    const data = bytes.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    let out;
    if (method === 0) out = data.slice();
    else if (method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
      out = new Uint8Array(buf);
    } else continue;
    if (out.length === usize || usize === 0) files.push({ name, bytes: out });
  }
  return files;
}

// Returns 'smb' | 'sonic' | null
export function identify(bytes) {
  if (bytes.length >= 16 && bytes[0] === 0x4e && bytes[1] === 0x45 && bytes[2] === 0x53 && bytes[3] === 0x1a) return 'smb';
  if (bytes.length >= 0x200) {
    const s = String.fromCharCode(...bytes.subarray(0x100, 0x200));
    if (s.includes('SEGA') && /SONIC/i.test(s)) return 'sonic';
  }
  return null;
}

// Expand a picked/dropped File into candidate ROM byte arrays.
export async function filesToRoms(fileList) {
  const found = {};
  for (const file of fileList) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const entries = isZip ? await unzip(bytes) : [{ name: file.name, bytes }];
    for (const e of entries) {
      const kind = identify(e.bytes);
      if (kind) found[kind] = e.bytes;
    }
  }
  return found;
}
