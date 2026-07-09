import { CARS, COLOR_SWATCHES, LAPS, TUNING, BOT_NAMES, BOT_BIAS_BUCKETS } from './config.js';
import { Track, closestOnCollider } from './track.js';
import { makeCar, stepCar } from './car.js';
import { botInput } from './ai.js';
import { Renderer } from './renderer.js';
import { InputController } from './input.js';
import { UI } from './ui.js';
import { loadCachedTop5, fetchTop5, submitScore, loadPrefs, savePrefs } from './storage.js';

const COUNTDOWN_FROM = 3;

// Orchestrator: owns race state and the main loop. Rendering, input and
// DOM/HUD concerns are delegated to Renderer / InputController / UI, each of
// which just reads/writes state on this instance (passed in as `game`).
export class Game {
  constructor(root) {
    this.root = root;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    const prefs = loadPrefs();
    this.track = new Track(prefs.trackId);
    const cached = loadCachedTop5(this.track.id);
    this.state = {
      screen: 'start',
      trackSel: this.track.id, carSel: prefs.carId, colorSel: prefs.color, diffSel: prefs.difficulty,
      countdown: COUNTDOWN_FROM,
      position: 1, lap: 1, laps: LAPS, raceTimeStr: '0.0',
      standings: [], playerTime: 0, qualifies: false, saved: false, top5: cached,
    };

    this.input = new InputController(this, root);
    this.renderer = new Renderer(this, this.ctx);
    this.ui = new UI(this, root);

    this.cam = { x: 0, y: 0 };
    this.particles = [];

    this.renderer.loadSprites();
    fetchTop5(this.track.id).then(top5 => this.setState({ top5 }));

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.buildCars();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setState(patch) {
    Object.assign(this.state, patch);
    this.ui.applyState(this.state);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = Math.min(1.5, Math.max(0.55, this.W / 900));
    this.VW = this.W / this.zoom; this.VH = this.H / this.zoom;
  }

  carModel(id) { return CARS.find(c => c.id === id) || CARS[0]; }

  // (re)builds the 4 cars on the starting grid using the current selections.
  // Each bot draws a random line-bias bucket (shuffled) plus a small skill
  // jitter every time, so repeated races at the same difficulty don't play
  // out identically.
  buildCars() {
    const st = this.state;
    const botColors = COLOR_SWATCHES.filter(c => c !== st.colorSel);
    for (let i = botColors.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[botColors[i], botColors[j]] = [botColors[j], botColors[i]]; }
    const buckets = BOT_BIAS_BUCKETS.slice();
    for (let i = buckets.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[buckets[i], buckets[j]] = [buckets[j], buckets[i]]; }

    this.cars = [];
    const playerSlot = this.track.gridSlot(0);
    const player = makeCar({ x: playerSlot.x, y: playerSlot.y, heading: playerSlot.heading, carType: st.carSel, color: st.colorSel, isPlayer: true, name: 'TOI' });
    this.cars.push(player);
    for (let i = 0; i < 3; i++) {
      const slot = this.track.gridSlot(i + 1);
      // randomized per race, not a fixed formula — that formula used to hand
      // 2 of the 3 bots the faster car every single race, making the bot on
      // the slower model look permanently weak regardless of any AI tuning
      const carType = CARS[(Math.random() * CARS.length) | 0].id;
      const bot = makeCar({ x: slot.x, y: slot.y, heading: slot.heading, carType, color: botColors[i % botColors.length], isPlayer: false, name: BOT_NAMES[i] });
      const [lo, hi] = buckets[i];
      bot._bias = lo + Math.random() * (hi - lo);
      // small per-race personality variance, not a skill lottery: kept tight
      // so the 3 bots stay roughly matched instead of one rolling well above
      // the other two (see ai.js — brakeSkill deliberately isn't jittered at
      // all, since it's a probability capped at 1.0: jitter above 1 is
      // wasted by the cap while jitter below 1 always hurts, which used to
      // make the unlucky bot look uniquely clumsy in corners every race)
      bot._skillJitter = 0.97 + Math.random() * 0.06;
      this.cars.push(bot);
    }
    this.player = player;
    this.cam.x = player.x - (this.VW || this.W) / 2;
    this.cam.y = player.y - (this.VH || this.H) / 2;
  }

  // ---------- selection screen ----------
  _prefsPatch(patch) { return { carId: this.state.carSel, color: this.state.colorSel, difficulty: this.state.diffSel, trackId: this.state.trackSel, ...patch }; }
  setCarSel(id) { this.state.carSel = id; this.player.carType = id; savePrefs(this._prefsPatch({ carId: id })); this.setState({ carSel: id }); }
  setColorSel(color) { this.state.colorSel = color; this.player.color = color; savePrefs(this._prefsPatch({ color })); this.setState({ colorSel: color }); }
  setDiffSel(key) { savePrefs(this._prefsPatch({ difficulty: key })); this.setState({ diffSel: key }); }
  setTrackSel(id) {
    if (this.state.screen !== 'start' || id === this.state.trackSel) return;
    this.track = new Track(id);
    savePrefs(this._prefsPatch({ trackId: id }));
    this.setState({ trackSel: id, top5: loadCachedTop5(id) });
    this.buildCars();
    fetchTop5(id).then(top5 => { if (this.state.trackSel === id) this.setState({ top5 }); });
  }

  // ---------- race flow ----------
  startRace() {
    if (this.state.screen !== 'start') return;
    this.buildCars();
    this.raceTime = 0;
    this.countdownT = COUNTDOWN_FROM;
    this.input.clear();
    this.setState({ screen: 'countdown', countdown: COUNTDOWN_FROM, saved: false, qualifies: false });
  }

  retry() {
    if (this.state.screen !== 'finished' && this.state.screen !== 'paused') return;
    this.buildCars();
    this.raceTime = 0;
    this.countdownT = COUNTDOWN_FROM;
    this.input.clear();
    this.setState({ screen: 'countdown', countdown: COUNTDOWN_FROM, saved: false, qualifies: false });
  }

  toMenu() {
    this.buildCars();
    this.input.clear();
    this.setState({ screen: 'start' });
  }

  togglePause() {
    if (this.state.screen === 'playing') { this.input.clear(); this.setState({ screen: 'paused' }); }
    else if (this.state.screen === 'paused') this.setState({ screen: 'playing' });
  }

  async saveScore() {
    if (!(this.state.qualifies && !this.state.saved)) return;
    let name = (this.ui.pseudoValue() || 'AAA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    if (!name) name = 'AAA';
    this.setState({ saved: true });
    const top5 = await submitScore(this.track.id, name, this.state.playerTime);
    this.setState({ top5 });
  }

  // ---------- per-car track state: lap/progress, off-track timer, hazards ----------
  // One closestPoint() projection per car per frame feeds all three — lap
  // counting (arc-length wrap), the off-track explode timer (lateral offset
  // past the drivable band), and which hazard zone (if any) it's currently
  // standing in.
  updateTrackState(car, dt) {
    const cp = this.track.closestPoint(car.x, car.y);
    if (car._sInit) {
      if (car.lastS > this.track.total * 0.85 && cp.distAlong < this.track.total * 0.15) {
        // the grid starts a little behind the line (see Track#gridSlot), so
        // every car's very first line crossing is just leaving the grid, not
        // a completed lap — only count laps from the second crossing on
        if (car._startCrossed) car.lap++; else car._startCrossed = true;
      } else if (car.lastS < this.track.total * 0.15 && cp.distAlong > this.track.total * 0.85) {
        car.lap = Math.max(0, car.lap - 1);
      }
    } else car._sInit = true;
    car.lastS = cp.distAlong;
    car.distAlong = cp.distAlong;
    car.progressTotal = car.lap * this.track.total + cp.distAlong;
    if (!car.finished && car.lap >= LAPS) { car.finished = true; car.finishTime = this.raceTime; }

    car.surfaceGrip = 1; car.surfaceDrag = 0; car.surfaceSpeedCap = Infinity; car.onOil = false;

    // off the drivable band: not a hard wall, but grass/floor-edge traction
    // loss (lower grip) plus a speed cap — cutting a corner is always
    // possible, but reliably slower and slidier than staying on the tarmac,
    // rather than relying on the explode timer alone to discourage it
    const offBand = Math.abs(cp.lateral) - this.track.halfWidth;
    if (offBand > 4) {
      car.offTrackTime += dt;
      car.surfaceGrip = Math.min(car.surfaceGrip, TUNING.offTrackGripMul);
      car.surfaceSpeedCap = Math.min(car.surfaceSpeedCap, TUNING.maxSpeed * TUNING.offTrackSpeedCapFrac);
    } else car.offTrackTime = 0;
    if (car.offTrackTime > TUNING.offTrackLimit) this.explodeCar(car);

    for (const surf of this.track.surfaces) {
      const d = Math.hypot(car.x - surf.x, car.y - surf.y);
      if (d < surf.r) {
        if (surf.type === 'oil') { car.surfaceGrip = Math.min(car.surfaceGrip, TUNING.oilGripMul); car.onOil = true; }
        else if (surf.type === 'honey') {
          car.surfaceDrag = Math.max(car.surfaceDrag, TUNING.honeyDrag);
          car.surfaceSpeedCap = Math.min(car.surfaceSpeedCap, TUNING.maxSpeed * TUNING.honeySpeedCapFrac);
        }
      }
    }
  }

  explodeCar(car) {
    if (car.exploding) return;
    car.exploding = true; car.explodeT = 0; car.offTrackTime = 0;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
      this.particles.push({ x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 4 + Math.random() * 5, boom: true });
    }
  }

  respawnCar(car) {
    const p = this.track.pointAt(car.distAlong);
    car.x = p.x; car.y = p.y; car.heading = p.heading;
    car.speed = 0; car.vx = 0; car.vy = 0;
    car.exploding = false; car.explodeT = 0;
  }

  standings() {
    return this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progressTotal - a.progressTotal;
    });
  }

  // ---------- collisions ----------
  resolveCollisions() {
    const R = TUNING.carRadius;
    const active = this.cars.filter(c => !c.exploding);
    for (const car of active) {
      for (const obs of this.track.obstacles) {
        // resolve against only the single deepest-penetrating collider in this
        // cluster this frame — correcting against every overlapping collider
        // at once can wedge a car in the notch between two adjacent circles
        // (push clear of A shoves it into B and vice versa), which is exactly
        // how a car got stuck oscillating against the pencil's sub-circles.
        let deepest = null, deepestOverlap = 0, deepestDist = 0;
        for (const c of obs.colliders) {
          const pt = closestOnCollider(car.x, car.y, c);
          const dx = car.x - pt.x, dy = car.y - pt.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const overlap = R + pt.r - dist;
          if (overlap > deepestOverlap) { deepestOverlap = overlap; deepest = pt; deepestDist = dist; }
        }
        if (deepest) {
          const nx = (car.x - deepest.x) / deepestDist, ny = (car.y - deepest.y) / deepestDist;
          car.x += nx * (deepestOverlap + 0.5); car.y += ny * (deepestOverlap + 0.5);
          const dot = car.vx * nx + car.vy * ny;
          // only bleed speed on an actual inbound impact (dot<0) — a car
          // merely resting/grazing against a prop while already steering
          // clear must not get re-punished every single frame it overlaps,
          // or it can never accelerate away and stalls there indefinitely
          if (dot < 0) { car.vx -= nx * dot * (1 + TUNING.obstacleBounce); car.vy -= ny * dot * (1 + TUNING.obstacleBounce); car.speed *= 0.55; }
        }
      }
    }
    // car-vs-car: a proper speed-scaled impulse rather than a fixed push, so
    // a slow graze barely registers but a full-speed T-bone throws both cars
    // hard — including into scenery, off the track, or into each other again.
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = R * 2;
        if (dist < minDist) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = (minDist - dist) * 0.5;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const closing = -(rvx * nx + rvy * ny);
          if (closing > 0) {
            const impulse = Math.min(TUNING.carCarImpulseCap, closing * (1 + TUNING.carCarRestitution) * 0.5);
            a.vx -= nx * impulse; a.vy -= ny * impulse;
            b.vx += nx * impulse; b.vy += ny * impulse;
            const severity = Math.min(1, closing / 500);
            a.speed *= 1 - 0.35 * severity; b.speed *= 1 - 0.35 * severity;
          }
        }
      }
    }
  }

  // ---------- main loop ----------
  step(dt) {
    for (const car of this.cars) {
      if (car.finished) continue;
      if (car.exploding) {
        car.explodeT += dt;
        if (car.explodeT > TUNING.respawnDelay) this.respawnCar(car);
        continue;
      }
      const input = car.isPlayer ? this.input : botInput(car, this.track, this.carModel(car.carType), this.state.diffSel, car._bias, dt);
      stepCar(car, input, dt, this.carModel(car.carType));
    }
    this.resolveCollisions();
    for (const car of this.cars) if (!car.finished && !car.exploding) this.updateTrackState(car, dt);
    this.raceTime += dt;

    const standings = this.standings();
    const pos = standings.indexOf(this.player) + 1;
    this.setStateQuiet({ position: pos, lap: Math.min(LAPS, this.player.lap + 1) });

    if (this.player.finished) this.finishRace(standings);
  }

  // like setState but skips the DOM overlay pass (applyState) — used every
  // frame for numbers UI already reads straight off game.state in updateHud
  setStateQuiet(patch) { Object.assign(this.state, patch); }

  finishRace(standings) {
    const playerTime = this.player.finishTime;
    const top5 = this.state.top5;
    const qualifies = top5.length < 5 || playerTime < top5[top5.length - 1].time;
    const totalDist = LAPS * this.track.total;
    this.pendingStandings = standings.map((c, i) => ({
      rank: i + 1, name: c.name, isPlayer: c.isPlayer,
      // the race ends the instant the player crosses the line, so any bot
      // still out on track never gets an official finishTime — project one
      // from its average pace so far rather than showing a blank dash,
      // since the whole podium reads oddly with only some times filled in
      time: c.finished ? c.finishTime : this.estimateFinishTime(c, totalDist),
    }));
    this.setState({ screen: 'finished', standings: this.pendingStandings, playerTime, qualifies, saved: false });
    if (qualifies) setTimeout(() => this.ui.focusPseudoInput(), 150);
  }

  estimateFinishTime(car, totalDist) {
    const avgSpeed = Math.max(car.progressTotal / Math.max(this.raceTime, 0.001), 1);
    const remaining = Math.max(0, totalDist - car.progressTotal);
    return this.raceTime + remaining / avgSpeed;
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.05) dt = 0.05;

    if (this.state.screen === 'countdown') {
      this.countdownT -= dt;
      const c = Math.max(0, Math.ceil(this.countdownT));
      if (c !== this.state.countdown) this.setState({ countdown: c });
      if (this.countdownT <= 0) this.setState({ screen: 'playing' });
    } else if (this.state.screen === 'playing') {
      this.step(dt);
    }

    if (this.state.screen === 'playing' || this.state.screen === 'countdown') {
      const tx = this.player.x - (this.VW || this.W) / 2, ty = this.player.y - (this.VH || this.H) / 2;
      const lp = Math.min(1, dt * 6);
      this.cam.x += (tx - this.cam.x) * lp; this.cam.y += (ty - this.cam.y) * lp;
      this.updateParticles(dt);
    }

    this.renderer.render();
    this.ui.updateHud();
  }

  updateParticles(dt) {
    for (const car of this.cars) {
      if (car.skidAmt > 0.35 && Math.abs(car.speed) > 60 && Math.random() < 0.4) {
        this.particles.push({ x: car.x, y: car.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 1, r: 3 + Math.random() * 3 });
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const drag = p.boom ? 2.2 : 1.4;
      p.life -= dt * drag; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.boom) { p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2; }
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
}
