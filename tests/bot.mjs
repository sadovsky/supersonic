// God-mode bot: runs right through a level, jumping over walls and pits, to
// smoke-test that Sonic can play through SMB's levels (pipes, flagpoles...).
// usage: node tests/bot.mjs <world 1-8> <areaIndex> <frames> [snapEvery]
import { makeGame } from './play.mjs';
import { R, L } from '../src/smb/symbols.js';
import { BTN } from '../src/game/core.js';

const [world = 1, area = 0, frames = 3000, snapEvery = 0, noGod = 0] = process.argv.slice(2).map(Number);
const g = await makeGame();
const { core, ram } = g;
for (let i = 0; i < 40; i++) core.frame(0);
ram[R.ContinueWorld] = world - 1;
core.frame(BTN.A | BTN.START);
ram[R.AreaNumber] = area; ram[R.LevelNumber] = 0;
core.m.cpu.call(L.LoadAreaPointer);
for (let i = 0; i < 5; i++) core.frame(0);

const blockAt = (px, py) => { // world pixel coords -> block buffer metatile
  if (py < 32 || py >= 240) return 0;
  const col = (px >> 4) & 31, row = (py - 32) >> 4;
  return ram[0x500 + (col >= 16 ? 0xd0 : 0) + row * 16 + (col & 15)];
};
let lastX = 0, stuck = 0, jumpHold = 0, log = [];
let prevGes = -1, prevArea = -1;
for (let f = 0; f < frames; f++) {
  if (!noGod) ram[R.StarInvincibleTimer] = 0x10;
  const x = ram[R.Player_PageLoc] * 256 + ram[R.Player_X_Position];
  const y = ram[R.Player_Y_Position];
  const grounded = ram[R.Player_State] === 0;
  if (Math.abs(x - lastX) < 1 && grounded) stuck++; else stuck = 0;
  lastX = x;
  // pit ahead?
  const look = 20 + Math.abs(g.sonic.vx) * 8;
  let pit = false;
  for (const dx of [look - 8, look]) {
    let ground = false;
    for (let r = 0; r < 13; r++) if (blockAt(x + 8 + dx, 32 + r * 16) && 32 + r * 16 > y + 16) { ground = true; break; }
    if (!ground) pit = true;
  }
  if (grounded && (stuck > 6 || pit)) jumpHold = 40;
  let b = BTN.RIGHT;
  if (jumpHold > 0) { b |= BTN.A; jumpHold--; }
  if (ram[R.SwimmingFlag] && (f % 16) < 8) b |= BTN.A; // swim
  if (ram[R.Player_State] === 3 && ram[R.GameEngineSubroutine] === 8) b = BTN.UP; // climb vines
  // test-only cheat: bounce back out of pits so the bot reaches the end of levels
  if (!noGod && ram[R.GameEngineSubroutine] === 8 && !ram[R.SwimmingFlag] && ram[R.Player_Y_HighPos] === 1 && ram[R.Player_Y_Position] > 196 && g.sonic.vy > 0) {
    g.sonic.vy = -6.5;
  }
  core.frame(b);
  if (process.env.FINDID) for (let e = 0; e < 6; e++) if (ram[R.Enemy_Flag + e] && ram[R.Enemy_ID + e] === +process.env.FINDID && !globalThis.found) { globalThis.found = 1; log.push(`found id at f${f} x=${x}`); g.snap(`found_${world}_${area}`); }
  if (process.env.SPRING && ram[R.JumpspringAnimCtrl] && !globalThis.sp) { globalThis.sp = f; }
  if (globalThis.sp && f - globalThis.sp < 60 && (f - globalThis.sp) % 3 === 0) { log.push(`spring f${f} y=${ram[R.Player_Y_Position]} vy=${g.sonic.vy.toFixed(2)} st=${ram[R.Player_State]} anim=${g.sonic.anim.key} ctl=${ram[R.JumpspringAnimCtrl]}`); if ((f - globalThis.sp) % 9 === 0) g.snap('spring' + (f - globalThis.sp)); }
  const ges = ram[R.GameEngineSubroutine], areaPtr = ram[R.AreaPointer];
  if (ges !== prevGes || areaPtr !== prevArea) {
    log.push(`f${f} ges=${ges} area=${areaPtr.toString(16)} world=${ram[R.WorldNumber] + 1}-${ram[R.LevelNumber] + 1} x=${x} y=${y} mode=${ram[R.OperMode]}`);
    prevGes = ges; prevArea = areaPtr;
  }
  if (snapEvery && f % snapEvery === 0 && f >= (+process.env.SNAPFROM || 0)) { g.snap(`bot_${world}_${area}_${f}`, 1); if (process.env.DBG) console.log(f, core.m.splitSeen, ram[R.Sprite0HitDetectFlag], ram[R.GameEngineSubroutine], core.m.mask, JSON.stringify(core.m.frameTop), JSON.stringify(core.m.frameMain)); }
}
console.log(log.join('\n'));
console.log('final x', ram[R.Player_PageLoc] * 256 + ram[R.Player_X_Position], 'lives', ram[R.NumberofLives], 'world', ram[R.WorldNumber] + 1, 'level', ram[R.LevelNumber] + 1);
g.snap(`bot_${world}_${area}_end`, 2);
