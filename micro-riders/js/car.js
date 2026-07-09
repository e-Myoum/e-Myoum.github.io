import { TUNING } from './config.js';

// One car's kinematic state. `speed` is the signed forward speed (negative =
// reversing); `vx`/`vy` is the actual velocity vector, which only chases the
// heading-aligned vector at a finite rate (TUNING.grip) — that lag is what
// gives corners a slide instead of feeling like it's on rails. `surfaceGrip`/
// `surfaceDrag` are set every frame by Game#applySurfaces from whatever hazard
// zone (if any) the car is currently over.
export function makeCar({ x, y, heading, carType, color, isPlayer, name }) {
  return {
    x, y, heading, carType, color, isPlayer, name,
    speed: 0, vx: 0, vy: 0,
    lap: 0, distAlong: 0, lastS: 0, finished: false, finishTime: 0,
    rank: 1, skidAmt: 0,
    offTrackTime: 0, exploding: false, explodeT: 0,
    surfaceGrip: 1, surfaceDrag: 0, surfaceSpeedCap: Infinity, onOil: false,
  };
}

// Integrates one car for `dt` seconds given {steer:-1..1, gas:bool, brake:bool}.
// Purely kinematic — track/obstacle/car collision is resolved afterward by the caller.
export function stepCar(car, input, dt, carModel) {
  const t = TUNING;
  const maxSpeed = t.maxSpeed * carModel.maxSpeedMul;
  const maxRev = t.maxReverseSpeed * carModel.maxSpeedMul;

  if (input.gas && !input.brake) {
    car.speed += t.accel * carModel.accelMul * dt;
  } else if (input.brake && !input.gas) {
    if (car.speed > 0) car.speed -= t.brakeDecel * dt;
    else car.speed -= t.accel * carModel.accelMul * 0.7 * dt;
  } else {
    // coast: engine braking bleeds speed back toward zero either direction
    const decel = t.coastDecel * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - decel);
    else car.speed = Math.min(0, car.speed + decel);
  }
  car.speed = Math.max(-maxRev, Math.min(maxSpeed, car.speed));

  // honey patch: a mild sticky drag (direction-aware, so it saps speed rather
  // than snapping to a stop) plus a hard speed cap. The cap — not the drag —
  // is what actually makes honey feel "stuck slow": the drag alone must stay
  // weaker than every car's acceleration, or a car that fully stops on the
  // patch could never move again (net force can't go positive from a
  // standstill). The cap has no such trap since it only ever limits speed,
  // never opposes the motion that's building toward it.
  if (car.surfaceDrag) {
    const d = car.surfaceDrag * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - d);
    else car.speed = Math.min(0, car.speed + d);
  }
  car.speed = Math.max(-car.surfaceSpeedCap, Math.min(car.surfaceSpeedCap, car.speed));

  // steering authority ramps up with speed (near-stationary cars barely pivot)
  const speedFrac = Math.min(1, Math.abs(car.speed) / maxSpeed);
  const turnAuthority = t.turnRateLowSpeedFloor + (1 - t.turnRateLowSpeedFloor) * speedFrac;
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += input.steer * t.turnRate * carModel.turnMul * turnAuthority * dir * dt;

  const hx = Math.cos(car.heading), hy = Math.sin(car.heading);
  const targetVx = hx * car.speed, targetVy = hy * car.speed;
  // grip drops the harder you steer at speed (the tail steps out mid-corner),
  // scaled per-car by slipMul (Flash loses much more here than Buggy), and
  // drops hard on a soap/oil slick — all three funnel through the same knob
  const slipPenalty = 1 - t.gripSlipSteer * (carModel.slipMul ?? 1) * Math.abs(input.steer) * speedFrac;
  const grip = t.grip * carModel.gripMul * Math.max(0.15, slipPenalty) * car.surfaceGrip;
  const lerp = Math.min(1, grip * dt);
  car.vx += (targetVx - car.vx) * lerp;
  car.vy += (targetVy - car.vy) * lerp;

  // how far actual velocity has drifted off the heading vector — used to draw skid marks
  const slip = Math.hypot(car.vx - targetVx, car.vy - targetVy);
  car.skidAmt = Math.min(1, slip / 220);

  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

export function carSpeedKmh(car) {
  return Math.round(Math.abs(car.speed) * 0.09);
}
