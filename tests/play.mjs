// Headless play-through helper: runs SMB+Sonic with a scripted controller and writes PNG snapshots.
import fs from 'node:fs';
import { parseSmbRom } from '../src/rom/smbRom.js';
import { parseSonicRom } from '../src/rom/sonicRom.js';
import { SmbCore } from '../src/game/core.js';
import { SonicPlugin } from '../src/game/sonic.js';
import { NesRenderer } from '../src/render/nesRenderer.js';
import { placeSonic } from '../src/render/sonicPlacement.js';
import { writePng } from './png.mjs';

export async function makeGame() {
  const romDir = process.env.ROMS;
  const smb = await parseSmbRom(new Uint8Array(fs.readFileSync(romDir + '/smb.nes')));
  const sonicAssets = await parseSonicRom(new Uint8Array(fs.readFileSync(romDir + '/Sonic The Hedgehog (USA, Europe).md')));
  const core = new SmbCore(smb.prg, smb.chr);
  const sonic = new SonicPlugin();
  core.use(sonic);
  core.boot();
  const r = new NesRenderer(smb.chr);
  const snap = (name, scale = 2) => {
    const m = core.m;
    r.hidden = new Set(sonic.display ? sonic.display.slots.map(s => s[0]) : []);
    r.render(m, m.oam, m.frameTop, m.frameMain, m.splitSeen ? 32 : 0);
    const W = 256 * scale, H = 240 * scale;
    const out = new Uint32Array(W * H);
    const ops = placeSonic(sonic.display, sonicAssets);
    const drawOps = (behind) => {
      for (const op of ops) {
        if (!!op.behind !== behind) continue;
        const img = op.img;
        const x0 = Math.round(op.x * scale), y0 = Math.round(op.y * scale);
        const w = Math.round(op.w * scale), h = Math.round(op.h * scale);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          let sx = Math.floor(x * img.w / w); if (op.flip) sx = img.w - 1 - sx;
          const sy = Math.floor(y * img.h / h);
          const i = (sy * img.w + sx) * 4; if (!img.rgba[i + 3]) continue;
          if (op.alpha && ((X + Y) & 1)) continue;
          out[Y * W + X] = 0xff000000 | (img.rgba[i + 2] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i];
        }
      }
    };
    const layer = (buf, opaqueOnly) => {
      for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const i = (Y / scale | 0) * 256 + (X / scale | 0);
        const v = buf[i]; if (v) out[Y * W + X] = v;
      }
    };
    layer(r.back); drawOps(true); layer(r.bg); drawOps(false); layer(r.front);
    writePng(`${process.env.OUT}/${name}.png`, W, H, new Uint8Array(out.buffer));
  };
  return { core, sonic, snap, ram: core.m.ram };
}

if (process.argv[1].endsWith('play.mjs')) {
  const g = await makeGame();
  const script = JSON.parse(process.argv[2] || '[]');
  for (const [frames, buttons, shot] of script) {
    for (let i = 0; i < frames; i++) g.core.frame(buttons);
    if (shot) g.snap(shot);
  }
  const R = (await import('../src/smb/symbols.js')).R;
  const ram = g.ram;
  console.log('x', ram[R.Player_PageLoc] * 256 + ram[R.Player_X_Position], 'y', ram[R.Player_Y_HighPos], ram[R.Player_Y_Position], 'state', ram[R.Player_State], 'ges', ram[R.GameEngineSubroutine], 'vx', g.sonic.vx.toFixed(2));
}
