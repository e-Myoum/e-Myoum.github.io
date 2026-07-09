// "Chambre d'enfant" circuit definition — content only; the turtle-path
// engine, closure math, and collision helpers all live in js/track.js.
import { shortcutBlockerPositions } from '../track.js';

// A long straight into an S-chicane, another straight into a wide sweeping
// corner, a straight into a tight hook-shaped hairpin — net heading change
// is exactly 180° (30-60-30 chicane nets 0, the sweep nets 90, the hairpin's
// 135/-45 hook nets 90). Run twice, this closes into a self-intersection-free
// lap (verified offline) with a noticeably different feel corner to corner
// instead of a uniform oval. Scaled up ~1.4x from the original draft — a
// uniform scale changes no angles, so closure is still exact — both to make
// the lap longer and so cutting a corner saves less distance in proportion
// to the whole lap.
const SCALE = 1.4;
const HALF_MOVES = [
  { straight: 420 * SCALE },
  { arc: { radius: 190 * SCALE, angle: -30 } }, { straight: 70 * SCALE }, { arc: { radius: 190 * SCALE, angle: 60 } }, { straight: 70 * SCALE }, { arc: { radius: 190 * SCALE, angle: -30 } },
  { straight: 260 * SCALE },
  { arc: { radius: 260 * SCALE, angle: 90 } },
  { straight: 240 * SCALE },
  { arc: { radius: 160 * SCALE, angle: 135 } }, { straight: 40 * SCALE }, { arc: { radius: 160 * SCALE, angle: -45 } },
];
// The hairpin (last 3 moves above) is the one feature sharp enough that a
// straight-line "beeline" through its inside saves real distance versus
// following the curve — physically blocked with a "bigblock" obstacle
// rather than just discouraged, see shortcutBlockerPositions() below.
const HOOK_MOVES = HALF_MOVES.slice(-3);

function buildObstacles(track) {
  const T = track.total;
  const list = [];
  // block tower — juts in from one edge of the second straight (post-chicane)
  { const p = track.offsetPoint(T * 0.226, track.halfWidth * 0.62); list.push({ type: 'blocks', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 46 }] }); }
  // book stack — juts in from the outer edge near the wide sweeping corner
  { const p = track.offsetPoint(T * 0.30, -track.halfWidth * 0.6); list.push({ type: 'books', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 44 }] }); }
  // spilled marbles — small cluster before the hairpin, spaced wide enough
  // (surface gap > 2x car radius) that a car can thread between them
  {
    const p1 = track.offsetPoint(T * 0.36, -12), p2 = track.offsetPoint(T * 0.372, 22), p3 = track.offsetPoint(T * 0.385, -18);
    list.push({ type: 'marbles', x: p2.x, y: p2.y, colliders: [{ x: p1.x, y: p1.y, r: 15 }, { x: p2.x, y: p2.y, r: 15 }, { x: p3.x, y: p3.y, r: 15 }] });
  }
  // pencil, laid diagonally across the straight after the hairpin — a single
  // capsule (not a chain of circles) so there's no notch a car could wedge
  // itself into between adjacent sub-colliders
  {
    const c = track.offsetPoint(T * 0.56, 0);
    const ang = c.heading + 0.6, halfLen = 76;
    const x1 = c.x - Math.cos(ang) * halfLen, y1 = c.y - Math.sin(ang) * halfLen;
    const x2 = c.x + Math.cos(ang) * halfLen, y2 = c.y + Math.sin(ang) * halfLen;
    list.push({ type: 'pencil', x: c.x, y: c.y, angle: ang, len: 150, colliders: [{ x1, y1, x2, y2, r: 13 }] });
  }
  // second-half variety: another block tower and book stack, offset to the
  // opposite side of the track from their first-half counterparts
  { const p = track.offsetPoint(T * 0.726, -track.halfWidth * 0.6); list.push({ type: 'blocks', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 46 }] }); }
  { const p = track.offsetPoint(T * 0.83, track.halfWidth * 0.6); list.push({ type: 'books', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 44 }] }); }
  // a big toy chest sitting squarely on the straight-line shortcut across
  // each hairpin (both occurrences) — physically blocks the cut instead of
  // just discouraging it
  for (const p of shortcutBlockerPositions(track, HALF_MOVES, HOOK_MOVES)) {
    list.push({ type: 'bigblock', x: p.x, y: p.y, colliders: [{ x: p.x, y: p.y, r: 95 }] });
  }
  return list;
}

// non-collidable zones that modify a car's handling while it's inside them
// (see game.js#updateTrackState) rather than blocking it — the slick/sticky
// spots the difficulty comes from, not solid geometry.
function buildSurfaces(track) {
  const T = track.total;
  const list = [];
  // soap/oil slicks right in the two chicanes — exactly where losing grip hurts most
  { const p = track.offsetPoint(T * 0.143, 0); list.push({ type: 'oil', x: p.x, y: p.y, r: 70 }); }
  { const p = track.offsetPoint(0.5 * T + T * 0.143, 0); list.push({ type: 'oil', x: p.x, y: p.y, r: 70 }); }
  // honey patches on the straights after the wide corners — sticky, saps speed
  { const p = track.offsetPoint(T * 0.363, track.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 62 }); }
  { const p = track.offsetPoint(T * 0.879, -track.halfWidth * 0.4); list.push({ type: 'honey', x: p.x, y: p.y, r: 62 }); }
  return list;
}

function buildDecor(track) {
  const w = track.worldW, h = track.worldH;
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

export const bedroom = {
  id: 'bedroom',
  label: "CHAMBRE D'ENFANT",
  tagline: 'Un tour de chambre, chicane et virage en épingle.',
  trackWidth: 220,
  floorTheme: 'wood',
  halfMoves: HALF_MOVES,
  buildObstacles,
  buildDecor,
  buildSurfaces,
};
