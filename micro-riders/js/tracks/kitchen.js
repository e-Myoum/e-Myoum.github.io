// "Cuisine" circuit definition — content only; the turtle-path engine,
// closure math, and collision helpers all live in js/track.js. Deliberately
// built on a different shape grammar than the bedroom circuit (which is a
// rounded loop with three isolated, well-spaced corner features) rather than
// just a bigger version of the same recipe: a rotated-diamond silhouette
// with a 4-arc esses "snake" and a 3-arc tightening carousel spiral along
// its long edges, closing with a sharp hairpin hook. Since these are
// miniature RC cars, every obstacle/decor prop here is sized like something
// you'd find loose on a kitchen floor or countertop (bottle caps, a spoon,
// peas, a sponge), never a full-size appliance.
import { shortcutBlockerPositions } from '../track.js';

// Net heading change per feature: the opening sweep nets 50, the esses/snake
// nets 0 (-40/80/-80/40), the tightening carousel nets 40 (15/15/10 across
// shrinking radii), the closing hairpin hook nets 90 (130/-40) — total 180,
// so run twice this closes exactly (verified offline: closure error ~0,
// 0 self-intersections, min non-adjacent clearance ~470 vs the ~230 needed).
const HALF_MOVES = [
  { straight: 550 },
  { arc: { radius: 300, angle: 50 } },
  { straight: 350 },
  { arc: { radius: 170, angle: -40 } }, { straight: 70 },
  { arc: { radius: 170, angle: 80 } }, { straight: 70 },
  { arc: { radius: 170, angle: -80 } }, { straight: 70 },
  { arc: { radius: 170, angle: 40 } },
  { straight: 400 },
  { arc: { radius: 300, angle: 15 } }, { straight: 70 },
  { arc: { radius: 220, angle: 15 } }, { straight: 70 },
  { arc: { radius: 170, angle: 10 } },
  { straight: 450 },
  { arc: { radius: 170, angle: 130 } }, { straight: 50 },
  { arc: { radius: 170, angle: -40 } },
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
  // bottle-cap tower — juts in on the opening straight before the sweep.
  // Collider radius matches the drawn stack's actual reach (the tallest cap
  // is r=20 plus a few px of offset), not an arbitrarily bigger circle.
  { const p = track.offsetPoint(T * 0.045, track.halfWidth * 0.6); list.push({ type: 'capstack', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 26 }] }); }
  // spilled peas — small cluster on the straight before the esses, spaced
  // wide enough (surface gap > 2x car radius) that a car can thread between them
  {
    const p1 = track.offsetPoint(T * 0.122, -12), p2 = track.offsetPoint(T * 0.1313, 20), p3 = track.offsetPoint(T * 0.1406, -14);
    list.push({ type: 'peas', x: p2.x, y: p2.y, colliders: [{ x: p1.x, y: p1.y, r: 14 }, { x: p2.x, y: p2.y, r: 14 }, { x: p3.x, y: p3.y, r: 14 }] });
  }
  // wooden spoon, laid diagonally across the straight between the esses and
  // the carousel — a single capsule (not a chain of circles) so there's no
  // notch a car could wedge itself into between adjacent sub-colliders.
  // Radius/length sized to the drawn bowl+handle span, not padded beyond it.
  {
    const c = track.offsetPoint(T * 0.30, 0);
    const ang = c.heading + 0.55, halfLen = 65;
    const x1 = c.x - Math.cos(ang) * halfLen, y1 = c.y - Math.sin(ang) * halfLen;
    const x2 = c.x + Math.cos(ang) * halfLen, y2 = c.y + Math.sin(ang) * halfLen;
    list.push({ type: 'spoon', x: c.x, y: c.y, angle: ang, len: 170, colliders: [{ x1, y1, x2, y2, r: 17 }] });
  }
  // sponge on the straight between the carousel and the closing hook
  { const p = track.offsetPoint(T * 0.40, -track.halfWidth * 0.6); list.push({ type: 'sponge', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 46 }] }); }
  // second-half variety: another bottle-cap tower on the mirrored opening straight
  { const p = track.offsetPoint(T * 0.545, track.halfWidth * 0.6); list.push({ type: 'capstack', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 26 }] }); }
  // a matchbox sitting squarely on the straight-line shortcut across each
  // hook (both occurrences) — a capsule wrapping the drawn rectangle exactly
  // (half-width 65 / half-height ~37) instead of a much larger circle
  for (const p of shortcutBlockerPositions(track, HALF_MOVES, HOOK_MOVES)) {
    list.push({ type: 'matchbox', x: p.x, y: p.y, colliders: [{ x1: p.x - 26, y1: p.y, x2: p.x + 26, y2: p.y, r: 39 }] });
  }
  return list;
}

// non-collidable zones that modify a car's handling while it's inside them
// (see game.js#updateTrackState) rather than blocking it.
function buildSurfaces(track) {
  const T = track.total;
  const list = [];
  // spilled water right in the esses/snake — exactly where losing grip hurts most
  { const p = track.offsetPoint(T * 0.19, 0); list.push({ type: 'water', x: p.x, y: p.y, r: 68 }); }
  { const p = track.offsetPoint(0.5 * T + T * 0.19, 0); list.push({ type: 'water', x: p.x, y: p.y, r: 68 }); }
  // spilled syrup through the tightening carousel — sticky, saps speed
  { const p = track.offsetPoint(T * 0.35, track.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 60 }); }
  { const p = track.offsetPoint(T * 0.85, -track.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 60 }); }
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
