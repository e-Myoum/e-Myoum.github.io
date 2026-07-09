// The circuit is built by walking a sequence of straight/arc "turtle" moves —
// far more flexible than a fixed rounded-rectangle, and closure is free: any
// move sequence whose net heading change is exactly 180° closes into a full
// loop when run twice in a row (the second run is the point-symmetric mirror
// of the first, so the total displacement cancels automatically). That's the
// only constraint move lists below have to satisfy.
export const TRACK_WIDTH = 220;

const STEP_LINEAR = 20;
const STEP_ANGLE_DEG = 6;

// One half of the lap: a long straight into an S-chicane, another straight
// into a wide sweeping corner, a straight into a tight hook-shaped hairpin —
// net heading change is exactly 180° (30-60-30 chicane nets 0, the sweep
// nets 90, the hairpin's 135/-45 hook nets 90). Run twice, this closes into
// a self-intersection-free lap (verified offline) with a noticeably
// different feel corner to corner instead of a uniform oval.
const HALF_MOVES = [
  { straight: 420 },
  { arc: { radius: 190, angle: -30 } }, { straight: 70 }, { arc: { radius: 190, angle: 60 } }, { straight: 70 }, { arc: { radius: 190, angle: -30 } },
  { straight: 260 },
  { arc: { radius: 260, angle: 90 } },
  { straight: 240 },
  { arc: { radius: 160, angle: 135 } }, { straight: 40 }, { arc: { radius: 160, angle: -45 } },
];

function buildTurtlePath(moves) {
  let x = 0, y = 0, heading = 0;
  const pts = [{ x, y }];
  for (const m of moves) {
    if (m.straight != null) {
      const n = Math.max(1, Math.round(m.straight / STEP_LINEAR));
      const stepLen = m.straight / n;
      for (let i = 0; i < n; i++) { x += Math.cos(heading) * stepLen; y += Math.sin(heading) * stepLen; pts.push({ x, y }); }
    } else if (m.arc) {
      const angleRad = m.arc.angle * Math.PI / 180;
      const sign = angleRad >= 0 ? 1 : -1;
      const r = m.arc.radius;
      const cx = x + r * sign * Math.cos(heading + Math.PI / 2);
      const cy = y + r * sign * Math.sin(heading + Math.PI / 2);
      const n = Math.max(1, Math.ceil(Math.abs(m.arc.angle) / STEP_ANGLE_DEG));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const th = heading + angleRad * t;
        x = cx - r * sign * Math.cos(th + Math.PI / 2);
        y = cy - r * sign * Math.sin(th + Math.PI / 2);
        pts.push({ x, y });
      }
      heading += angleRad;
    }
  }
  return pts;
}

function buildCenterline() {
  const pts = buildTurtlePath(HALF_MOVES.concat(HALF_MOVES));
  // the walk closes back onto its own start point — drop the near-duplicate
  // last sample so the loop doesn't have a zero-length closing segment
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) < 1) pts.pop();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const margin = 220;
  const offX = margin - minX, offY = margin - minY;
  for (const p of pts) { p.x += offX; p.y += offY; }
  return { pts, worldW: maxX - minX + margin * 2, worldH: maxY - minY + margin * 2 };
}

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

