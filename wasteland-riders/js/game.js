import { TWEAKS, CHASSIS_AXLE, makeLevelConfig } from './config.js';
import { loadCachedTop5, fetchTop5, submitScore, loadPerso, savePerso } from './storage.js';
import { Terrain } from './terrain.js';
import { Renderer } from './renderer.js';
import { InputController } from './input.js';
import { UI } from './ui.js';

// Orchestrator: owns run state, the physics simulation and the main loop.
// Rendering, input and DOM/HUD concerns are delegated to Renderer / InputController / UI,
// each of which just reads/writes state on this instance (passed in as `game`).
export class Game {
  constructor(root) {
    this.root = root;
    this.props = TWEAKS;
    this.chassisAxle = CHASSIS_AXLE;

    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.state = {
      screen: 'start', best: 0, top5: [], banked: 0, lives: 3, cs: 0, cf: 0,
      kt: '0.0s', kb: '+0', ks: 0, finalScore: 0, qualifies: false, saved: false, persoSel: null,
    };

    this.input = new InputController(this, root);
    this.renderer = new Renderer(this, this.ctx);
    this.ui = new UI(this, root);

    this.cam = { x: 0, y: 0, shake: 0 };
    this.particles = [];
    this.tw = [];

    // paint instantly from the last-seen cache, then refresh from the global leaderboard
    const cached = loadCachedTop5();
    this.top5 = cached;
    this.best = cached[0] ? cached[0].score : 0;
    this.lives = 3;
    this.banked = 0;

    this.renderer.loadSprites();
    this.setState({ best: this.best, top5: this.top5.slice(), persoSel: loadPerso() });
    fetchTop5().then(top5 => {
      this.top5 = top5;
      this.best = top5[0] ? top5[0].score : this.best;
      this.setState({ best: this.best, top5: this.top5.slice() });
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.reset(1);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // merges into run state and immediately re-renders the affected screen/HUD bits
  setState(patch) {
    Object.assign(this.state, patch);
    this.ui.applyState(this.state);
  }

  // decor lives on the current Terrain instance; exposed here so Renderer/updateWorld
  // can keep reading `game.decor` without knowing terrain generation is a separate class
  get decor() { return this.terrain.decor; }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // adaptive world zoom: small screens see a wider slice of the level
    this.zoom = Math.min(1, Math.max(0.55, this.W / 1050));
    this.VW = this.W / this.zoom; this.VH = this.H / this.zoom;
  }

  // ---------- level setup ----------
  reset(level) {
    this.level = level;
    const diff = this.props.difficulty || 'normal';
    this.diffMul = diff === 'facile' ? 0.75 : diff === 'difficile' ? 1.25 : 1.0;
    this.cfg = makeLevelConfig(level);
    this.seed = 1000 + level * 137.13;
    // player-tunable feel
    const envol = this.props.decollage ?? 1.1;     // takeoff ease
    const flott = this.props.flottement ?? 1.4;    // air floatiness
    this.cfg.launchGain *= (0.4 + envol * 0.6);
    this.cfg.airGrav = Math.max(0.14, this.cfg.airGrav / Math.max(0.4, flott));
    this.finishX = this.cfg.levelLen;
    this.terrain = new Terrain(this.seed, this.cfg, this.diffMul, this.finishX);
    // bike
    const x0 = 200;
    this.bike = { x: x0, y: this.groundY(x0) - 62, vx: 0, vy: 0, a: 0, av: 0, spin: 0, maxX: x0, m: this.cfg.m, I: this.cfg.I };
    this.wheelContact = [false, false];
    this.ragdoll = null;
    this.air = { time: 0, rot: 0, was: false };
    this.wheelie = 0;
    this.combo = 1; this.trickTotal = 0; this.flipCount = 0;
    this.runTime = 0;
    this.cam.x = this.bike.x - (this.VW || this.W) * 0.38;
    this.cam.y = this.bike.y - (this.VH || this.H) * 0.56;
    this.particles.length = 0; this.tw.length = 0;
    this.twTimer = 0;
    this.popups = []; this.popupBusy = false;
    this.hudFrozen = false;
  }

  groundY(x) { return this.terrain.groundY(x); }
  slope(x) { return this.terrain.slope(x); }

  // ---------- run control ----------
  newGame() { this.lives = 3; this.banked = 0; this.reset(1); this.setState({ screen: 'playing', banked: 0, lives: 3, saved: false, qualifies: false }); }
  toMenu() { this.lives = 3; this.banked = 0; this.input.gas = false; this.input.brake = false; this.reset(1); this.setState({ screen: 'start', banked: 0, lives: 3, saved: false, qualifies: false }); }
  retry() { this.reset(this.level); this.setState({ screen: 'playing' }); }
  nextLevel() { this.reset(this.level + 1); this.setState({ screen: 'playing' }); }

  crash() {
    if (this.state.screen !== 'playing' || this.ragdoll) return;
    const b = this.bike;
    this.ragdoll = { x: b.x - 4, y: b.y - 24, vx: b.vx * 0.7 + (Math.random() - 0.3) * 140, vy: b.vy * 0.7 - 260, a: b.a, av: b.av + (Math.random() - 0.5) * 10, rest: false };
    const runScore = this.runScore();
    this.hudFrozen = true;
    this.lives--;
    this.input.gas = false; this.input.brake = false;
    setTimeout(() => {
      if (this.lives <= 0) {
        const final = this.banked;
        const qualifies = final > 0 && (this.top5.length < 5 || final > this.top5[this.top5.length - 1].score);
        this.pendingScore = final;
        this.setState({ screen: 'gameover', finalScore: final, qualifies, saved: false, cs: runScore, cf: this.flipCount, lives: 0 });
        if (qualifies) setTimeout(() => this.ui.focusPseudoInput(), 120);
      } else {
        this.setState({ screen: 'crashed', cs: runScore, cf: this.flipCount, lives: this.lives, banked: this.banked });
      }
    }, 900);
  }

  complete() {
    if (this.state.screen !== 'playing') return;
    this.hudFrozen = true;               // freeze the HUD instantly — no double-count flash
    if (this.air.was) this.settleAir();  // credit a flip in progress when crossing the line airborne
    const par = this.finishX / 300;
    const bonus = Math.max(0, Math.floor((par - this.runTime)) * 45);
    const levelScore = this.runScore() + bonus;
    this.banked += levelScore;
    this.input.gas = false; this.input.brake = false;
    this.setState({ screen: 'complete', kt: this.runTime.toFixed(1) + 's', kb: '+' + bonus, ks: levelScore, banked: this.banked });
  }

  async saveScore() {
    if (!(this.state.qualifies && !this.state.saved)) return;
    let name = (this.ui.pseudoValue() || 'AAA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    if (!name) name = 'AAA';
    this.setState({ saved: true });  // optimistic — blocks a double-submit while the request is in flight
    const top5 = await submitScore(name, this.pendingScore);
    this.top5 = top5;
    this.best = top5[0] ? top5[0].score : this.best;
    this.setState({ top5: this.top5.slice(), best: this.best });
  }

  perso() { return this.state.persoSel || this.props.perso || 'masculin'; }
  setPerso(p) { savePerso(p); this.setState({ persoSel: p }); }

  // single source of truth for the current run's score (distance capped at the finish line)
  runScore() { return this.trickTotal + Math.floor(Math.min(this.bike.maxX, this.finishX) / 8); }

  // score any pending air trick (called on landing AND when crossing the finish line mid-air)
  settleAir() {
    const flips = Math.round(this.air.rot / (2 * Math.PI));
    const n = Math.abs(flips);
    if (n >= 1) {
      this.combo = Math.min(9, this.combo + 1);
      this.flipCount += n;
      const back = this.air.rot < 0;
      let nm, pts;
      if (n === 2) { nm = 'DOUBLE ' + (back ? 'BACKFLIP' : 'FRONTFLIP'); pts = 200; }
      else if (n > 2) { nm = n + '× ' + (back ? 'BACKFLIP' : 'FRONTFLIP'); pts = 200 + (n - 2) * 100; }
      else { nm = back ? 'BACKFLIP' : 'FRONTFLIP'; pts = back ? 50 : 75; }
      this.award(nm, pts);
    }
    if (this.air.time > 0.75) { this.award('AIR ' + this.air.time.toFixed(1) + 's', Math.floor(this.air.time * 55)); }
    this.air.time = 0; this.air.rot = 0; this.air.was = false;
  }

  award(text, pts) {
    const gain = Math.round(pts * this.combo);
    this.trickTotal += gain;
    // queued popups: simultaneous awards (flip + AIR) show one after the other instead of overwriting
    this.popups.push(text + '  +' + gain);
    if (!this.popupBusy) this.nextPopup();
  }
  nextPopup() {
    if (!this.popups.length) { this.popupBusy = false; return; }
    this.popupBusy = true;
    this.ui.showPopup(this.popups.shift());
    setTimeout(() => this.nextPopup(), 750);
  }

  // ---------- physics ----------
  substep(h) {
    const b = this.bike, c = this.cfg;
    let Fx = 0, Fy = 0, T = 0;
    const contacts = [false, false];
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    let driveTx = 1, driveTy = 0; this._frontTx = 1; this._frontTy = 0;
    for (let wi = 0; wi < 2; wi++) {
      const o = c.wheels[wi];
      const rx = o.x * ca - o.y * sa, ry = o.x * sa + o.y * ca;
      const px = b.x + rx, py = b.y + ry;
      const gy = this.groundY(px);
      const pen = (py + c.wheelR) - gy;
      if (pen > 0) {
        contacts[wi] = true;
        const sl = this.slope(px);
        let nx = sl, ny = -1; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        let tx = 1, ty = sl; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const vx = b.vx - b.av * ry, vy = b.vy + b.av * rx;
        const vn = vx * nx + vy * ny, vt = vx * tx + vy * ty;
        let Fn = c.k * Math.min(pen, 60) - c.c * vn; if (Fn < 0) Fn = 0; if (Fn > 26000) Fn = 26000;
        const Ft = -c.roll * vt * (wi === 1 ? 0.45 : 1); // rolling drag — front wheel grabs far less (rear weight bias)
        const fx = Fn * nx + Ft * tx, fy = Fn * ny + Ft * ty;
        Fx += fx; Fy += fy; T += rx * fy - ry * fx;
        if (wi === 0) { driveTx = tx; driveTy = ty; } else { this._frontTx = tx; this._frontTy = ty; }
        if (this.state.screen === 'playing' && Math.abs(vt) > 70 && Math.random() < 0.35) this.spawnDust(px, gy, vt);
      }
    }
    this.wheelContact = contacts;
    const air = !(contacts[0] || contacts[1]);
    // gravity — reduced in the air for hang time (more time to flip / re-aim)
    Fy += c.g * b.m * (air ? c.airGrav : 1);
    if (!air && this.state.screen === 'playing') {
      const rearGrip = contacts[0];               // motorcycle is rear-wheel driven
      const btx = rearGrip ? driveTx : this._frontTx, bty = rearGrip ? driveTy : this._frontTy;
      const spd = Math.abs(b.vx), dirs = b.vx >= 0 ? 1 : -1;
      if (this.input.gas) {
        // punchy propulsion: big shove at low speed, tapers to normal power at high speed;
        // front-only contact still pushes at 55% so bump crests don't kill momentum
        const punch = 1.55 - 0.55 * Math.min(1, spd / 850);
        const cap = Math.max(0, 1 - Math.pow(spd / 1900, 3));   // soft top-speed cap — same punch, lower cruise
        const pw = c.drivePower * punch * cap * (rearGrip ? 1 : 0.55);
        Fx += pw * btx; Fy += pw * bty;
        if (rearGrip) T += c.wheelieK * (-0.44 - b.a) - c.leanDamp * b.av;   // wheelie torque only rear-wheel-down
      } else if (!this.input.brake) {
        // engine braking: releasing the throttle bleeds speed noticeably
        const eb = Math.min(spd * 6, 950);
        Fx -= eb * btx * dirs; Fy -= eb * bty * dirs;
      }
      // braking works on whichever wheel is down; stoppie lean only eases, never kicks
      if (this.input.brake) { Fx -= c.brakePower * btx; Fy -= c.brakePower * bty; if (rearGrip) T += c.wheelieK * (0.30 - b.a) - c.leanDamp * b.av; }
    }
    if (air && this.state.screen === 'playing') {
      // rate-controlled air spin: predictable flip cadence, releasing eases to a stop so you can line up the landing
      let target = 0;
      if (this.input.gas) target = -c.airSpin;        // backflip
      else if (this.input.brake) target = c.airSpin;  // frontflip
      const rate = (this.input.gas || this.input.brake) ? c.airResp : c.airSettle;
      b.av += (target - b.av) * Math.min(1, rate * h);
    }
    b.vx += (Fx / b.m) * h; b.vy += (Fy / b.m) * h; b.av += (T / b.I) * h;
    b.vx *= (1 - c.linDrag * h);
    b.av *= (1 - (air ? c.airDrag : c.angDrag) * h);
    b.vx = Math.max(-c.maxV, Math.min(c.maxV, b.vx));
    b.vy = Math.max(-3600, Math.min(3600, b.vy));
    b.av = Math.max(-26, Math.min(26, b.av));
    b.x += b.vx * h; b.y += b.vy * h; b.a += b.av * h;
    b.spin += b.vx * h / c.wheelR;
  }

  // game over ONLY when the rider's body actually touches the ground (bike frame/wheels can hit freely)
  checkCrash() {
    const b = this.bike, ca = Math.cos(b.a), sa = Math.sin(b.a), c = this.cfg;
    for (let i = 0; i < c.bodyPts.length; i++) {
      const p = c.bodyPts[i];
      const wx = b.x + (p.x * ca - p.y * sa), wy = b.y + (p.x * sa + p.y * ca);
      if (wy - this.groundY(wx) > 2) return true;
    }
    return false;
  }

  spawnDust(x, y, vt) {
    const dir = vt > 0 ? -1 : 1;
    this.particles.push({ x, y: y - 4, vx: dir * (40 + Math.random() * 70), vy: -30 - Math.random() * 70, life: 1, r: 5 + Math.random() * 8, kind: 'dust' });
  }

  step(dt) {
    const N = this.cfg.substeps, h = dt / N;
    for (let i = 0; i < N; i++) this.substep(h);
    const b = this.bike;
    b.maxX = Math.max(b.maxX, b.x);
    // tricks
    const air = !(this.wheelContact[0] || this.wheelContact[1]);
    if (air) { this.air.time += dt; this.air.rot += b.av * dt; this.air.was = true; this.air.ground = 0; }
    else if (this.air.was) {
      // require ~80ms of sustained contact before settling — a one-frame kiss on a bump crest
      // no longer wipes the rotation of a flip in progress
      this.air.ground = (this.air.ground || 0) + dt;
      if (this.air.ground > 0.08) {
        if (!this.checkCrash()) this.settleAir();
        else { this.air.time = 0; this.air.rot = 0; this.air.was = false; }
      }
    }
    // wheelie
    const nose = Math.cos(b.a);
    if (this.wheelContact[0] && !this.wheelContact[1] && b.a < -0.28 && nose > 0.2 && Math.abs(b.vx) > 50) {
      this.wheelie += dt;
      if (this.wheelie > 0.5) { this.award('WHEELIE', 30); this.wheelie = 0; this.combo = Math.min(9, this.combo + 1); }
    } else if (this.wheelie > 0) { this.wheelie = Math.max(0, this.wheelie - dt * 2); }
    this.runTime += dt;
    const onGround = this.wheelContact[0] || this.wheelContact[1];
    // crest launch-assist: cresting a hill at speed pops the bike into the air (easy takeoff, rewards speed)
    if (onGround && this.state.screen === 'playing') {
      const dir = b.vx >= 0 ? 1 : -1, sp = Math.abs(b.vx);
      if (sp > 220) {
        const s0 = this.slope(b.x), s1 = this.slope(b.x + dir * 60);
        const crest = (s1 - s0) * dir;   // >0 when the slope tips downhill ahead = a crest
        if (crest > 0.04) {
          b.vy -= Math.min(crest * sp * this.cfg.launchGain, 3200) * dt;
        }
      }
    }
    // end states
    if (this.checkCrash()) { this.combo = 1; this.crash(); return; }
    if (b.x >= this.finishX) { this.complete(); return; }
    if (b.y > this.cfg.baseY + 1200) { this.crash(); }
  }

  // ---------- decor / particles update ----------
  updateWorld(dt) {
    const b = this.bike;
    for (const d of this.decor) {
      // cactus is fully static (no motion)
      if (d.type === 'crow' && d.crow) {
        const cr = d.crow;
        if (!cr.flew && b.x > d.x - 300 && b.x < d.x + 130 && Math.abs(b.vx) > 40) {
          cr.flew = true; cr.x = d.x; cr.y = this.groundY(d.x) - 14;
          cr.vx = (b.vx >= 0 ? 70 : -70) + Math.random() * 50; cr.vy = -150 - Math.random() * 90;
        }
        if (cr.flew) { cr.t += dt; cr.vy += 46 * dt; cr.x += cr.vx * dt; cr.y += cr.vy * dt; cr.fl += dt * 13; }
      }
    }
    // roaming tumbleweeds — rolling (continuous spin) + a little hop on every bounce
    if (this.state.screen === 'playing') {
      this.twTimer -= dt;
      if (this.twTimer <= 0 && this.tw.length < 3) { this.twTimer = 2.6 + Math.random() * 3.2; const sx = b.x + (this.VW || this.W) * 0.8; this.tw.push({ x: sx, vx: -26 - Math.random() * 40, phase: Math.random() * 6.28, rot: Math.random() * 6.28 }); }
    }
    for (let i = this.tw.length - 1; i >= 0; i--) {
      const t = this.tw[i]; t.x += t.vx * dt; t.phase += dt * 3.2; t.rot += (t.vx / 23) * dt;
      if (t.x < b.x - (this.VW || this.W) * 0.75) this.tw.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt * 1.5; p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r *= 1 + dt * 1.2;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.ragdoll) {
      const g = this.ragdoll;
      if (!g.rest) {
        g.vy += 1600 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.a += g.av * dt; g.av *= 0.99;
        const gy = this.groundY(g.x) - 10;
        if (g.y > gy) { g.y = gy; g.vy *= -0.35; g.vx *= 0.6; g.av *= 0.5; if (Math.abs(g.vy) < 60) { g.rest = true; g.vy = 0; } }
      } else {
        g.a += (0 - g.a) * Math.min(1, dt * 7);          // settle the fallen rider flat on the ground
        g.y += (this.groundY(g.x) - 10 - g.y) * Math.min(1, dt * 7);
      }
    }
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (this.state.screen === 'paused') { this.renderer.render(); this.ui.updateHud(false); return; }  // freeze world while paused
    const playing = this.state.screen === 'playing';
    if (playing) this.step(dt);
    else { for (let i = 0; i < this.cfg.substeps; i++) this.substep(dt / this.cfg.substeps); } // settle / crash physics
    this.updateWorld(dt);
    // camera
    const b = this.bike;
    const tx = b.x - (this.VW || this.W) * 0.38, ty = b.y - (this.VH || this.H) * 0.56;
    const lp = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * lp; this.cam.y += (ty - this.cam.y) * lp;
    if (this.cam.shake > 0) { this.cam.shake -= dt * 3; if (this.cam.shake < 0) this.cam.shake = 0; }
    this.renderer.render();
    this.ui.updateHud(playing);
  }
}
