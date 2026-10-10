// Which of each game's animations plays each move, and the moves themselves.
//
// The animation ids are the games' own (found by watching which animation
// the game starts for each input). SF2 animations carry their own frame
// timing; MK's timing is set per move here (in the game it lives in the move
// code, not the animation scripts).

// Common move set. `hit` describes the attack:
//   dmg: damage out of 1000, stun: hit stun (ticks), block: block stun,
//   level: 'high' | 'mid' | 'low' | 'air', kd: knockdown ('fall' | 'sweep' | 'launch'),
//   push: push back on hit, act: index of the first active frame (default: the
//   frame that reaches furthest), actLen: active frames.
export const MOVES = {
  lp: { hit: { dmg: 40, stun: 14, block: 10, level: 'high', push: 3 } },
  hp: { hit: { dmg: 95, stun: 22, block: 14, level: 'high', push: 5 } },
  lk: { hit: { dmg: 50, stun: 15, block: 10, level: 'mid', push: 3 } },
  hk: { hit: { dmg: 100, stun: 22, block: 14, level: 'mid', push: 6 } },
  closeHp: { hit: { dmg: 105, stun: 24, block: 14, level: 'high', push: 4 } },
  closeHk: { hit: { dmg: 100, stun: 24, block: 14, level: 'mid', push: 4 } },
  clp: { hit: { dmg: 35, stun: 12, block: 8, level: 'low', push: 2 } },
  chp: { hit: { dmg: 110, stun: 26, block: 16, level: 'mid', push: 5, kd: 'launch' } },
  clk: { hit: { dmg: 40, stun: 12, block: 8, level: 'low', push: 2 } },
  chk: { hit: { dmg: 90, stun: 20, block: 14, level: 'low', push: 4, kd: 'sweep' } },
  jp: { hit: { dmg: 80, stun: 20, block: 12, level: 'air', push: 3 } },
  jk: { hit: { dmg: 90, stun: 20, block: 12, level: 'air', push: 4 } },
  sweep: { hit: { dmg: 90, stun: 20, block: 14, level: 'low', push: 4, kd: 'sweep' } },
  roundhouse: { hit: { dmg: 120, stun: 26, block: 16, level: 'mid', push: 7, kd: 'fall' } },
};

// ---------------------------------------------------------------- SF2 ----
// Animation ids shared by all SF2 characters (same engine, same layout).
const SF2_ANIMS = {
  idle: 0x02, walkF: 0x00, walkB: 0x01, crouchDown: 0x04, crouch: 0x06, standUp: 0x08, turn: 0x10,
  jumpUp: 0x0c, jumpF: 0x0a, jumpB: 0x0b,
  lp: 0x51, hp: 0x55, lk: 0x57, hk: 0x5b, closeHp: 0x54, closeHk: 0x5a,
  clp: 0x5c, chp: 0x60, clk: 0x62, chk: 0x66,
  jp: 0x6c, jk: 0x72, jpF: 0x6d, jkF: 0x73,
  block: 0x24, crouchBlock: 0x27,
  hitHigh: 0x1e, hitHeavy: 0x23, hitLow: 0x2a,
  sweepFall: 0x2d, launch: 0x2f, fall: 0x31, lie: 0x30, getup: 0x33,
  dizzy: 0x34, throw: 0x7d, thrown: 0x37, victory: 0x84,
};

