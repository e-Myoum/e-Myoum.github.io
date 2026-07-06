// Fixed feel/tuning values, landed on after eyeballing sprite fit in-game.
export const TWEAKS = {
  difficulty: 'normal',
  decollage: 1.1,      // takeoff ease (crest launch-assist multiplier)
  flottement: 1.4,     // air floatiness (inverse of in-air gravity)
  tailleRoueAv: 1.1,
  tailleRoueAr: 1.1,
  taillePilote: 1.38,
  piloteX: -23,
  piloteY: -25,
  piloteRot: 0.475,
  axeArX: 47,
  axeArY: 227,
  axeAvX: 427,
  axeAvY: 193,
  grain: true,
  showSlots: false,
  screenShake: true,
};

// Per-level physics/terrain config. `levelLen` grows with level number so
// runs get progressively longer; everything else stays constant across levels.
export function makeLevelConfig(level) {
  return {
    g: 2100, m: 1, I: 900, wheelR: 34,
    wheels: [{ x: -78, y: 28 }, { x: 82, y: 28 }],
    bodyPts: [{ x: -6, y: -48 }, { x: -22, y: -32 }, { x: 20, y: -36 }],
    k: 520, c: 32, drivePower: 2650, brakePower: 1500, wheelieK: 2600, leanDamp: 230, roll: 1.35,
    airSpin: 5.4, airResp: 7, airSettle: 2.6, airGrav: 0.30, launchGain: 14,
    linDrag: 0.009, angDrag: 3.4, airDrag: 0.02, substeps: 8, maxV: 3400,
    baseY: 410, baseAmp: 132, startFlat: 720, rampDist: 1800,
    levelLen: 6200 + level * 1400,
  };
}

// Sprite manifest: instance key -> file name under assets/.
export const SPRITE_MANIFEST = {
  bgDesert: 'f_bg_desert.jpg',
  moto: 'f_moto.png', wheelR: 'f_wheelRear.png', wheelF: 'f_wheelFront.png',
  joeM: 'f_pilotM_sit.png', joeF: 'f_pilotF_sit.png',
  downM: 'f_pilotM_down.png', downF: 'f_pilotF_down.png',
  crow1: 'f_crow1.png', crow2: 'f_crow2.png', crowFly: 'f_crow_fly.png', tumbleweed: 'f_tumbleweed.png',
  rock1: 'f_rock1.png', rock2: 'f_rock2.png', rock3: 'f_rock3.png', rock4: 'f_rock4.png',
  car1: 'f_car1.png', car2: 'f_car2.png', car3: 'f_car3.png', car4: 'f_car4.png',
  cactus1: 'f_cactus1.png', cactus2: 'f_cactus2.png', cactus3: 'f_cactus3.png', cactus4: 'f_cactus4.png', cactus5: 'f_cactus5.png',
};

// Display height (world px) per cactus variant — kept proportional to each
// source sprite's natural aspect so the tall saguaro reads taller than the
// squat barrel cacti instead of all landmarks sharing one fixed height.
export const CACTUS_H = [57, 54, 54, 140, 113];

// Chassis axle anchors, in chassis-sprite pixel space (overridable via TWEAKS.axe*).
export const CHASSIS_AXLE = { rear: { x: 47, y: 227 }, front: { x: 427, y: 193 } };
