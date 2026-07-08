// The circuit is a rounded-rectangle "stadium" loop (two straights, two long
// straights, four quarter-circle corners) — smooth, self-intersection-free,
// and cheap to reason about for both wall collision and AI lookahead. The
// "chambre d'enfant" theming comes entirely from obstacles/decor placed on
// top of that geometry, not from deforming the racing line itself: a couple
// of toys jut in from the track edges to force weaving, while everything
// else is pure set-dressing scattered around the loop.
export const STADIUM = { a: 850, b: 550, R: 260, margin: 220 };
export const TRACK_WIDTH = 300;

const STEP_LINEAR = 20;
const STEP_ANGLE_DEG = 6;

// Reduces either collider shape to "the nearest point on it, plus its radius"
// so every consumer (physics, AI band projection) can treat a circle and a
// capsule identically. A capsule is defined by its two end centers + radius;
// using one continuous capsule (rather than a chain of small circles) for an
// elongated prop matters because adjacent circles spaced closer than 2×
// car-radius apart leave a gap the car can geometrically never fit through —
// it just gets wedged in the notch between them, pushed back and forth
// forever. A capsule has no such notch.
export function closestOnCollider(px, py, c) {
  if (c.x1 !== undefined) {
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - c.x1) * dx + (py - c.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return { x: c.x1 + dx * t, y: c.y1 + dy * t, r: c.r };
  }
  return { x: c.x, y: c.y, r: c.r };
}

// sample points describing a collider's extent, used only for projecting an
// obstacle's arc-length/lateral "band" once at track-build time
function colliderSamples(c) {
  return c.x1 !== undefined ? [{ x: c.x1, y: c.y1, r: c.r }, { x: c.x2, y: c.y2, r: c.r }] : [{ x: c.x, y: c.y, r: c.r }];
}

function buildCenterline() {
  const { a, b, R } = STADIUM;
  const pts = [];
  const push = (x, y) => pts.push({ x, y });

  for (let x = -(a - R); x < a - R; x += STEP_LINEAR) push(x, -b);                    // top straight, L->R
  for (let d = -90; d < 0; d += STEP_ANGLE_DEG) { const r = d * Math.PI / 180; push(a - R + R * Math.cos(r), -(b - R) + R * Math.sin(r)); } // TR corner
  for (let y = -(b - R); y < b - R; y += STEP_LINEAR) push(a, y);                     // right straight, T->B
  for (let d = 0; d < 90; d += STEP_ANGLE_DEG) { const r = d * Math.PI / 180; push(a - R + R * Math.cos(r), b - R + R * Math.sin(r)); }  // BR corner
  for (let x = a - R; x > -(a - R); x -= STEP_LINEAR) push(x, b);                     // bottom straight, R->L
  for (let d = 90; d < 180; d += STEP_ANGLE_DEG) { const r = d * Math.PI / 180; push(-(a - R) + R * Math.cos(r), b - R + R * Math.sin(r)); } // BL corner
  for (let y = b - R; y > -(b - R); y -= STEP_LINEAR) push(-a, y);                    // left straight, B->T
  for (let d = 180; d < 270; d += STEP_ANGLE_DEG) { const r = d * Math.PI / 180; push(-(a - R) + R * Math.cos(r), -(b - R) + R * Math.sin(r)); } // TL corner

  const offX = a + STADIUM.margin, offY = b + STADIUM.margin;
  for (const p of pts) { p.x += offX; p.y += offY; }
  return pts;
}

export class Track {
  constructor() {
    this.points = buildCenterline();
    const n = this.points.length;
    this.s = new Array(n);
    this.s[0] = 0;
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + this._dist(i - 1, i);
    this.total = this.s[n - 1] + this._distWrap(n - 1, 0);
    this.halfWidth = TRACK_WIDTH / 2;
    this.worldW = 2 * STADIUM.a + 2 * STADIUM.margin;
    this.worldH = 2 * STADIUM.b + 2 * STADIUM.margin;
    this.center = { x: this.worldW / 2, y: this.worldH / 2 };
    this.obstacles = this._buildObstacles();
    this.decor = this._buildDecor();
    // per-obstacle lateral "band" (min/max lateral reach across all its
    // colliders, plus its arc-length position), pre-projected once up front.
    // The AI treats each obstacle as one blocked band rather than reasoning
    // about individual sub-colliders — a multi-collider prop like the pencil
    // has sub-circles only ~10 arc-length units apart, so picking "nearest
    // collider" per frame would flip between them and never commit to a side.
    this.obstacleBands = this.obstacles.map(obs => {
      let sMin = Infinity, latMin = Infinity, latMax = -Infinity;
      for (const c of obs.colliders) {
        for (const p of colliderSamples(c)) {
          const cp = this.closestPoint(p.x, p.y);
          sMin = Math.min(sMin, cp.distAlong);
          latMin = Math.min(latMin, cp.lateral - p.r);
          latMax = Math.max(latMax, cp.lateral + p.r);
        }
      }
      return { s: sMin, latMin, latMax };
    });
  }

  _dist(i, j) { const a = this.points[i], b = this.points[j]; return Math.hypot(b.x - a.x, b.y - a.y); }
  _distWrap(i, j) { return this._dist(i, j); }

