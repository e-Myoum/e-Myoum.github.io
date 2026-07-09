// Playable car models. `body` is a polygon in local car-space (x forward, y right,
// origin at the car's center) used both for rendering and as the visual silhouette;
// physics always uses a single bounding circle (see TUNING.carRadius) for collisions.
export const CARS = [
  {
    id: 'buggy',
    name: 'BUGGY',
    tagline: 'Tout-terrain, accroche partout',
    length: 44, width: 26,
    accelMul: 0.92, maxSpeedMul: 0.92, gripMul: 1.15, turnMul: 1.1,
  },
  {
    id: 'flash',
    name: 'FLASH',
    tagline: 'Chassis bas, pointe de vitesse',
    length: 46, width: 22,
    accelMul: 1.08, maxSpeedMul: 1.08, gripMul: 0.9, turnMul: 0.95,
  },
];

// Bright, toy-catalogue colors — picked for contrast against the beige carpet/
// wood-floor palette so every car reads clearly against the track art.
export const COLOR_SWATCHES = [
  '#e6402c', '#2a9ee0', '#f5c518', '#39c46b',
  '#a855f7', '#ff7ac6', '#f2f2f2', '#2b2b33',
];

// Bot skill presets. speedMul scales a bot's effective top speed against the
// player's TUNING.maxSpeed; steerNoise adds heading jitter (imperfect line);
// steerGain is how sharply a bot corrects toward its target point; cornerAggro
// is how much of the corner-speed-trim (see ai.js) a bot actually commits to —
// lower means it brakes earlier/harder for corners, higher means it carries
// speed in deeper. lineSpread widens/narrows the random racing-line bias bots
// get assigned each race (see Game#buildCars) — lower difficulties wander a
// wider, sloppier range of lines.
export const DIFFICULTIES = {
  facile: { label: 'FACILE', speedMul: 0.80, steerNoise: 0.28, steerGain: 2.2, brakeSkill: 0.7, lineSpread: 1.2, cornerAggro: 0.62 },
  normal: { label: 'NORMAL', speedMul: 0.95, steerNoise: 0.12, steerGain: 2.7, brakeSkill: 0.92, lineSpread: 0.95, cornerAggro: 0.48 },
  difficile: { label: 'DIFFICILE', speedMul: 1.05, steerNoise: 0.03, steerGain: 3.1, brakeSkill: 1.0, lineSpread: 0.6, cornerAggro: 0.35 },
};

export const LAPS = 3;

// Shared arcade-physics tuning (world units are px at zoom 1).
export const TUNING = {
  carRadius: 17,
  maxSpeed: 480,
  maxReverseSpeed: 210,
  accel: 620,
  brakeDecel: 900,
  coastDecel: 260,
  turnRate: 3.05,        // rad/s at full speed
  turnRateLowSpeedFloor: 0.42, // fraction of turnRate kept at near-zero speed
  grip: 4.0,             // 1/s — how fast velocity vector snaps to heading (lower = more drift)
  gripSlipSteer: 0.55,   // extra grip lost (fraction) steering hard at full speed — the harder/faster you turn, the more the tail slides
  obstacleBounce: 0.4,
  carCarRestitution: 0.55, // "bounciness" of car-vs-car hits — impulse scales with closing speed, so a graze stays soft and a T-bone throws both cars hard
  carCarImpulseCap: 900,
  offTrackLimit: 2.2,    // seconds fully off the drivable band before a car explodes
  respawnDelay: 1.1,     // seconds frozen (exploded) before respawning back on track
  offTrackGripMul: 0.5,  // grip multiplier off the drivable band — grass/floor-edge traction loss, not just a timer
  offTrackSpeedCapFrac: 0.55, // fraction of top speed a car is capped to off-track — makes cutting a corner reliably slower than staying on the tarmac
  oilGripMul: 0.16,      // grip multiplier while on a soap/oil slick — the car barely bites, mostly slides
  honeyDrag: 220,        // extra deceleration (u/s^2) while on a honey patch — must stay below the weakest car's accel or a car that stops on it can never move again
  honeySpeedCapFrac: 0.35, // fraction of top speed a car is capped to while on honey — this (not the drag) is what makes it feel "stuck slow", so it never fights to a standstill
};

export const BOT_NAMES = ['RASTA', 'PIXEL', 'CROC'];

// Racing-line bias buckets bots randomly draw from each race (shuffled, one
// bucket per bot — see Game#buildCars), instead of a fixed line every time.
export const BOT_BIAS_BUCKETS = [[-0.55, -0.15], [-0.15, 0.15], [0.15, 0.55]];

// Sprite manifest: draw key -> file name under assets/. Empty for now — every
// Renderer draw method already checks `this.spr[key]` first and falls back to
// the existing vector art, so dropping art files in assets/ and adding the
// matching entries here is the only step needed to switch a piece over to a
// sprite later; no other code changes. Expected keys, for when that art shows
// up: carBuggy, carFlash (cars — tinted at draw time by the player's chosen
// color, see Renderer#drawTintedSprite); obsBlocks, obsBooks, obsMarble,
// obsPencil, obsBigblock (obstacles); decorBed, decorToybox, decorLamp, decorRugpatch,
// decorBall, decorBlockspair, decorSock, decorMarble (decor); surfOil,
// surfHoney (hazard zones).
export const SPRITE_MANIFEST = {};
