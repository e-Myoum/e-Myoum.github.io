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
// steerGain is how sharply a bot corrects toward its target point.
export const DIFFICULTIES = {
  facile: { label: 'FACILE', speedMul: 0.72, steerNoise: 0.34, steerGain: 2.0, brakeSkill: 0.6 },
  normal: { label: 'NORMAL', speedMul: 0.86, steerNoise: 0.15, steerGain: 2.4, brakeSkill: 0.8 },
  difficile: { label: 'DIFFICILE', speedMul: 1.0, steerNoise: 0.05, steerGain: 2.85, brakeSkill: 1.0 },
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
  grip: 6.2,             // 1/s — how fast velocity vector snaps to heading (lower = more drift)
  wallBounce: 0.35,      // speed retained (as a fraction, negated) on hard wall hits
  obstacleBounce: 0.4,
  carCarPush: 260,       // separation impulse strength between overlapping cars
};

export const BOT_NAMES = ['RASTA', 'PIXEL', 'CROC'];

// Per-bot fixed racing-line lateral bias (fraction of half track-width, applied
// inside the drivable band) — keeps the 3 bots from all hugging the same line.
export const BOT_LINE_BIAS = [-0.35, 0.0, 0.35];
