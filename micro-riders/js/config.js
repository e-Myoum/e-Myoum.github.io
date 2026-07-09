// Playable car models. `body` is a polygon in local car-space (x forward, y right,
// origin at the car's center) used both for rendering and as the visual silhouette;
// physics always uses a single bounding circle (see TUNING.carRadius) for collisions.
// `slipMul` (car.js) scales how much grip a car loses specifically from
// steering hard at speed — Flash's edge over Buggy is concentrated there
// (fine in a straight line, twitchy the moment you carry speed into a
// corner) rather than being generally slidier everywhere, which read as
// just "worse" instead of "a different trade-off".
export const CARS = [
  {
    id: 'buggy',
    name: 'BUGGY',
    tagline: 'Tout-terrain, accroche partout',
    length: 44, width: 26,
    accelMul: 0.98, maxSpeedMul: 0.92, gripMul: 1.15, turnMul: 1.1, slipMul: 1.0,
  },
  {
    id: 'flash',
    name: 'FLASH',
    tagline: 'Chassis bas, pointe de vitesse',
    length: 46, width: 22,
    accelMul: 0.80, maxSpeedMul: 1.10, gripMul: 1.0, turnMul: 0.95, slipMul: 1.8,
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
// steerGain is how sharply a bot corrects toward its target point.
// cornerAggro feeds the corner-speed-trim (see ai.js) as `1 - curve*cornerAggro`
// — so LOWER cornerAggro means LESS speed shaved off for a given corner, i.e.
// a bot commits harder/brakes later. lineSpread widens/narrows the random
// racing-line bias bots get assigned each race (see Game#buildCars) — lower
// difficulties wander a wider, sloppier range of lines. hazardAware is a
// qualitative (not just numeric) skill gap: only difficult bots actually
// steer around a soap/oil slick when it's convenient to, rather than driving
// through it blind.
export const DIFFICULTIES = {
  facile: { label: 'FACILE', speedMul: 0.90, steerNoise: 0.18, steerGain: 2.5, brakeSkill: 0.88, lineSpread: 1.05, cornerAggro: 0.50, hazardAware: false },
  normal: { label: 'NORMAL', speedMul: 1.05, steerNoise: 0.07, steerGain: 3.0, brakeSkill: 0.98, lineSpread: 0.75, cornerAggro: 0.36, hazardAware: false },
  difficile: { label: 'DIFFICILE', speedMul: 1.20, steerNoise: 0.01, steerGain: 3.6, brakeSkill: 1.0, lineSpread: 0.35, cornerAggro: 0.22, hazardAware: true },
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
// color, see Renderer#drawTintedSprite); bedroom obstacles: obsBlocks, obsBooks,
// obsMarble, obsPencil, obsBigblock; bedroom decor: decorBed, decorToybox,
// decorLamp, decorRugpatch, decorBall, decorBlockspair, decorSock, decorMarble;
// kitchen obstacles: obsCapstack, obsPeas, obsSpoon, obsSponge, obsMatchbox;
// kitchen decor: decorPlacemat, decorFruitbowl, decorMugsteam, decorFloormat,
// decorApple, decorCappair, decorNapkin, decorOlive; hazard zones (both
// circuits): surfOil, surfWater, surfHoney.
export const SPRITE_MANIFEST = {};