// Specials. motion: 'qcf' | 'qcb' | 'dp' | 'chargeBF' | 'chargeDU' | 'mash' | '360' | 'hcf' | 'bf' | 'bb' | 'ff' | 'df' | 'du' | 'bbf' | 'hold'
// button: 'p' | 'k' | 'lp' | 'hp' | 'lk' | 'hk' | 'bl'
// kind: 'projectile' (proj: animation of the projectile object, after: animation
// whose tiles it reuses), 'rising', 'spin', 'dash', 'flurry', 'grab', 'teleport'
const SF2_SPECIALS = {
  Ryu: [
    { name: 'Hadoken', motion: 'qcf', button: 'p', anim: 0x74, kind: 'projectile', proj: 0x81, after: 0x74, speed: 3, spawn: 3, hit: { dmg: 100, stun: 22, block: 16, level: 'mid', push: 6 } },
    { name: 'Shoryuken', motion: 'dp', button: 'p', anim: 0x77, kind: 'rising', invuln: 8, hit: { dmg: 150, stun: 30, block: 20, level: 'mid', kd: 'launch', push: 4 } },
    { name: 'Tatsumaki', motion: 'qcb', button: 'k', anim: 0x7a, startAnim: 0x78, endAnim: 0x79, kind: 'spin', dur: 40, speed: 2.5, hit: { dmg: 90, stun: 22, block: 14, level: 'high', kd: 'fall', push: 5 } },
  ],
  'E. Honda': [
    { name: 'Hundred Hand Slap', motion: 'mash', button: 'p', anim: 0x78, startAnim: 0x77, kind: 'flurry', dur: 40, hit: { dmg: 35, stun: 10, block: 8, level: 'high', push: 2, multi: 6 } },
    { name: 'Sumo Headbutt', motion: 'chargeBF', button: 'p', anim: 0x74, kind: 'dash', dur: 30, speed: 5, hit: { dmg: 120, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6 } },
  ],
  Blanka: [
    { name: 'Electric Thunder', motion: 'mash', button: 'p', anim: 0xa5, kind: 'flurry', dur: 50, hit: { dmg: 40, stun: 18, block: 10, level: 'mid', push: 4, multi: 8, shock: true } },
    { name: 'Rolling Attack', motion: 'chargeBF', button: 'p', anim: 0x74, kind: 'dash', dur: 32, speed: 5.5, hit: { dmg: 120, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6 } },
  ],
  Guile: [
    { name: 'Sonic Boom', motion: 'chargeBF', button: 'p', anim: 0x74, kind: 'projectile', proj: 0x7d, after: 0x74, speed: 3, spawn: 2, hit: { dmg: 90, stun: 22, block: 16, level: 'mid', push: 6 } },
    { name: 'Flash Kick', motion: 'chargeDU', button: 'k', anim: 0x75, kind: 'rising', invuln: 8, hit: { dmg: 150, stun: 30, block: 20, level: 'mid', kd: 'launch', push: 4 } },
  ],
  Ken: [
    { name: 'Hadoken', motion: 'qcf', button: 'p', anim: 0x74, kind: 'projectile', proj: 0x81, after: 0x74, speed: 3, spawn: 3, hit: { dmg: 100, stun: 22, block: 16, level: 'mid', push: 6 } },
    { name: 'Shoryuken', motion: 'dp', button: 'p', anim: 0x77, kind: 'rising', invuln: 8, hit: { dmg: 160, stun: 30, block: 20, level: 'mid', kd: 'launch', push: 4 } },
    { name: 'Tatsumaki', motion: 'qcb', button: 'k', anim: 0x7a, startAnim: 0x78, endAnim: 0x79, kind: 'spin', dur: 40, speed: 2.5, hit: { dmg: 90, stun: 22, block: 14, level: 'high', kd: 'fall', push: 5 } },
  ],
  'Chun-Li': [
    { name: 'Lightning Legs', motion: 'mash', button: 'k', anim: 0x7c, startAnim: 0x7b, kind: 'flurry', dur: 40, hit: { dmg: 35, stun: 10, block: 8, level: 'mid', push: 2, multi: 6 } },
    { name: 'Spinning Bird Kick', motion: 'chargeDU', button: 'k', anim: 0x75, startAnim: 0x74, kind: 'spin', dur: 46, speed: 2.5, air: true, hit: { dmg: 80, stun: 20, block: 14, level: 'high', kd: 'fall', push: 5, multi: 2 } },
  ],
  Zangief: [
    { name: 'Spinning Piledriver', motion: '360', button: 'p', anim: 0x82, kind: 'grab', range: 40, hit: { dmg: 230, kd: 'fall' } },
    { name: 'Double Lariat', motion: 'all', button: 'p', anim: 0x74, kind: 'spin', dur: 40, speed: 1.2, hit: { dmg: 100, stun: 24, block: 14, level: 'high', kd: 'fall', push: 5 } },
  ],
  Dhalsim: [
    { name: 'Yoga Fire', motion: 'qcf', button: 'p', anim: 0x74, kind: 'projectile', proj: 0x78, after: 0x74, speed: 2, spawn: 3, hit: { dmg: 90, stun: 22, block: 16, level: 'mid', push: 6, burn: true } },
    { name: 'Yoga Flame', motion: 'hcf', button: 'p', anim: 0x75, kind: 'flame', hit: { dmg: 120, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6, burn: true } },
  ],
};

