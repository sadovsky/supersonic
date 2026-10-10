# Super Sonic Bros.

Sonic the Hedgehog running through the original *Super Mario Bros.* levels, with Sonic's
own physics: momentum, rolling, a spin-ball jump and a spin dash.

You need your own copies of both games:

| ROM | Expected file |
| --- | --- |
| Super Mario Bros. (NES) | `Super Mario Bros. (World).nes` (iNES, PRG+CHR SHA-1 `facee9c5…`) |
| Sonic the Hedgehog (Genesis) | `Sonic The Hedgehog (USA, Europe).md` (REV00, SHA-1 `6ddb7de1…`), a `.zip` is fine |

Neither ROM, nor any graphics, music or level data from them, is in this repository. Everything
is read from your files in the browser and cached locally (IndexedDB); nothing is uploaded.

## Playing

Serve the folder with any static web server and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Pick both ROM files (or drop them on the page) and press **Start**.

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Run | ← → (or A/D) | D-pad / stick |
| Jump (spin ball) | Z, Space, J, K | A / Y |
| Fireball (with the fire shield) | X, L, Shift | B / X |
| Roll | ↓ while running | |
| Spin dash | hold ↓, tap jump to rev, release ↓ | |
| Look up / duck | ↑ / ↓ while standing | |
| Start / pause | Enter, P | Start |
| Select | Backspace, Tab | Select |

On phones an on-screen controller appears.

## How it plays

* **Levels, enemies, items, music, scoring, timer, warp zones, castles**: all exactly SMB,
  because SMB's own game code is running.
* **Sonic** replaces Mario. His movement uses Sonic 1's physics constants, scaled to the NES
  screen (the NES is 256 px wide, the Genesis 320). Acceleration, friction, top speed, air
  control, variable jump height, rolling and the spin dash work like the Genesis games. The
  camera looks further ahead as he speeds up.
* **Spin attack**: while Sonic is curled into a ball (rolling, or rising in a jump) he destroys
  most enemies on contact. Spinies, Piranha Plants, Podoboos, Bowser and his fire still hurt.
  Landing on enemies from above is SMB's stomp, with bounce and combo points.
* **Power-ups**: the mushroom gives Sonic a shield (SMB's "big" state, so he can break bricks
  and survive one hit), the fire flower gives a fire shield and fireballs, the star gives
  Sonic's invincibility sparkles. Sonic is always two blocks tall.
* **Water levels** use SMB's swimming controls, since Sonic can't swim on his own.
* All text that said MARIO or LUIGI now says SONIC.

## How it works

SMB's original program runs on a small 6502 CPU interpreter (`src/nes/cpu6502.js`). There is no
emulation of the NES video or audio hardware. The game's writes to the PPU and APU registers are
recorded (`src/nes/machine.js`):

* `src/render/nesRenderer.js` draws the recorded nametables and sprites with the ROM's tiles,
  in three layers (behind-background sprites, background, sprites). `src/render/screen.js`
  composites Sonic between them at full display resolution, so his Genesis art stays sharp.
* `src/audio/apu-worklet.js` synthesizes the pulse, triangle and noise channels from the
  recorded register writes in an AudioWorklet, and adds Sonic's sound effects.

Sonic is wired in with **hooks**: native functions that run instead of, or around, specific SMB
routines (`src/game/sonic.js`):

| SMB routine | What the hook does |
| --- | --- |
| `PlayerMovementSubs` | Sonic physics replaces Mario's walking/jumping (normal play only; pipes, flagpole, vines, swimming and cutscenes keep SMB's code) |
| `PlayerBGCollision` | Sonic moves in small substeps and SMB's own collision code runs on each, so blocks, coins, pipes, springs, vines, flagpoles and axes behave as in SMB. Sonic always gets the big-Mario hitbox |
| `PlayerHeadCollision`, `BigBP`/`SmallBP` | Bricks break only with a shield, and bumped blocks are placed at Sonic's (big) head height |
| `EColl` | The spin attack: curled-up Sonic defeats enemies like a star or shell would |
| `ScrollHandler` | The camera look-ahead at speed |
| `UpdScrollVar` | Runs SMB's level renderer more than once a frame when Sonic outruns it |
| `PlayerGfxHandler`, `DrawPlayer_Intermediate` | Records where Mario would be drawn, hides his sprites, and chooses Sonic's animation frame |

Routine and RAM addresses come from `src/smb/symbols.js`, which `tools/asm6mini.py` and
`tools/gen_symbols.py` generate by assembling the community SMB disassembly
([Xkeeper0/smb1](https://github.com/Xkeeper0/smb1), based on doppelganger's smbdis). The assembled
output matches the original ROM byte for byte. Sonic's sprites are decoded from the Genesis ROM
(mappings, dynamic pattern load cues, uncompressed art, and the Nemesis-compressed shield and
stars) by `src/rom/sonicRom.js`, using offsets found with the
[Sonic Retro disassembly](https://github.com/sonicretro/s1disasm).

## Tests

The headless tests run under Node with your ROMs (`ROMS` = folder containing `smb.nes` and
`Sonic The Hedgehog (USA, Europe).md`, `OUT` = folder for PNG snapshots):

```sh
ROMS=~/roms OUT=/tmp/out node tests/all-levels.mjs   # god-mode bot attempts all 32 levels
ROMS=~/roms OUT=/tmp/out node tests/bot.mjs 1 0 3000 # one level, world 1 area 0
ROMS=~/roms OUT=/tmp/out node tests/audio.mjs 900    # renders game audio to game.wav
```

## License

The code in this repository is released under the [MIT License](LICENSE). It covers this
project's own code only. Super Mario Bros. and Sonic the Hedgehog, and everything in their ROMs,
belong to their respective owners and are not part of this project.