export class Track {
  constructor() {
    const built = buildCenterline();
    this.points = built.pts;
    this.worldW = built.worldW;
    this.worldH = built.worldH;
    const n = this.points.length;
    this.s = new Array(n);
    this.s[0] = 0;
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + this._dist(i - 1, i);
    this.total = this.s[n - 1] + this._dist(n - 1, 0);
    this.halfWidth = TRACK_WIDTH / 2;
    this.center = { x: this.worldW / 2, y: this.worldH / 2 };
    this.obstacles = this._buildObstacles();
    this.decor = this._buildDecor();
    this.surfaces = this._buildSurfaces();
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

  // world position at a given arc-length + signed lateral offset from the centerline
  offsetPoint(dist, lateral) {
    const p = this.pointAt(dist);
    const nx = -Math.sin(p.heading), ny = Math.cos(p.heading);
    return { x: p.x + nx * lateral, y: p.y + ny * lateral, heading: p.heading };
  }

  // starting-grid slot (2x2), staggered behind the line, facing the track heading
  gridSlot(index) {
    const row = Math.floor(index / 2), lane = index % 2;
    return this.offsetPoint(-(60 + row * 78), lane === 0 ? -46 : 46);
  }

  _buildObstacles() {
    const T = this.total;
    const list = [];
    // block tower — juts in from one edge of the second straight (post-chicane)
    { const p = this.offsetPoint(T * 0.226, this.halfWidth * 0.62); list.push({ type: 'blocks', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 46 }] }); }
    // book stack — juts in from the outer edge near the wide sweeping corner
    { const p = this.offsetPoint(T * 0.30, -this.halfWidth * 0.6); list.push({ type: 'books', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 42 }] }); }
    // spilled marbles — small cluster before the hairpin, spaced wide enough
    // (surface gap > 2x car radius) that a car can thread between them
    {
      const p1 = this.offsetPoint(T * 0.36, -12), p2 = this.offsetPoint(T * 0.372, 22), p3 = this.offsetPoint(T * 0.385, -18);
      list.push({ type: 'marbles', x: p2.x, y: p2.y, colliders: [{ x: p1.x, y: p1.y, r: 15 }, { x: p2.x, y: p2.y, r: 15 }, { x: p3.x, y: p3.y, r: 15 }] });
    }
    // pencil, laid diagonally across the straight after the hairpin — a single
    // capsule (not a chain of circles) so there's no notch a car could wedge
    // itself into between adjacent sub-colliders
    {
      const c = this.offsetPoint(T * 0.56, 0);
      const ang = c.heading + 0.6, halfLen = 63;
      const x1 = c.x - Math.cos(ang) * halfLen, y1 = c.y - Math.sin(ang) * halfLen;
      const x2 = c.x + Math.cos(ang) * halfLen, y2 = c.y + Math.sin(ang) * halfLen;
      list.push({ type: 'pencil', x: c.x, y: c.y, angle: ang, len: 150, colliders: [{ x1, y1, x2, y2, r: 13 }] });
    }
    // second-half variety: another block tower and book stack, offset to the
    // opposite side of the track from their first-half counterparts
    { const p = this.offsetPoint(T * 0.726, -this.halfWidth * 0.6); list.push({ type: 'blocks', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 46 }] }); }
    { const p = this.offsetPoint(T * 0.83, this.halfWidth * 0.6); list.push({ type: 'books', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 42 }] }); }
    return list;
  }

  // non-collidable zones that modify a car's handling while it's inside them
  // (see game.js#applySurfaces) rather than blocking it — the slick/sticky
  // spots the difficulty comes from, not solid geometry.
  _buildSurfaces() {
    const T = this.total;
    const list = [];
    // soap/oil slicks right in the two chicanes — exactly where losing grip hurts most
    { const p = this.offsetPoint(T * 0.143, 0); list.push({ type: 'oil', x: p.x, y: p.y, r: 70 }); }
    { const p = this.offsetPoint(0.5 * T + T * 0.143, 0); list.push({ type: 'oil', x: p.x, y: p.y, r: 70 }); }
    // honey patches on the straights after the wide corners — sticky, saps speed
    { const p = this.offsetPoint(T * 0.363, this.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 62 }); }
    { const p = this.offsetPoint(T * 0.879, -this.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 62 }); }
    return list;
  }

  _buildDecor() {
    const w = this.worldW, h = this.worldH;
    return [
      { type: 'bed', x: w * 0.5, y: h * 0.46, scale: 1 },
      { type: 'toybox', x: w * 0.08, y: h * 0.85, scale: 1 },
      { type: 'lamp', x: w * 0.93, y: h * 0.1, scale: 1 },
      { type: 'rugpatch', x: w * 0.1, y: h * 0.12, scale: 1.1 },
      { type: 'ball', x: w * 0.92, y: h * 0.88, scale: 1 },
      { type: 'blockspair', x: w * 0.3, y: h * 0.9, scale: 1 },
      { type: 'sock', x: w * 0.7, y: h * 0.08, scale: 1 },
      { type: 'marble', x: w * 0.03, y: h * 0.5, scale: 1 },
    ];
  }
}