// ----------------------------------------------------------------- MK ----
// MK animation ids, with frame timing (ticks per frame) and which frames hold.
const MK_ANIMS = {
  idle: [0x00, 4], walkF: [0x01, 4], walkB: [0x03, 4], crouchDown: [0x07, 2], crouch: [0x0c, 8], standUp: [0x5f, 2],
  jumpUp: [0x05, 99], jumpF: [0x0e, 4], jumpB: [0x0f, 4],
  lp: [0x13, 3], hp: [0x39, 3], lk: [0x3d, 3], hk: [0x26, 3], closeHp: [0x1d, 3], closeHk: [0x24, 3],
  clp: [0x0a, 3], chp: [0x0a, 3], clk: [0x0d, 3], chk: [0x0d, 4],
  jp: [0x27, 3], jk: [0x1c, 3], jpF: [0x27, 3], jkF: [0x28, 3],
  sweep: [0x25, 3], roundhouse: [0x36, 4],
  block: [0x38, 2], crouchBlock: [0x57, 4],
  hitHigh: [0x35, 3], hitHeavy: [0x35, 4], hitLow: [0x33, 3],
  sweepFall: [0x30, 5], launch: [0x2a, 7], fall: [0x2a, 7], lie: [0x44, 99], getup: [0x20, 5],
  dizzy: [0x34, 8], throw: [0x1e, 5], thrown: [0x47, 6], victory: [0x40, 8],
};

const proj = (extra = {}) => ({ name: 'Projectile', anim: 0x21, kind: 'projectile', proj: 0x22, impact: 0x23, speed: 4, spawn: 2, hit: { dmg: 100, stun: 22, block: 16, level: 'mid', push: 6 }, ...extra });

const MK_SPECIALS = {
  'Johnny Cage': [
    proj({ name: 'Green Bolt', motion: 'bf', button: 'lp' }),
    { name: 'Shadow Kick', motion: 'bf', button: 'lk', anim: 0x58, kind: 'dash', dur: 22, speed: 6, hit: { dmg: 120, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6 } },
  ],
  Kano: [
    proj({ name: 'Knife Throw', motion: 'bf', button: 'lp', speed: 5 }),
    { name: 'Cannonball', motion: 'bbf', button: 'lk', anim: 0x2b, kind: 'dash', dur: 30, speed: 5, hit: { dmg: 110, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6 } },
  ],
  Raiden: [
    proj({ name: 'Lightning', motion: 'df', button: 'lp', speed: 5 }),
    { name: 'Teleport', motion: 'du', button: 'any', anim: 0x18, endAnim: 0x19, kind: 'teleport' },
    { name: 'Torpedo', motion: 'bbf', button: 'any', anim: 0x2b, kind: 'dash', dur: 28, speed: 6, air: true, hit: { dmg: 120, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6 } },
  ],
  'Liu Kang': [
    proj({ name: 'Fireball', motion: 'ff', button: 'hp' }),
    { name: 'Flying Kick', motion: 'ff', button: 'hk', anim: 0x5a, kind: 'dash', dur: 26, speed: 6, air: true, hit: { dmg: 120, stun: 26, block: 16, level: 'mid', kd: 'fall', push: 6 } },
  ],
  Scorpion: [
    proj({ name: 'Spear', motion: 'bb', button: 'lp', anim: 0x1b, pull: true, speed: 6, hit: { dmg: 60, stun: 60, block: 16, level: 'mid', push: 0 } }),
    { name: 'Teleport Punch', motion: 'db', button: 'hp', anim: 0x18, kind: 'teleport', attack: true, hit: { dmg: 100, stun: 24, block: 14, level: 'high', kd: 'fall', push: 5 } },
  ],
  'Sub-Zero': [
    proj({ name: 'Ice Ball', motion: 'df', button: 'lp', freeze: true, speed: 3.5, hit: { dmg: 40, stun: 100, block: 16, level: 'mid', push: 0 } }),
    { name: 'Slide', motion: 'bb', button: 'lk', anim: 0x43, kind: 'dash', dur: 24, speed: 6, hit: { dmg: 100, stun: 24, block: 14, level: 'low', kd: 'sweep', push: 6 } },
  ],
  Sonya: [
    proj({ name: 'Energy Rings', motion: 'bb', button: 'lp' }),
    { name: 'Square Wave', motion: 'fb', button: 'hp', anim: 0x5c, endAnim: 0x5d, kind: 'dash', dur: 26, speed: 5, air: true, hit: { dmg: 110, stun: 26, block: 16, level: 'high', kd: 'fall', push: 6 } },
  ],
};

export const ROSTER = [
  ...['Johnny Cage', 'Kano', 'Raiden', 'Liu Kang', 'Scorpion', 'Sub-Zero', 'Sonya'].map((name, i) => ({ game: 'mk', index: i, name, specials: MK_SPECIALS[name] })),
  ...['Ryu', 'E. Honda', 'Blanka', 'Guile', 'Ken', 'Chun-Li', 'Zangief', 'Dhalsim'].map((name, i) => ({ game: 'sf2', index: i, name, specials: SF2_SPECIALS[name] })),
];

export const ANIMS = { sf2: SF2_ANIMS, mk: MK_ANIMS };
