import { CARS, COLOR_SWATCHES, LAPS, TUNING, BOT_NAMES, BOT_LINE_BIAS } from './config.js';
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
    this.track = new Track();

    const prefs = loadPrefs();
    const cached = loadCachedTop5();
    this.state = {
      screen: 'start',
      carSel: prefs.carId, colorSel: prefs.color, diffSel: prefs.difficulty,
      countdown: COUNTDOWN_FROM,
      position: 1, lap: 1, laps: LAPS, raceTimeStr: '0.0',
      standings: [], playerTime: 0, qualifies: false, saved: false, top5: cached,
    };

    this.input = new InputController(this, root);
    this.renderer = new Renderer(this, this.ctx);
    this.ui = new UI(this, root);

    this.cam = { x: 0, y: 0 };
    this.particles = [];

    fetchTop5().then(top5 => this.setState({ top5 }));

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
  buildCars() {
    const st = this.state;
    const botColors = COLOR_SWATCHES.filter(c => c !== st.colorSel);
    for (let i = botColors.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[botColors[i], botColors[j]] = [botColors[j], botColors[i]]; }

    this.cars = [];
    const playerSlot = this.track.gridSlot(0);
    const player = makeCar({ x: playerSlot.x, y: playerSlot.y, heading: playerSlot.heading, carType: st.carSel, color: st.colorSel, isPlayer: true, name: 'TOI' });
    this.cars.push(player);
    for (let i = 0; i < 3; i++) {
      const slot = this.track.gridSlot(i + 1);
      const carType = CARS[(i + 1) % CARS.length].id;
      const bot = makeCar({ x: slot.x, y: slot.y, heading: slot.heading, carType, color: botColors[i % botColors.length], isPlayer: false, name: BOT_NAMES[i] });
      bot._bias = BOT_LINE_BIAS[i];
      this.cars.push(bot);
    }
    this.player = player;
    this.cam.x = player.x - (this.VW || this.W) / 2;
    this.cam.y = player.y - (this.VH || this.H) / 2;
  }

  // ---------- selection screen ----------
  setCarSel(id) { this.state.carSel = id; this.player.carType = id; savePrefs({ carId: id, color: this.state.colorSel, difficulty: this.state.diffSel }); this.setState({ carSel: id }); }
  setColorSel(color) { this.state.colorSel = color; this.player.color = color; savePrefs({ carId: this.state.carSel, color, difficulty: this.state.diffSel }); this.setState({ colorSel: color }); }
  setDiffSel(key) { savePrefs({ carId: this.state.carSel, color: this.state.colorSel, difficulty: key }); this.setState({ diffSel: key }); }

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
    const top5 = await submitScore(name, this.state.playerTime);
    this.setState({ top5 });
  }

  // ---------- per-car progress / lap tracking ----------
  updateProgress(car) {
    const cp = this.track.closestPoint(car.x, car.y);
    if (car._sInit) {
      if (car.lastS > this.track.total * 0.85 && cp.distAlong < this.track.total * 0.15) car.lap++;
      else if (car.lastS < this.track.total * 0.15 && cp.distAlong > this.track.total * 0.85) car.lap = Math.max(0, car.lap - 1);
    } else car._sInit = true;
    car.lastS = cp.distAlong;
    car.distAlong = cp.distAlong;
    car.progressTotal = car.lap * this.track.total + cp.distAlong;
    if (!car.finished && car.lap >= LAPS) { car.finished = true; car.finishTime = this.raceTime; }
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
    for (const car of this.cars) {
      const corr = this.track.wallCorrection(car.x, car.y, R);
      if (corr) {
        car.x = corr.x; car.y = corr.y;
        const dot = car.vx * corr.nx + car.vy * corr.ny;
        if (dot < 0) { car.vx -= corr.nx * dot * (1 + TUNING.wallBounce); car.vy -= corr.ny * dot * (1 + TUNING.wallBounce); car.speed *= 0.72; }
      }
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
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = R * 2;
        if (dist < minDist) {
          const overlap = (minDist - dist) * 0.5, nx = dx / dist, ny = dy / dist;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
          a.vx -= nx * 40; a.vy -= ny * 40;
          b.vx += nx * 40; b.vy += ny * 40;
        }
      }
    }
  }

  // ---------- main loop ----------
  step(dt) {
    for (const car of this.cars) {
      if (car.finished) continue;
      const input = car.isPlayer ? this.input : botInput(car, this.track, this.carModel(car.carType), this.state.diffSel, car._bias, dt);
      stepCar(car, input, dt, this.carModel(car.carType));
    }
    this.resolveCollisions();
    for (const car of this.cars) if (!car.finished) this.updateProgress(car);
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
    this.pendingStandings = standings.map((c, i) => ({ rank: i + 1, name: c.name, isPlayer: c.isPlayer, time: c.finished ? c.finishTime : null }));
    this.setState({ screen: 'finished', standings: this.pendingStandings, playerTime, qualifies, saved: false });
    if (qualifies) setTimeout(() => this.ui.focusPseudoInput(), 150);
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
      const p = this.particles[i]; p.life -= dt * 1.4; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
}