  // nearest point on the centerline to (x,y): returns arc-length position,
  // signed lateral offset (+ = one side, - = the other, consistent all the
  // way around since the loop is single-winding), and local heading.
  closestPoint(x, y) {
    const pts = this.points, n = pts.length;
    let best = Infinity, bestS = 0, bestLat = 0, bestHeading = 0;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const segLen = Math.hypot(dx, dy) || 1;
      const ux = dx / segLen, uy = dy / segLen;
      let t = ((x - p0.x) * ux + (y - p0.y) * uy) / segLen;
      t = Math.max(0, Math.min(1, t));
      const px = p0.x + dx * t, py = p0.y + dy * t;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < best) {
        best = d2;
        const nx = -uy, ny = ux;
        bestLat = (x - px) * nx + (y - py) * ny;
        bestS = this.s[i] + segLen * t;
        bestHeading = Math.atan2(dy, dx);
      }
    }
    return { distAlong: bestS, lateral: bestLat, heading: bestHeading, dist: Math.sqrt(best) };
  }

  // world position + heading at a given arc-length distance (wraps around the loop)
  pointAt(dist) {
    const total = this.total, pts = this.points, n = pts.length;
    let d = dist % total; if (d < 0) d += total;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.s[mid] <= d) lo = mid; else hi = mid - 1; }
    const i = lo, p0 = pts[i], p1 = pts[(i + 1) % n];
    const segLen = this._dist(i, (i + 1) % n) || 1;
    const t = (d - this.s[i]) / segLen;
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    return { x: p0.x + dx * t, y: p0.y + dy * t, heading: Math.atan2(dy, dx) };
  }

  // starting-grid slot (2x2), staggered behind the line, facing the track heading
  gridSlot(index) {
    const row = Math.floor(index / 2), lane = index % 2;
    const dist = -(60 + row * 78);
    const base = this.pointAt(dist);
    const nx = -Math.sin(base.heading), ny = Math.cos(base.heading);
    const lateral = lane === 0 ? -62 : 62;
    return { x: base.x + nx * lateral, y: base.y + ny * lateral, heading: base.heading };
  }

  // pushes (x,y) back inside the drivable band if it strayed past either edge;
  // returns null when no correction was needed.
  wallCorrection(x, y, radius) {
    const cp = this.closestPoint(x, y);
    const limit = this.halfWidth - radius;
    if (cp.lateral > limit) {
      const over = cp.lateral - limit;
      const nx = -Math.sin(cp.heading), ny = Math.cos(cp.heading);
      return { x: x - nx * over, y: y - ny * over, nx: -nx, ny: -ny };
    }
    if (cp.lateral < -limit) {
      const over = -limit - cp.lateral;
      const nx = -Math.sin(cp.heading), ny = Math.cos(cp.heading);
      return { x: x + nx * over, y: y + ny * over, nx, ny };
    }
    return null;
  }

  _buildObstacles() {
    const { a, b, R, margin } = STADIUM;
    const offX = a + margin, offY = b + margin;
    const list = [];
    // block tower — juts in from the inner edge of the right straight
    list.push({ type: 'blocks', x: offX + a - 62, y: offY, colliders: [{ x: offX + a - 62, y: offY, r: 68 }] });
    // book stack — juts in from the outer edge of the bottom straight
    list.push({ type: 'books', x: offX, y: offY + b + 70, colliders: [{ x: offX, y: offY + b + 70, r: 62 }] });
    // spilled marbles — small cluster near the end of the top straight, spaced
    // wide enough apart (surface-to-surface gap > 2x car radius) that a car
    // can actually thread between individual marbles instead of just bouncing
    // off the cluster as a whole
    list.push({
      type: 'marbles',
      x: offX + a - 590 + 150, y: offY - b,
      colliders: [
        { x: offX + a - 590 + 90, y: offY - b - 10, r: 15 },
        { x: offX + a - 590 + 160, y: offY - b + 14, r: 15 },
        { x: offX + a - 590 + 228, y: offY - b - 12, r: 15 },
      ],
    });
    // pencil, laid diagonally across part of the left straight — a single
    // capsule (not a chain of circles) so there's no notch a car could wedge
    // itself into between adjacent sub-colliders
    {
      const cx = offX - a, cy = offY, ang = 0.62, len = 150, halfLen = len * 0.42;
      const x1 = cx - Math.cos(ang) * halfLen, y1 = cy - Math.sin(ang) * halfLen;
      const x2 = cx + Math.cos(ang) * halfLen, y2 = cy + Math.sin(ang) * halfLen;
      list.push({ type: 'pencil', x: cx, y: cy, angle: ang, len, colliders: [{ x1, y1, x2, y2, r: 13 }] });
    }
    return list;
  }

  _buildDecor() {
    const { a, b, margin } = STADIUM;
    const offX = a + margin, offY = b + margin;
    return [
      { type: 'bed', x: offX, y: offY, scale: 1 },
      { type: 'toybox', x: offX - a - margin * 0.55, y: offY + b + margin * 0.4, scale: 1 },
      { type: 'lamp', x: offX + a + margin * 0.6, y: offY - b - margin * 0.45, scale: 1 },
      { type: 'rugpatch', x: offX - a - margin * 0.4, y: offY - b - margin * 0.3, scale: 1.1 },
      { type: 'ball', x: offX + a + margin * 0.55, y: offY + b + margin * 0.35, scale: 1 },
      { type: 'blockspair', x: offX - a * 0.35, y: offY + b + margin * 0.55, scale: 1 },
      { type: 'sock', x: offX + a * 0.4, y: offY - b - margin * 0.4, scale: 1 },
      { type: 'marble', x: offX - a + margin * 0.2, y: offY - b * 0.15, scale: 1 },
    ];
  }
}
