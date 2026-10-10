// Stage backgrounds, captured from the games in background workers and cached
// in IndexedDB (they are derived from the player's ROMs, so they stay local).

import { makeStage } from './stage.js';

const DB = 'mk-vs-sf2-stages', STORE = 'stages', VERSION = 'v3';
// SF2: each fighter's home stage. MK: one of the game's seven stages per fighter.
const MK_STAGE_OF = [1, 3, 2, 0, 5, 6, 4];
const MK_NAMES = ['The Courtyard', 'Warrior Shrine', 'Palace Gates', 'The Pit', 'Throne Room', "Goro's Lair", 'Pit Bottom'];
const SF2_NAMES = ['Japan', 'Japan (Honda)', 'Brazil', 'USA (Guile)', 'USA (Ken)', 'China', 'USSR', 'India'];
const GROUND = { sf2: 196, mk: 186 };

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class StageLibrary {
  constructor(roms) {
    this.roms = roms;
    this.data = new Map();     // `${game}:${id}` -> captured data
    this.stages = new Map();   // key -> stage object
    this.onProgress = null;
    this.onSounds = null;      // (key, parts) for every recorded sound event
  }

  // Sound events recorded alongside a stage: the game's generic sounds and the
  // voices of the fighter who fought there
  addData(game, id, data) {
    const k = this.key(game, id);
    this.data.set(k, data);
    if (this.onSounds && data.sounds) for (const [name, parts] of Object.entries(data.sounds)) {
      if (name.startsWith('special:')) this.onSounds(`special:${data.fighter}:${name.slice(8)}`, parts);
      else this.onSounds(`${game}:${name}`, parts);
    }
    this.onProgress?.();
  }

  musicFor(key) { return this.data.get(key)?.music || null; }

  key(game, id) { return `${game}:${id}`; }
  stageFor(entry) { return entry.game === 'sf2' ? { game: 'sf2', id: entry.index } : { game: 'mk', id: MK_STAGE_OF[entry.index] }; }

  get(opp) {
    const { game, id } = this.stageFor(opp);
    const k = this.key(game, id);
    if (this.stages.has(k)) return this.stages.get(k);
    const d = this.data.get(k);
    if (!d) return null;
    const st = makeStage(d, { name: (game === 'mk' ? MK_NAMES : SF2_NAMES)[id], ground: GROUND[game] });
    st.key = k;
    this.stages.set(k, st);
    return st;
  }

  get total() { return 15; }
  get ready() { return this.data.size; }

  async prefetch() {
    let db = null;
    try { db = await openDb(); } catch { /* no cache */ }
    const want = { sf2: [0, 1, 2, 3, 4, 5, 6, 7], mk: [0, 1, 2, 3, 4, 5, 6] };
    for (const game of ['sf2', 'mk']) {
      const missing = [];
      for (const id of want[game]) {
        const cached = db && await new Promise(res => {
          const r = db.transaction(STORE).objectStore(STORE).get(`${VERSION}:${this.key(game, id)}`);
          r.onsuccess = () => res(r.result); r.onerror = () => res(null);
        });
        if (cached) this.addData(game, id, cached);
        else missing.push(id);
      }
      if (!missing.length || !this.roms[game]) continue;
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => {
        const { game: g, id, data, error } = e.data;
        if (error) { console.warn('stage capture failed', g, id, error); return; }
        this.addData(g, id, data);
        if (db) try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, `${VERSION}:${this.key(g, id)}`); } catch { /* ignore */ }
        if (missing.every(m => this.data.has(this.key(g, m)))) w.terminate();
      };
      w.postMessage({ game, rom: this.roms[game], stages: missing });
    }
  }
}
