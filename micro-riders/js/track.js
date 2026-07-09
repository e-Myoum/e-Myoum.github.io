// The circuit engine: any track is built by walking a sequence of
// straight/arc "turtle" moves — far more flexible than a fixed
// rounded-rectangle, and closure is free: any move sequence whose net
// heading change is exactly 180° closes into a full loop when run twice in
// a row (the second run is the point-symmetric mirror of the first, so the
// total displacement cancels automatically). That's the only constraint a
// track's `halfMoves` has to satisfy. Actual track content (the move list,
// obstacles/decor/hazards, floor theme) lives in js/tracks/*.js — this file
// is the theme-agnostic engine those definitions run on.
import { TRACK_DEFS } from './tracks/index.js';

const STEP_LINEAR = 20;
const STEP_ANGLE_DEG = 6;

export function moveLength(m) { return m.straight != null ? m.straight : Math.abs(m.arc.angle) * Math.PI / 180 * m.arc.radius; }

export function buildTurtlePath(moves) {
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

function buildCenterline(halfMoves) {
  const pts = buildTurtlePath(halfMoves.concat(halfMoves));
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

// Finds the local-frame (entry heading = 0, entry position = origin)
// midpoint of the straight-line "beeline" across a sharp feature — the
// point a car cutting straight through its inside instead of following the
// curve would pass closest to — and returns its world position for both
// occurrences of a track's half. A sharp hairpin-style hook's chord is
// meaningfully shorter than its arc, so without something solid actually in
// the way there, a car that ignores the curve entirely is *faster* even
// after the off-track speed penalty. `hookMoves` must be a contiguous
// trailing slice of `halfMoves` (i.e. the last N entries) — see each
// track's own `halfMoves` for where its hook sits.
export function shortcutBlockerPositions(track, halfMoves, hookMoves) {
  const hookStartS = halfMoves.slice(0, halfMoves.length - hookMoves.length).reduce((s, m) => s + moveLength(m), 0);
  const halfLen = halfMoves.reduce((s, m) => s + moveLength(m), 0);
  const pts = buildTurtlePath(hookMoves);
  const p0 = pts[0], p1 = pts[pts.length - 1];
  const localMid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const positions = [];
  for (let k = 0; k < 2; k++) {
    const sStart = k * halfLen + hookStartS;
    const entry = track.pointAt(sStart);
    const H = entry.heading;
    positions.push({
      x: entry.x + localMid.x * Math.cos(H) - localMid.y * Math.sin(H),
      y: entry.y + localMid.x * Math.sin(H) + localMid.y * Math.cos(H),
    });
  }
  return positions;
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

export { TRACK_DEFS };

export class Track {
  constructor(trackId) {
    const def = TRACK_DEFS[trackId] || TRACK_DEFS[Object.keys(TRACK_DEFS)[0]];
    this.id = def.id;
    this.label = def.label;
    this.tagline = def.tagline;
    this.floorTheme = def.floorTheme;
    const built = buildCenterline(def.halfMoves);
    this.points = built.pts;
    this.worldW = built.worldW;
    this.worldH = built.worldH;
    const n = this.points.length;
    this.s = new Array(n);
    this.s[0] = 0;
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + this._dist(i - 1, i);
    this.total = this.s[n - 1] + this._dist(n - 1, 0);
    this.halfWidth = def.trackWidth / 2;
    this.center = { x: this.worldW / 2, y: this.worldH / 2 };
    this.obstacles = def.buildObstacles(this);
    this.decor = def.buildDecor(this);
    this.surfaces = def.buildSurfaces(this);
    // per-obstacle lateral "band" (min/max lateral reach across all its
    // colliders, plus its arc-length position), pre-projected once up front.
    // The AI treats each obstacle as one blocked band rather than reasoning
    // about individual sub-colliders — a multi-collider prop like a diagonal
    // capsule obstacle has sub-samples only ~10 arc-length units apart, so
    // picking "nearest collider" per frame would flip between them and
    // never commit to a side.
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
    // same idea, but for oil/water slicks — only difficulty-gated "hazard
    // aware" bots (see ai.js) route around these when convenient, since
    // unlike obstacles they're not something everyone has to dodge
    this.hazardBands = this.surfaces.filter(s => s.type === 'oil' || s.type === 'water').map(surf => {
      const cp = this.closestPoint(surf.x, surf.y);
      return { s: cp.distAlong, latMin: cp.lateral - surf.r, latMax: cp.lateral + surf.r };
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
}
