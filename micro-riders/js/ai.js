import { TUNING, DIFFICULTIES } from './config.js';

function normAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

// Bot "driver": pure-pursuit toward a lookahead point on the centerline
// (offset sideways by the bot's fixed racing-line bias), with speed trimmed
// down ahead of corners. Steering gets a slow, bounded wandering noise term
// (an AR(1) process, not raw per-frame jitter) so lower difficulties look
// imperfect without ever spiraling into an unbounded drift.
const AVOID_WINDOW = 260;

// Finds the nearest obstacle *band* on the bot's stretch of track ahead
// (within AVOID_WINDOW arc-length) and, if one is found, the lateral offset
// the bot should steer toward to clear it — picking whichever side of the
// band leaves it more room within the track. Bands (not individual
// sub-colliders) are what get compared: a multi-collider prop like the
// pencil has sub-circles only ~10 arc-length units apart, so picking the
// nearest collider per frame would flip between them and never commit to a
// side — and without any avoidance at all, a bot whose fixed racing-line
// bias happens to point straight at a static prop has no way to ever divert
// and stalls against it indefinitely.
function findAvoidance(track, cp, lateralMax) {
  let best = null, bestDs = Infinity;
  for (const band of track.obstacleBands) {
    // entirely outside the drivable band (e.g. the hairpin shortcut blockers,
    // deliberately placed off-track) — a bot driving normally never reaches
    // it, so it shouldn't trigger evasive steering just for passing nearby
    if (band.latMin > lateralMax || band.latMax < -lateralMax) continue;
    let ds = band.s - cp.distAlong; if (ds < 0) ds += track.total;
    if (ds < AVOID_WINDOW && ds < bestDs) { bestDs = ds; best = band; }
  }
  if (!best) return null;
  const clear = TUNING.carRadius + 26;
  const latMin = best.latMin - clear, latMax = best.latMax + clear;
  const roomLeft = latMin - (-lateralMax);   // space between the band and the inner edge
  const roomRight = lateralMax - latMax;     // space between the band and the outer edge
  let desiredLat = roomRight >= roomLeft ? latMax : latMin;
  desiredLat = Math.max(-lateralMax, Math.min(lateralMax, desiredLat));
  return { lateral: desiredLat, urgency: 1 - bestDs / AVOID_WINDOW };
}

export function botInput(car, track, carModel, diffKey, bias, dt) {
  const diff = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
  const jitter = car._skillJitter || 1;
  const cp = track.closestPoint(car.x, car.y);
  const lookahead = 150 + Math.abs(car.speed) * 0.32;
  const lateralMax = track.halfWidth - TUNING.carRadius - 24;

  // slow bounded wander on top of the race's randomly-assigned base bias (see
  // Game#buildCars) — keeps a bot from driving the exact same line lap after
  // lap or race after race. An AR(1) walk, not free-running noise, so it
  // drifts but never runs away.
  car._biasWalk = (car._biasWalk || 0) * 0.985 + (Math.random() - 0.5) * 0.02 * diff.lineSpread;
  car._biasWalk = Math.max(-0.4, Math.min(0.4, car._biasWalk));
  const effBias = Math.max(-1, Math.min(1, bias + car._biasWalk));

  const avoid = findAvoidance(track, cp, lateralMax);
  const baseLat = effBias * lateralMax;
  const targetLat = avoid ? baseLat + (avoid.lateral - baseLat) * avoid.urgency : baseLat;

  const p1 = track.pointAt(cp.distAlong + lookahead);
  const nx1 = -Math.sin(p1.heading), ny1 = Math.cos(p1.heading);
  const targetX = p1.x + nx1 * targetLat;
  const targetY = p1.y + ny1 * targetLat;

  const desiredHeading = Math.atan2(targetY - car.y, targetX - car.x);
  const diffAngle = normAngle(desiredHeading - car.heading);

  car._aiNoise = (car._aiNoise || 0) * 0.9 + (Math.random() - 0.5) * diff.steerNoise * 1.4;
  const steer = Math.max(-1, Math.min(1, diffAngle * diff.steerGain * jitter + car._aiNoise));

  // corner-speed trim: compare heading further out to gauge curvature ahead
  const p2 = track.pointAt(cp.distAlong + lookahead + 220);
  const curve = Math.abs(normAngle(p2.heading - p1.heading));
  const speedFrac = 1 - Math.min(1, curve / 1.1) * diff.cornerAggro;
  const targetSpeed = TUNING.maxSpeed * carModel.maxSpeedMul * diff.speedMul * jitter * speedFrac;

  let gas = false, brake = false;
  if (car.speed < targetSpeed * 0.96) gas = true;
  else if (car.speed > targetSpeed * 1.04) { if (Math.random() < diff.brakeSkill) brake = true; }

  return { steer, gas, brake };
}
