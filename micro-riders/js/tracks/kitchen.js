// "Cuisine" circuit definition — content only; the turtle-path engine,
// closure math, and collision helpers all live in js/track.js. Longer and
// more varied than the bedroom circuit (two gentle chicane-style wiggles, a
// wide corner, and a sharp hook), and — since these are miniature RC cars —
// every obstacle/decor prop here is sized like something you'd find loose on
// a kitchen floor or countertop (bottle caps, a spoon, peas, a sponge), never
// a full-size appliance.
import { shortcutBlockerPositions } from '../track.js';

// Net heading change per feature: chicane A nets 0 (-25/50/-25), the corner
// nets 100, the S-bend nets 0 (-40/40), the hook nets 80 (140/-60) — total
// 180, so run twice this closes exactly (verified offline, 0 self-intersections).
const HALF_MOVES = [
  { straight: 500 },
  { arc: { radius: 220, angle: -25 } }, { straight: 70 }, { arc: { radius: 220, angle: 50 } }, { straight: 70 }, { arc: { radius: 220, angle: -25 } },
  { straight: 300 },
  { arc: { radius: 300, angle: 100 } },
  { straight: 260 },
  { arc: { radius: 200, angle: -40 } }, { straight: 90 }, { arc: { radius: 200, angle: 40 } },
  { straight: 500 },
  { arc: { radius: 190, angle: 140 } }, { straight: 50 }, { arc: { radius: 190, angle: -60 } },
];
// The hook (last 3 moves above) is the one feature sharp enough that a
// straight-line "beeline" through its inside saves real distance versus
// following the curve — physically blocked with a "matchbox" obstacle
// rather than just discouraged, same technique as the bedroom circuit's
// hairpin blocker.
const HOOK_MOVES = HALF_MOVES.slice(-3);

function buildObstacles(track) {
  const T = track.total;
  const list = [];
  // bottle-cap tower — juts in from one edge of the straight before the wide corner
  { const p = track.offsetPoint(T * 0.16, track.halfWidth * 0.6); list.push({ type: 'capstack', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 44 }] }); }
  // spilled peas — small cluster on the straight after the corner, spaced
  // wide enough (surface gap > 2x car radius) that a car can thread between them
  {
    const p1 = track.offsetPoint(T * 0.258, -12), p2 = track.offsetPoint(T * 0.267, 20), p3 = track.offsetPoint(T * 0.276, -14);
    list.push({ type: 'peas', x: p2.x, y: p2.y, colliders: [{ x: p1.x, y: p1.y, r: 14 }, { x: p2.x, y: p2.y, r: 14 }, { x: p3.x, y: p3.y, r: 14 }] });
  }
  // wooden spoon, laid diagonally across the straight before the hook — a
  // single capsule (not a chain of circles) so there's no notch a car could
  // wedge itself into between adjacent sub-colliders
  {
    const c = track.offsetPoint(T * 0.37, 0);
    const ang = c.heading + 0.55, halfLen = 82;
    const x1 = c.x - Math.cos(ang) * halfLen, y1 = c.y - Math.sin(ang) * halfLen;
    const x2 = c.x + Math.cos(ang) * halfLen, y2 = c.y + Math.sin(ang) * halfLen;
    list.push({ type: 'spoon', x: c.x, y: c.y, angle: ang, len: 170, colliders: [{ x1, y1, x2, y2, r: 14 }] });
  }
  // second-half variety: a sponge and another bottle-cap tower, offset to
  // the opposite side of the track from their first-half counterparts
  { const p = track.offsetPoint(T * 0.66, -track.halfWidth * 0.6); list.push({ type: 'sponge', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 42 }] }); }
  { const p = track.offsetPoint(T * 0.765, track.halfWidth * 0.6); list.push({ type: 'capstack', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 44 }] }); }
  // a matchbox sitting squarely on the straight-line shortcut across each
  // hook (both occurrences) — physically blocks the cut instead of just discouraging it
  for (const p of shortcutBlockerPositions(track, HALF_MOVES, HOOK_MOVES)) {
    list.push({ type: 'matchbox', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 90 }] });
  }
  return list;
}

// non-collidable zones that modify a car's handling while it's inside them
// (see game.js#updateTrackState) rather than blocking it.
function buildSurfaces(track) {
  const T = track.total;
  const list = [];
  // spilled water right in the two chicane-style wiggles — exactly where losing grip hurts most
  { const p = track.offsetPoint(T * 0.10, 0); list.push({ type: 'water', x: p.x, y: p.y, r: 68 }); }
  { const p = track.offsetPoint(0.5 * T + T * 0.10, 0); list.push({ type: 'water', x: p.x, y: p.y, r: 68 }); }
  // spilled syrup on the S-bends — sticky, saps speed
  { const p = track.offsetPoint(T * 0.30, track.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 60 }); }
  { const p = track.offsetPoint(T * 0.80, -track.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 60 }); }
  return list;
}

function buildDecor(track) {
  const w = track.worldW, h = track.worldH;
  return [
    { type: 'placemat', x: w * 0.5, y: h * 0.46, scale: 1 },
    { type: 'fruitbowl', x: w * 0.08, y: h * 0.85, scale: 1 },
    { type: 'mugsteam', x: w * 0.93, y: h * 0.1, scale: 1 },
    { type: 'floormat', x: w * 0.1, y: h * 0.12, scale: 1.1 },
    { type: 'apple', x: w * 0.92, y: h * 0.88, scale: 1 },
    { type: 'cappair', x: w * 0.3, y: h * 0.9, scale: 1 },
    { type: 'napkin', x: w * 0.7, y: h * 0.08, scale: 1 },
    { type: 'olive', x: w * 0.03, y: h * 0.5, scale: 1 },
  ];
}

export const kitchen = {
  id: 'kitchen',
  label: 'CUISINE',
  tagline: 'Circuit plus long, sol carrelé et pièges collants.',
  trackWidth: 220,
  floorTheme: 'tile',
  halfMoves: HALF_MOVES,
  buildObstacles,
  buildDecor,
  buildSurfaces,
};
