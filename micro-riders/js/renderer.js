// All canvas 2D drawing. Everything here is procedural vector art for now (no
// image assets yet) — floor, track surface, toy-room obstacles/decor and the
// cars themselves are all drawn with paths/gradients. Every draw method below
// checks `this.spr[key]` first and only falls back to the vector path if no
// sprite loaded for that key — SPRITE_MANIFEST (config.js) is empty today, so
// every draw currently takes the vector branch, but dropping art files in
// assets/ plus an entry in the manifest is the only change needed later to
// switch a piece over, no other code changes. Reads live state off `game`
// each frame rather than owning a copy of it.
import { SPRITE_MANIFEST, TUNING } from './config.js';

const FLOOR_BASE = '#d8c39c';
const FLOOR_PLANK = 'rgba(150,116,72,0.28)';
const TRACK_FILL = '#8f8f96';
const TRACK_EDGE = '#f4f1e8';
const TRACK_CENTER = 'rgba(244,241,232,0.55)';

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadowEllipse(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(30,20,10,0.22)';
  ctx.beginPath(); ctx.ellipse(0, h * 0.06, w * 0.52, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export class Renderer {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.spr = {};
  }

  loadSprites() {
    for (const [key, file] of Object.entries(SPRITE_MANIFEST)) {
      const img = new Image();
      img.onload = () => { this.spr[key] = img; };
      img.src = 'assets/' + file;
    }
  }

  // draws `this.spr[key]` centered at the origin, sized to `w` wide (height
  // kept proportional to the image), returning true — or returns false
  // without drawing anything if that sprite hasn't loaded, so callers can
  // fall through to their vector-art version.
  drawSprite(ctx, key, w) {
    const img = this.spr[key];
    if (!img) return false;
    const h = w * img.height / img.width;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return true;
  }

  // same as drawSprite, but recolors the (presumably grayscale/white) sprite
  // to the car's chosen color: multiply-tint, then clip back to the source
  // image's alpha with destination-in so the background stays transparent.
  drawTintedSprite(ctx, key, w, color) {
    const img = this.spr[key];
    if (!img) return false;
    const h = w * img.height / img.width;
    ctx.save();
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  render() {
    const g = this.game, ctx = this.ctx, z = g.zoom || 1, W = g.VW || g.W, H = g.VH || g.H, cam = g.cam;
    ctx.save(); ctx.scale(z, z);
    this.floor(ctx, W, H, cam);
    this.trackSurface(ctx, cam);
    this.startLine(ctx, cam);
    this.surfacesLayer(ctx, W, H, cam);
    this.decorLayer(ctx, W, H, cam);
    this.obstacleLayer(ctx, W, H, cam);
    this.particlesLayer(ctx, cam);
    this.carsLayer(ctx, cam);
    ctx.restore();
  }

  worldT(ctx, cam, wx, wy) { ctx.translate(wx - cam.x, wy - cam.y); }

  floor(ctx, W, H, cam) {
    ctx.fillStyle = FLOOR_BASE;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = FLOOR_PLANK; ctx.lineWidth = 2;
    const tile = 110;
    const offX = ((cam.x % tile) + tile) % tile, offY = ((cam.y % tile) + tile) % tile;
    ctx.beginPath();
    for (let x = -offX; x < W + tile; x += tile) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -offY; y < H + tile * 3; y += tile * 3) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  trackSurface(ctx, cam) {
    const pts = this.game.track.points, hw = this.game.track.halfWidth;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // soft ground shadow just outside the track for a little depth
    ctx.strokeStyle = 'rgba(30,20,10,0.12)'; ctx.lineWidth = hw * 2 + 18;
    this._strokeLoop(ctx, pts);
    // bright rim (full width) with the gray surface stroked slightly narrower
    // on top of it — centered on the same centerline, this just leaves a thin
    // rim visible on both edges without needing an offset-path computation.
    // Purely a visual "stay on the road" guide now — the edge is no longer a
    // hard wall, just where the off-track timer starts counting.
    ctx.strokeStyle = TRACK_EDGE; ctx.lineWidth = hw * 2;
    this._strokeLoop(ctx, pts);
    ctx.strokeStyle = TRACK_FILL; ctx.lineWidth = hw * 2 - 10;
    this._strokeLoop(ctx, pts);
    ctx.strokeStyle = TRACK_CENTER; ctx.lineWidth = 6; ctx.setLineDash([26, 22]);
    this._strokeLoop(ctx, pts);
    ctx.setLineDash([]);
    ctx.restore();
  }

  _strokeLoop(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  startLine(ctx, cam) {
    const track = this.game.track;
    const p0 = track.pointAt(0);
    ctx.save(); this.worldT(ctx, cam, p0.x, p0.y); ctx.rotate(p0.heading);
    const hw = track.halfWidth;
    const squares = 10, sw = (hw * 2) / squares;
    for (let i = 0; i < squares; i++) { ctx.fillStyle = (i % 2) ? '#2b2b33' : '#f4f1e8'; ctx.fillRect(-6, -hw + i * sw, 12, sw); }
    ctx.restore();
  }

  // ---------- hazard surfaces (non-collidable, modify handling) ----------
  surfacesLayer(ctx, W, H, cam) {
    for (const s of this.game.track.surfaces) {
      if (s.x < cam.x - s.r - 40 || s.x > cam.x + W + s.r + 40 || s.y < cam.y - s.r - 40 || s.y > cam.y + H + s.r + 40) continue;
      ctx.save(); this.worldT(ctx, cam, s.x, s.y);
      if (s.type === 'oil') { if (!this.drawSprite(ctx, 'surfOil', s.r * 2)) this.drawOilSlick(ctx, s.r); }
      else if (s.type === 'honey') { if (!this.drawSprite(ctx, 'surfHoney', s.r * 2)) this.drawHoneyPatch(ctx, s.r); }
      ctx.restore();
    }
  }

  drawOilSlick(ctx, r) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#2b2b33';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    // faint rainbow sheen, the classic "oil puddle" tell
    const bands = ['rgba(120,180,255,0.20)', 'rgba(160,120,255,0.16)', 'rgba(120,255,200,0.14)'];
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(-r * 0.15 + i * r * 0.12, -r * 0.1, r * (0.55 - i * 0.12), r * (0.32 - i * 0.07), 0.3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  drawHoneyPatch(ctx, r) {
    ctx.save();
    ctx.globalAlpha = 0.88;
    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 2, 0, 0, r);
    grad.addColorStop(0, '#ffdb70'); grad.addColorStop(0.6, '#e8a94a'); grad.addColorStop(1, '#c9752b');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.18, r * 0.18, r * 0.09, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- obstacles (collidable toys) ----------
  obstacleLayer(ctx, W, H, cam) {
    for (const o of this.game.track.obstacles) {
      if (o.x < cam.x - 260 || o.x > cam.x + W + 260 || o.y < cam.y - 260 || o.y > cam.y + H + 260) continue;
      ctx.save(); this.worldT(ctx, cam, o.x, o.y);
      if (o.type === 'blocks') { if (!this.drawSprite(ctx, 'obsBlocks', 130)) this.drawBlockTower(ctx); }
      else if (o.type === 'books') { if (!this.drawSprite(ctx, 'obsBooks', 120)) this.drawBookStack(ctx); }
      else if (o.type === 'marbles') { ctx.restore(); this.drawMarbleCluster(ctx, cam, o); continue; }
      else if (o.type === 'pencil') { if (!this.drawSprite(ctx, 'obsPencil', o.len + 40)) this.drawPencil(ctx, o); }
      ctx.restore();
    }
  }

  drawBlockTower(ctx) {
    shadowEllipse(ctx, 130, 60);
    const colors = ['#f5c518', '#e6402c', '#2a9ee0'];
    const sizes = [56, 44, 32];
    let y = 6;
    for (let i = 0; i < 3; i++) {
      const s = sizes[i]; y -= s * 0.82;
      ctx.save(); ctx.translate((i - 1) * 3, y); ctx.rotate((i - 1) * 0.08);
      roundRectPath(ctx, -s / 2, -s / 2, s, s, 6);
      ctx.fillStyle = colors[i]; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }

  drawBookStack(ctx) {
    shadowEllipse(ctx, 120, 56);
    const colors = ['#2a9ee0', '#39c46b', '#e6402c', '#a855f7'];
    const w = [110, 96, 86, 70];
    let y = 14;
    for (let i = 0; i < 4; i++) {
      const bw = w[i], bh = 15; y -= bh;
      ctx.save(); ctx.translate((i % 2 ? 4 : -4), y); ctx.rotate((i % 2 ? 1 : -1) * 0.03);
      roundRectPath(ctx, -bw / 2, 0, bw, bh, 3);
      ctx.fillStyle = colors[i % colors.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-bw / 2 + 6, 2, bw - 12, 3);
      ctx.restore();
    }
  }

  drawMarbleCluster(ctx, cam, o) {
    const colors = ['#e6402c', '#2a9ee0', '#f5c518'];
    o.colliders.forEach((c, i) => {
      ctx.save(); this.worldT(ctx, cam, c.x, c.y);
      if (!this.drawSprite(ctx, 'obsMarble', c.r * 2)) {
        shadowEllipse(ctx, c.r * 2.2, c.r * 1.4);
        const grad = ctx.createRadialGradient(-c.r * 0.3, -c.r * 0.3, 1, 0, 0, c.r);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.25, colors[i % colors.length]); grad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  drawPencil(ctx, o) {
    ctx.rotate(o.angle);
    const len = o.len, w = 18;
    shadowEllipse(ctx, len * 1.1, 30);
    roundRectPath(ctx, -len / 2, -w / 2, len * 0.8, w, 3);
    ctx.fillStyle = '#f5c518'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len * 0.3, -w / 2); ctx.lineTo(len / 2 + 16, 0); ctx.lineTo(len * 0.3, w / 2); ctx.closePath();
    ctx.fillStyle = '#caa27a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(len / 2 + 16, 0); ctx.lineTo(len / 2 + 6, -5); ctx.lineTo(len / 2 + 6, 5); ctx.closePath();
    ctx.fillStyle = '#2b2b33'; ctx.fill();
    roundRectPath(ctx, -len / 2 - 12, -w / 2, 12, w, 3); ctx.fillStyle = '#ff7ac6'; ctx.fill();
  }

  // ---------- decor (purely cosmetic room props) ----------
  decorLayer(ctx, W, H, cam) {
    for (const d of this.game.track.decor) {
      if (d.x < cam.x - 320 || d.x > cam.x + W + 320 || d.y < cam.y - 320 || d.y > cam.y + H + 320) continue;
      ctx.save(); this.worldT(ctx, cam, d.x, d.y); ctx.scale(d.scale || 1, d.scale || 1);
      if (d.type === 'bed') { if (!this.drawSprite(ctx, 'decorBed', 440)) this.drawBed(ctx); }
      else if (d.type === 'toybox') { if (!this.drawSprite(ctx, 'decorToybox', 172)) this.drawToybox(ctx); }
      else if (d.type === 'lamp') { if (!this.drawSprite(ctx, 'decorLamp', 90)) this.drawLamp(ctx); }
      else if (d.type === 'rugpatch') { if (!this.drawSprite(ctx, 'decorRugpatch', 300)) this.drawRugPatch(ctx); }
      else if (d.type === 'ball') { if (!this.drawSprite(ctx, 'decorBall', 68)) this.drawBall(ctx); }
      else if (d.type === 'blockspair') { if (!this.drawSprite(ctx, 'decorBlockspair', 90)) this.drawBlocksPair(ctx); }
      else if (d.type === 'sock') { if (!this.drawSprite(ctx, 'decorSock', 80)) this.drawSock(ctx); }
      else if (d.type === 'marble') { if (!this.drawSprite(ctx, 'decorMarble', 36)) this.drawSingleMarble(ctx); }
      ctx.restore();
    }
  }

  drawBed(ctx) {
    shadowEllipse(ctx, 460, 260);
    roundRectPath(ctx, -220, -140, 440, 280, 26);
    ctx.fillStyle = '#e8a94a'; ctx.fill();
    roundRectPath(ctx, -220, -140, 440, 60, 22);
    ctx.fillStyle = '#f4e6cf'; ctx.fill();
    roundRectPath(ctx, -196, -160, 90, 60, 14);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#2a9ee0' : '#39c46b'; ctx.fillRect(-220, -40 + i * 45, 440, 20); }
  }

  drawToybox(ctx) {
    shadowEllipse(ctx, 170, 90);
    roundRectPath(ctx, -80, -30, 160, 70, 10);
    ctx.fillStyle = '#a05a2c'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.stroke();
    roundRectPath(ctx, -86, -54, 172, 30, 8);
    ctx.fillStyle = '#c9752b'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.arc(-30, -46, 16, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6402c'; ctx.beginPath(); ctx.arc(20, -50, 12, 0, Math.PI * 2); ctx.fill();
  }

  drawLamp(ctx) {
    ctx.save();
    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 140);
    grad.addColorStop(0, 'rgba(255,240,190,0.55)'); grad.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, 140, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    shadowEllipse(ctx, 90, 40);
    ctx.fillStyle = '#caa27a'; ctx.fillRect(-4, -60, 8, 60);
    ctx.beginPath(); ctx.moveTo(-46, -60); ctx.lineTo(46, -60); ctx.lineTo(30, -104); ctx.lineTo(-30, -104); ctx.closePath();
    ctx.fillStyle = '#f4e6cf'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.stroke();
  }

  drawRugPatch(ctx) {
    ctx.fillStyle = 'rgba(233,120,70,0.18)';
    roundRectPath(ctx, -150, -100, 300, 200, 40); ctx.fill();
    ctx.strokeStyle = 'rgba(233,120,70,0.3)'; ctx.lineWidth = 8;
    roundRectPath(ctx, -120, -76, 240, 152, 32); ctx.stroke();
  }

  drawBall(ctx) {
    shadowEllipse(ctx, 70, 34);
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.clip();
    const colors = ['#e6402c', '#f5c518', '#2a9ee0', '#39c46b', '#a855f7', '#ffffff'];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); ctx.closePath(); ctx.fill(); }
  }

  drawBlocksPair(ctx) {
    shadowEllipse(ctx, 90, 44);
    ctx.save(); ctx.translate(-16, 0); ctx.rotate(-0.1); roundRectPath(ctx, -22, -22, 44, 44, 5); ctx.fillStyle = '#39c46b'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(20, 4); ctx.rotate(0.15); roundRectPath(ctx, -18, -18, 36, 36, 5); ctx.fillStyle = '#ff7ac6'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke(); ctx.restore();
  }

  drawSock(ctx) {
    shadowEllipse(ctx, 80, 34);
    ctx.beginPath();
    ctx.moveTo(-24, -34); ctx.lineTo(6, -34); ctx.quadraticCurveTo(20, -34, 22, -14);
    ctx.lineTo(40, 10); ctx.quadraticCurveTo(46, 24, 30, 26); ctx.lineTo(-6, 20);
    ctx.quadraticCurveTo(-24, 16, -24, -6); ctx.closePath();
    ctx.fillStyle = '#f2f2f2'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#e6402c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-22, -30); ctx.lineTo(2, -30); ctx.stroke();
  }

  drawSingleMarble(ctx) {
    shadowEllipse(ctx, 40, 20);
    const grad = ctx.createRadialGradient(-6, -6, 1, 0, 0, 18);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#a855f7'); grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- particles ----------
  particlesLayer(ctx, cam) {
    for (const p of this.game.particles) {
      const a = Math.max(0, p.life);
      if (p.boom) {
        ctx.globalAlpha = a;
        ctx.fillStyle = a > 0.5 ? '#ffd27a' : '#ff6a3c';
      } else {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = '#fff8e8';
      }
      ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- cars ----------
  carsLayer(ctx, cam) {
    const sorted = this.game.cars.filter(c => !c.exploding).sort((a, b) => a.y - b.y);
    for (const car of sorted) this.drawCar(ctx, cam, car);
  }

  drawCar(ctx, cam, car) {
    ctx.save(); this.worldT(ctx, cam, car.x, car.y); ctx.rotate(car.heading);
    shadowEllipse(ctx, 52, 30);
    const len = car.carType === 'flash' ? 46 : 44, wid = car.carType === 'flash' ? 22 : 26;
    const spriteKey = car.carType === 'flash' ? 'carFlash' : 'carBuggy';
    // off-track warning: the car flashes once it's past half the explode
    // timer, more urgently the closer it gets to actually blowing up
    const offFrac = car.offTrackTime > 0 ? Math.min(1, car.offTrackTime / TUNING.offTrackLimit) : 0;
    if (offFrac > 0.5 && Math.sin(performance.now() * 0.02) > 0) ctx.globalAlpha = 0.45;
    if (this.drawTintedSprite(ctx, spriteKey, len, car.color)) {
      if (car.isPlayer) this.drawHeadingArrow(ctx, len);
      ctx.restore();
      return;
    }
    // wheels
    ctx.fillStyle = '#1c1c1c';
    const wOff = [[len * 0.30, wid * 0.5], [len * 0.30, -wid * 0.5], [-len * 0.30, wid * 0.5], [-len * 0.30, -wid * 0.5]];
    for (const [wx, wy] of wOff) { roundRectPath(ctx, wx - 7, wy - 4, 14, 8, 2); ctx.fill(); }
    // body
    ctx.save();
    if (car.carType === 'flash') {
      ctx.beginPath();
      ctx.moveTo(len / 2, 0);
      ctx.lineTo(len * 0.22, -wid / 2);
      ctx.lineTo(-len * 0.28, -wid / 2 - 2);
      ctx.lineTo(-len / 2, -wid * 0.3);
      ctx.lineTo(-len / 2, wid * 0.3);
      ctx.lineTo(-len * 0.28, wid / 2 + 2);
      ctx.lineTo(len * 0.22, wid / 2);
      ctx.closePath();
    } else {
      roundRectPath(ctx, -len / 2, -wid / 2, len, wid, 10);
    }
    ctx.fillStyle = car.color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    // canopy / windshield
    ctx.fillStyle = 'rgba(30,30,40,0.55)';
    roundRectPath(ctx, -len * 0.06, -wid * 0.32, len * 0.34, wid * 0.64, 5); ctx.fill();
    // highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-len * 0.42, -wid * 0.08, len * 0.3, wid * 0.16);
    ctx.restore();
    if (car.isPlayer) this.drawHeadingArrow(ctx, len);
    ctx.restore();
  }

  drawHeadingArrow(ctx, len) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(len / 2 + 4, 0); ctx.lineTo(len / 2 + 16, -6); ctx.lineTo(len / 2 + 16, 6); ctx.closePath(); ctx.fill();
  }
}
