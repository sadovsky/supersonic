// Stage backgrounds captured from the games (filled in by a background worker).
export class StageLibrary {
  constructor(roms) { this.roms = roms; this.stages = []; this.onSamples = null; }
  prefetch() {}
  get() { return null; }
}
