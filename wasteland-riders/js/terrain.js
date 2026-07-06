// Procedural, seeded level terrain: a rolling dune base plus two hand-designed
// feature types layered on top — "jump" (a tall gaussian kicker to launch off)
// and "whoops" (a run of small sharp bumps that punish full throttle) — with
// scattered decor (rocks/wrecks/cacti/crows) kept clear of the features.
// The same seed always regenerates the exact same level.
export class Terrain {
  constructor(seed, cfg, diffMul, finishX) {
    this.seed = seed;
    this.cfg = cfg;
    this.diffMul = diffMul;
    this.finishX = finishX;
    this.features = [];
    this.hazards = [];
    this.decor = [];
    this._genFeaturesAndDecor();
  }

  // deterministic PRNG (mulberry32), seeded independently per generation pass
  // so features and decor don't perturb each other when tuned separately
  mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  h1(i) { const s = Math.sin(i * 127.1 + this.seed * 311.7) * 43758.5453; return s - Math.floor(s); }
  noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return this.h1(i) * (1 - u) + this.h1(i + 1) * u; }

  _genFeaturesAndDecor() {
    const c = this.cfg, dm = this.diffMul;
    // designed features first: jump kickers (big air) + whoops sections (technical control)
    const rng2 = this.mulberry(Math.floor(this.seed * 3.7) + 91);
    let fx = c.startFlat + 500;
    while (fx < this.finishX - 700) {
      const r = rng2();
      if (r < 0.58) {
        // launch hill: tall gaussian kicker — crest it at speed to fly
        const amp = (125 + rng2() * 130) * (0.75 + 0.25 * dm);
        const w = 290 + rng2() * 150;
        this.features.push({ type: 'jump', x: fx + w, amp, w });
        fx += w * 2 + 260 + rng2() * 320;
      } else if (r < 0.82) {
        // whoops: run of small sharp bumps — full throttle here gets punished
        const len = 280 + rng2() * 320;
        const lam = 145 + rng2() * 70;
        const amp = (11 + rng2() * 9) * dm;
        this.features.push({ type: 'whoops', x: fx, len, lam, amp });
        fx += len + 340 + rng2() * 380;
      } else {
        fx += 400 + rng2() * 460;  // breather gap
      }
    }
    // decor: sparse and coherent — obstacles kept off the jumps, crows perch near scarecrows
    const rng = this.mulberry(Math.floor(this.seed * 7.3));
    const nearFeature = (x) => this.features.some(f => f.type === 'jump' ? Math.abs(x - f.x) < f.w * 2.2 : (x > f.x - 140 && x < f.x + f.len + 140));
    let x = 900;
    while (x < this.finishX - 500) {
      const r = rng();
      if (r < 0.42 && !nearFeature(x)) {
        // obstacle on open ground: mostly rocks, occasionally a wreck
        if (rng() < 0.62) { const h = 22 + rng() * 22, w = h * 2.4 + 52; this.hazards.push({ x, w, h }); this.decor.push({ x, type: 'rock', variant: (rng() * 4) | 0, h, w }); }
        else { const h = 38 + rng() * 26, w = h * 2.6 + 74; this.hazards.push({ x, w, h }); this.decor.push({ x, type: 'wreck', variant: (rng() * 4) | 0, h, w }); }
      } else if (r < 0.58) {
        // landmark: cactus, often with a crow perched close by
        this.decor.push({ x, type: 'cactus', variant: (rng() * 5) | 0 });
        if (rng() < 0.55) this.decor.push({ x: x + 40 + rng() * 50, type: 'crow', variant: (rng() * 2) | 0, crow: { flew: false, x: 0, y: 0, vx: 0, vy: 0, fl: rng() * 6.28, t: 0 } });
      }
      // else: empty desert stretch
      x += 520 + rng() * 420;
    }
  }

  // ground height at world-x, in world units (lower y = higher up)
  groundY(x) {
    const c = this.cfg;
    const rough = Math.min(1, Math.max(0, (x - c.startFlat) / c.rampDist));
    const dm = this.diffMul;
    // rolling base (slope-bounded) + designed features on top
    const bigAmp = c.baseAmp * 0.62 * (0.45 + 0.55 * rough) * (0.8 + 0.2 * dm);
    const medAmp = 30 * rough * dm;
    let h = (this.noise(x * 0.00058) - 0.5) * 2 * bigAmp;                   // long rollers (~1700px)
    h += (this.noise(x * 0.0016 + 13) - 0.5) * 2 * medAmp;                  // mid undulation (~600px)
    h += (this.noise(x * 0.006 + 31) - 0.5) * 2 * 6 * rough;                // faint texture
    let y = c.baseY + h;
    const ft = this.features;
    for (let i = 0; i < ft.length; i++) {
      const f = ft[i];
      if (f.type === 'jump') {
        const dx = x - f.x;
        if (dx > -f.w * 3 && dx < f.w * 3) y -= f.amp * Math.exp(-(dx * dx) / (f.w * f.w));
      } else if (x >= f.x && x <= f.x + f.len) {
        const env = Math.sin(Math.PI * (x - f.x) / f.len);
        const s = Math.sin(Math.PI * (x - f.x) / f.lam);
        y -= f.amp * env * env * s * s;
      }
    }
    const hz = this.hazards;
    for (let i = 0; i < hz.length; i++) {
      const dx = x - hz[i].x;
      if (dx > -hz[i].w * 3 && dx < hz[i].w * 3) y -= hz[i].h * Math.exp(-(dx * dx) / (hz[i].w * hz[i].w));
    }
    if (x < c.startFlat) { const t = Math.max(0, x / c.startFlat); y = c.baseY + (y - c.baseY) * t * t; }
    if (x > this.finishX - 260) { const t = Math.min(1, (x - (this.finishX - 260)) / 260); y = y + (c.baseY - y) * t * t; }
    return y;
  }

  slope(x) { return (this.groundY(x + 2) - this.groundY(x - 2)) / 4; }
}
