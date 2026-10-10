# Mortal Kombat vs Street Fighter II

A browser fighting game where the fighters of the Super Nintendo *Mortal Kombat* and
*Street Fighter II* meet: Johnny Cage, Kano, Raiden, Liu Kang, Scorpion, Sub-Zero and Sonya
against Ryu, E. Honda, Blanka, Guile, Ken, Chun-Li, Zangief and Dhalsim. Every sprite,
animation, palette, stage background, music track and voice comes from your own ROMs.

You need your own copies of both games:

| ROM | Expected file |
| --- | --- |
| Mortal Kombat (SNES) | `Mortal Kombat (USA) (Rev 1).sfc`, SHA-1 `cf1c70c3…` |
| Street Fighter II (SNES) | `Street Fighter II (USA).sfc`, SHA-1 `7ddcb96e…` |

`.smc` files with a copier header and `.zip` files work too. Neither ROM, nor anything taken
from them, is in this repository. Everything is read from your files in the browser and
cached locally (IndexedDB); nothing is uploaded.

## Playing

Serve the folder with any static web server and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000/mkvsf2/
```

Pick both ROM files (or drop them on the page) and press **Fight!**. The first time, the stage
backgrounds, music and voices are recorded from the games in the background (about a minute);
the fighters are ready straight away.

* **Arcade**: pick a fighter and beat everyone from the other game.
* **Versus**: two players on one keyboard, or with gamepads.
* **CPU Battle**: watch the computer fight itself. The CPU difficulty is set in the same menu.

| Action | Player 1 | Player 2 (versus) | Gamepad |
| --- | --- | --- | --- |
| Move, jump, crouch | W A S D | arrows | d-pad / stick |
| Low / high punch | U / I | Z / X (or numpad 4 / 5) | X / Y |
| Low / high kick | J / K | C / V (or numpad 1 / 2) | A / B |
| Block | L or Space, or hold back | B (or numpad 0), or hold back | shoulder buttons |
| Start / pause | Enter | | Start |

Playing alone, either keyboard layout controls player 1. Phones get an on-screen pad.

### Special moves

Each fighter keeps their own game's specials (directions for a fighter facing right; the move
list is also in the game, top left):

| Fighter | Moves |
| --- | --- |
| Johnny Cage | Green Bolt ←→ + LP · Shadow Kick ←→ + LK |
| Kano | Knife Throw ←→ + LP · Cannonball ←←→ + LK |
| Raiden | Lightning ↓→ + LP · Teleport ↓↑ + any · Torpedo ←←→ + any |
| Liu Kang | Fireball →→ + HP · Flying Kick →→ + HK |
| Scorpion | Spear ←← + LP (pulls the opponent in) · Teleport Punch ↓← + HP |
| Sub-Zero | Ice Ball ↓→ + LP (freezes) · Slide ←← + LK |
| Sonya | Energy Rings ←← + LP · Square Wave →← + HP |
| Ryu, Ken | Hadoken ↓↘→ + P · Shoryuken →↓↘ + P · Tatsumaki ↓↙← + K |
| E. Honda | Hundred Hand Slap: tap P rapidly · Sumo Headbutt: hold ← 1s, → + P |
| Blanka | Electric Thunder: tap P rapidly · Rolling Attack: hold ← 1s, → + P |
| Guile | Sonic Boom: hold ← 1s, → + P · Flash Kick: hold ↓ 1s, ↑ + K |
| Chun-Li | Lightning Legs: tap K rapidly · Spinning Bird Kick: hold ↓ 1s, ↑ + K |
| Zangief | Spinning Piledriver →↘↓↙← + P up close · Double Lariat: both punches |
| Dhalsim | Yoga Fire ↓↘→ + P · Yoga Flame ←↙↓↘→ + P |

Throw: → + high punch up close. The final round of a match won by a Mortal Kombat fighter
ends with *Finish him!*

## How it works

### Fighters: decoded from the ROMs

Both games were reverse-engineered with a small SNES emulator written for this project
(`src/snes/`), by tracing which code and data the games use to draw a fighter. The decoders
read the same data the games do:

* **Street Fighter II** (`src/rom/sf2Rom.js`). Per character, tables in bank $07 point to
  animation scripts (frames of *duration, flags, graphics id, hitbox id*, with loop jumps),
  sprite layouts (lists of 8×8/16×16 pieces) and, per graphics id, a list of DMA transfers
  that stream uncompressed 4bpp tiles from ROM into the character's 4 KB of VRAM. Frames only
  upload the tiles that changed, so the decoder replays the uploads in order; projectiles reuse
  tiles left in VRAM by the throwing animation. Palettes are in bank $05.
* **Mortal Kombat** (`src/rom/mkRom.js`). Per fighter, a table in bank $AE gives the animation
  scripts (frame numbers mixed with commands: jump, flip, move…), the frame table and the tile
  banks. A frame lists 16×16 and 8×8 pieces whose tile codes are either raw 4bpp tiles or
  compressed ones: four mask bytes with one data byte per set bit. The compressed tiles are
  packed by size, and their pointer table is rebuilt exactly as the game builds it in WRAM.
  Palettes are indexed colour lists in bank $97.

Which animation plays for which move was found by pressing buttons in the emulator and
logging the animation each game starts (`tools/mkprobe.mjs`, `tools/sfprobe.mjs`).

### Stages, music and voices: recorded by running the games

Backgrounds are streamed, scrolled per scanline and full of parallax, so instead of decoding
them the game runs them: a Web Worker (`src/stage/worker.js`) boots each game in the emulator,
starts a fight on the wanted stage (hooking the stage loader), and moves the game's own camera
variable from one end of the stage to the other. Every background line is recorded at every
camera position, with HDMA and mid-frame register changes, and each pixel keeps the value it
showed most often (`src/stage/capturer.js`). The game then draws each line with the scroll the
real game would use for that camera position (`src/stage/stage.js`).

The same runs record sound. The sound CPU (SPC700) and the S-DSP are emulated
(`src/snes/spc700.js`, `src/snes/dsp.js`):

* **Music**: a snapshot of the sound CPU is taken mid-fight and keeps running in an
  AudioWorklet (`src/audio/spc-worklet.js`), so each stage plays its own game's music.
* **Sound effects and voices** are recorded as events: whatever samples the game keys on when
  a round starts, a hit lands, a fighter jumps, gets knocked out or performs each of their
  specials (Hadoken, Sonic Boom, Yoga Fire, Get Over Here…), with their timing.

### The fight

`src/game/` is a new fighting engine shared by both casts: movement, jumps, normal moves in
both games' styles (MK's sweeps and uppercuts, SF2's close and crouching attacks), blocking by
holding back or with a block button, throws, combos, dizzies, knockdowns, projectiles and each
fighter's specials, plus a CPU opponent that plays through the same input path. Hit and hurt
boxes are measured from the sprites themselves: the part of an attack frame that reaches
beyond the fighter's idle body is what hits. Everything is drawn by a small software renderer
at the SNES resolution (256×224).

## Tests

The headless tests run under Node with your ROMs (`ROMS` = folder with both ROMs, `OUT` = where
to write snapshots):

```sh
ROMS=~/roms node tests/specials.mjs                  # every special move triggers from its input
ROMS=~/roms node tests/cpu-match.mjs                 # CPU vs CPU matches for each fighter
ROMS=~/roms OUT=/tmp/out node tests/screens.mjs      # title, menu, select, VS and fight snapshots
ROMS=~/roms OUT=/tmp/out node tests/snap-match.mjs 4 7   # snapshots of a match
```

`tools/` holds the reverse-engineering scripts (disassembler, tracers, contact sheets).

## License

The code in this repository is released under the [MIT License](../LICENSE). It covers this
project's own code only. Mortal Kombat and Street Fighter II, and everything in their ROMs,
belong to their respective owners and are not part of this project.
