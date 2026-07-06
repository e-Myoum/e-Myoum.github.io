import { SPRITE_MANIFEST, CACTUS_H } from './config.js';

// All canvas 2D drawing: parallax sky/dunes, ground silhouette, decor sprites,
// bike (sprite-based, with a vector fallback if a sprite fails to load),
// ragdoll, particles, finish line and the discreet high-speed streak effect.
// Reads live state off `game` each frame rather than owning a copy of it.
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

  render() {
    const g = this.game, ctx = this.ctx, z = g.zoom || 1, W = g.VW || g.W, H = g.VH || g.H, cam = g.cam;
    let shx = 0, shy = 0;
    if ((g.props.screenShake ?? true) && cam.shake > 0) { shx = (Math.random() - 0.5) * cam.shake * 14; shy = (Math.random() - 0.5) * cam.shake * 14; }
    ctx.save(); ctx.translate(shx, shy); ctx.scale(z, z);
    this.sky(ctx, W, H, cam);
    this.dunes(ctx, W, H, cam, 0.16, H * 0.60, 26, 'rgba(96,40,22,0.9)', 0.0022);
    this.dunes(ctx, W, H, cam, 0.40, H * 0.70, 34, 'rgba(120,52,26,0.95)', 0.0031);
    this.drawGround(ctx, W, H, cam);
    this.decorLayer(ctx, W, H, cam);
    this.particlesLayer(ctx, cam);
    if (g.ragdoll) this.drawRagdoll(ctx, cam);
    else this.drawBike(ctx, cam);
    this.finishFlag(ctx, cam);
    this.speedLines(ctx, W, H);
    ctx.restore();
  }

  // painted desert backdrop, tiled horizontally with a slow parallax drift
  // (far slower than the dune layers) so it scrolls but never runs out.
  // Alternate tiles are mirrored (a standard trick for a non-seamless source
  // image) so consecutive copies always share their edge pixels — no hard seam.
  sky(ctx, W, H, cam) {
    const img = this.spr.bgDesert;
    if (!img) { ctx.fillStyle = '#241009'; ctx.fillRect(-40, -40, W + 80, H + 80); return; }
    const scale = H / img.height;
    const dw = img.width * scale;
    const absOff = cam.x * 0.05;
    const i0 = Math.floor((absOff - dw) / dw);
    const i1 = Math.floor((absOff + W) / dw) + 1;
    for (let i = i0; i <= i1; i++) {
      const screenX = i * dw - absOff;
      ctx.save();
      if (i & 1) { ctx.translate(screenX + dw, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, dw, H); }
      else { ctx.drawImage(img, screenX, 0, dw, H); }
      ctx.restore();
    }
  }

  dunes(ctx, W, H, cam, fac, baseY, amp, color, freq) {
    const off = cam.x * fac - cam.y * 0.1;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 10) {
      const wx = (x + off);
      const y = baseY + Math.sin(wx * freq) * amp + Math.sin(wx * freq * 2.3 + 1.7) * amp * 0.4 - cam.y * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 10, H + 10); ctx.closePath(); ctx.fill();
  }

  drawGround(ctx, W, H, cam) {
    const g = this.game;
    ctx.beginPath(); ctx.moveTo(-4, H + 4);
    const pts = [];
    for (let sx = -4; sx <= W + 4; sx += 3) { const wx = cam.x + sx; const y = g.groundY(wx) - cam.y; pts.push([sx, y]); }
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(W + 4, H + 4); ctx.lineTo(-4, H + 4); ctx.closePath();
    const grad = ctx.createLinearGradient(0, H * 0.4, 0, H);
    grad.addColorStop(0, '#3a1d0f'); grad.addColorStop(1, '#1c0e07');
    ctx.fillStyle = grad; ctx.fill();
    // rim highlight
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = '#e79a44'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,210,140,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  }

  worldT(ctx, cam, wx, wy) { ctx.translate(wx - cam.x, wy - cam.y); }

  decorLayer(ctx, W, H, cam) {
    const g = this.game;
    for (const d of g.decor) {
      if (d.x < cam.x - 320 || d.x > cam.x + W + 320) continue;
      const gy = g.groundY(d.x);
      const groundRot = Math.atan(g.slope(d.x));
      if (d.type === 'rock') { this.groundSprite(ctx, cam, d.x, gy, this.spr['rock' + (d.variant + 1)], d.w * 1.15, groundRot); }
      else if (d.type === 'wreck') { this.groundSprite(ctx, cam, d.x, gy, this.spr['car' + (d.variant + 1)], d.w * 1.2, groundRot); }
      else if (d.type === 'cactus') { this.groundSpriteH(ctx, cam, d.x, gy, this.spr['cactus' + (d.variant + 1)], CACTUS_H[d.variant], 0); }
      else if (d.type === 'crow') {
        const cr = d.crow;
        if (cr.flew) { this.flySprite(ctx, cam, cr.x, cr.y, this.spr.crowFly, 66, Math.sin(cr.fl) * 0.14); }
        else this.groundSpriteH(ctx, cam, d.x, gy, this.spr['crow' + (d.variant + 1)], 44, 0);
      }
      if (g.props.showSlots) { ctx.save(); this.worldT(ctx, cam, d.x, gy); this.slotTag(ctx, d.type); ctx.restore(); }
    }
    // roaming tumbleweeds — rolling like a ball, with a periodic little hop
    for (const t of g.tw) {
      if (t.x < cam.x - 140 || t.x > cam.x + W + 140) continue;
      const bounce = 6 * Math.abs(Math.sin(t.phase));
      this.rollingSprite(ctx, cam, t.x, g.groundY(t.x), this.spr.tumbleweed, 46, t.rot, bounce);
    }
  }

  groundSprite(ctx, cam, wx, gy, img, Wd, rot) { if (!img) return; const Hd = Wd * img.height / img.width; ctx.save(); this.worldT(ctx, cam, wx, gy); if (rot) ctx.rotate(rot); ctx.drawImage(img, -Wd / 2, -Hd * 0.88, Wd, Hd); ctx.restore(); }
  groundSpriteH(ctx, cam, wx, gy, img, Hd, rot) { if (!img) return; const Wd = Hd * img.width / img.height; ctx.save(); this.worldT(ctx, cam, wx, gy); if (rot) ctx.rotate(rot); ctx.drawImage(img, -Wd / 2, -Hd + 2, Wd, Hd); ctx.restore(); }
  flySprite(ctx, cam, wx, wy, img, Wd, rot) { if (!img) return; const Hd = Wd * img.height / img.width; ctx.save(); this.worldT(ctx, cam, wx, wy); if (rot) ctx.rotate(rot); ctx.drawImage(img, -Wd / 2, -Hd / 2, Wd, Hd); ctx.restore(); }
  // ball-like rolling object: rotates about its own center (not its ground contact
  // point, unlike groundSpriteH) and can be lifted by `bounce` for a little hop.
  rollingSprite(ctx, cam, wx, gy, img, Hd, rot, bounce) { if (!img) return; const Wd = Hd * img.width / img.height; ctx.save(); this.worldT(ctx, cam, wx, gy - Hd / 2 - bounce); ctx.rotate(rot); ctx.drawImage(img, -Wd / 2, -Hd / 2, Wd, Hd); ctx.restore(); }

  slotTag(ctx, label) {
    ctx.save(); ctx.fillStyle = 'rgba(255,210,140,0.85)'; ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = 'center'; ctx.fillText('[' + label + ']', 0, 12);
    ctx.strokeStyle = 'rgba(255,210,140,0.4)'; ctx.setLineDash([3, 3]); ctx.strokeRect(-22, -58, 44, 52); ctx.restore();
  }

  particlesLayer(ctx, cam) {
    for (const p of this.game.particles) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.5;
      ctx.fillStyle = '#c98a4a';
      ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- bike sprites ----------
  // axle anchors, in chassis-sprite px (overridable via props.axe* tweaks)
  axles() {
    const g = this.game, a = g.chassisAxle, p = g.props;
    return {
      rear: { x: (p.axeArX ?? a.rear.x), y: (p.axeArY ?? a.rear.y) },
      front: { x: (p.axeAvX ?? a.front.x), y: (p.axeAvY ?? a.front.y) }
    };
  }
  // uniform scale that maps the sprite's axle spacing onto the physics wheelbase
  bikeScale() {
    const c = this.game.cfg, a = this.axles();
    const dxs = a.front.x - a.rear.x, dys = a.front.y - a.rear.y;
    const dxw = c.wheels[1].x - c.wheels[0].x, dyw = c.wheels[1].y - c.wheels[0].y;
    return Math.hypot(dxw, dyw) / Math.max(1, Math.hypot(dxs, dys));
  }
  drawMotoSprite(ctx) {
    const m = this.spr.moto; if (!m) return;
    const c = this.game.cfg, a = this.axles();
    const dxs = a.front.x - a.rear.x, dys = a.front.y - a.rear.y;
    const dxw = c.wheels[1].x - c.wheels[0].x, dyw = c.wheels[1].y - c.wheels[0].y;
    const s = Math.hypot(dxw, dyw) / Math.max(1, Math.hypot(dxs, dys));
    const rot = Math.atan2(dyw, dxw) - Math.atan2(dys, dxs);
    // map the sprite so BOTH axle anchors land exactly on the two physics wheel centers
    ctx.save();
    ctx.translate(c.wheels[0].x, c.wheels[0].y);
    ctx.rotate(rot); ctx.scale(s, s);
    ctx.translate(-a.rear.x, -a.rear.y);
    ctx.drawImage(m, 0, 0);
    ctx.restore();
  }
  drawWheels(ctx) {
    const rw = this.spr.wheelR, fw = this.spr.wheelF; if (!rw || !fw) return;
    const g = this.game, c = g.cfg, b = g.bike, imgs = [rw, fw];
    // wheel display diameter derived from the PHYSICS radius (so visuals match the collisions);
    // rear/front sized independently in case the two sprites' art doesn't share the same scale
    const tailles = [g.props.tailleRoueAr ?? 1.02, g.props.tailleRoueAv ?? 1.02];
    for (let wi = 0; wi < 2; wi++) {
      const o = c.wheels[wi], im = imgs[wi];
      const D = 2 * c.wheelR * tailles[wi];
      const Wd = D, Hd = D * im.height / im.width;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(b.spin);
      ctx.drawImage(im, -Wd / 2, -Hd / 2, Wd, Hd);
      ctx.restore();
    }
  }
  drawPiloteSprite(ctx) {
    const g = this.game;
    const feminin = g.perso() === 'feminin';
    const p = (feminin ? this.spr.joeF : this.spr.joeM); if (!p) return;
    const s = this.bikeScale() * (g.props.taillePilote ?? 1.16);
    // anchor = the rider's seat point in the pilot sprite (px), placed on the bike's saddle
    const ax = 30, ay = feminin ? 142.5 : 140;
    const px = (g.props.piloteX ?? -17), py = (g.props.piloteY ?? -6);
    ctx.save(); ctx.translate(px, py); ctx.rotate(g.props.piloteRot ?? -0.045);
    ctx.drawImage(p, -ax * s, -ay * s, p.width * s, p.height * s);
    ctx.restore();
  }

  drawBike(ctx, cam) {
    const g = this.game, b = g.bike;
    ctx.save(); ctx.translate(b.x - cam.x, b.y - cam.y); ctx.rotate(b.a);
    if (g.input.gas && g.state.screen === 'playing') {
      ctx.fillStyle = 'rgba(255,140,50,' + (0.4 + Math.random() * 0.4) + ')';
      ctx.beginPath(); ctx.moveTo(-66, 18); ctx.lineTo(-90 - Math.random() * 18, 12); ctx.lineTo(-66, 23); ctx.closePath(); ctx.fill();
    }
    if (this.spr.moto && this.spr.wheelR && this.spr.wheelF) {
      this.drawWheels(ctx);
      this.drawMotoSprite(ctx);
      this.drawPiloteSprite(ctx);
    } else {
      this.drawBikeVector(ctx);
    }
    if (g.props.showSlots) this.slotTag(ctx, 'bike');
    ctx.restore();
  }

  // vector fallback used only if a sprite failed to load
  drawBikeVector(ctx) {
    const g = this.game, b = g.bike, c = g.cfg;
    for (let wi = 0; wi < 2; wi++) { const o = c.wheels[wi]; this.drawWheel(ctx, o.x, o.y, c.wheelR, b.spin); }
    ctx.strokeStyle = '#e79a44'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c.wheels[0].x, c.wheels[0].y); ctx.lineTo(-8, -6); ctx.lineTo(c.wheels[1].x, c.wheels[1].y); ctx.stroke();
    ctx.fillStyle = '#241308';
    ctx.beginPath(); ctx.moveTo(-40, 10); ctx.lineTo(-30, -14); ctx.lineTo(10, -18); ctx.lineTo(40, -6); ctx.lineTo(46, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a1d0f'; ctx.beginPath(); ctx.moveTo(-24, -10); ctx.lineTo(6, -14); ctx.lineTo(2, -2); ctx.lineTo(-22, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9752b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(40, -6); ctx.lineTo(52, -16); ctx.stroke();
    this.drawSkeleton(ctx);
  }
  drawWheel(ctx, x, y, r, spin) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#140b06'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a1d0f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, 7); ctx.stroke();
    ctx.rotate(spin); ctx.strokeStyle = '#c9752b'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5)); ctx.stroke(); }
    ctx.fillStyle = '#e79a44'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
    ctx.restore();
  }
  drawSkeleton(ctx) {
    ctx.strokeStyle = '#e8dcc4'; ctx.fillStyle = '#e8dcc4'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,240,210,0.4)'; ctx.shadowBlur = 4;
    // spine
    ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-2, -34); ctx.stroke();
    // ribs
    for (let i = 0; i < 3; i++) { const yy = -18 - i * 5; ctx.beginPath(); ctx.moveTo(-8, yy); ctx.lineTo(2, yy - 1); ctx.stroke(); }
    // skull
    ctx.beginPath(); ctx.arc(-1, -42, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140a'; ctx.beginPath(); ctx.arc(-4, -43, 1.8, 0, 7); ctx.arc(2, -43, 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8dcc4';
    // arms to handlebar
    ctx.beginPath(); ctx.moveTo(-3, -30); ctx.lineTo(18, -18); ctx.lineTo(40, -8); ctx.stroke();
    // legs to pegs
    ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(4, -2); ctx.lineTo(14, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-16, -2); ctx.lineTo(-24, 10); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  drawRagdoll(ctx, cam) {
    const g = this.game;
    // the fallen bike where it landed
    const b = g.bike;
    ctx.save(); ctx.translate(b.x - cam.x, b.y - cam.y); ctx.rotate(b.a);
    if (this.spr.moto && this.spr.wheelR && this.spr.wheelF) { this.drawWheels(ctx); this.drawMotoSprite(ctx); }
    else this.drawBikeVector(ctx);
    ctx.restore();
    // ejected rider ("tombé" sprite): tumbles, then settles flat on the ground
    const rd = g.ragdoll;
    const p = (g.perso() === 'feminin' ? this.spr.downF : this.spr.downM);
    ctx.save(); ctx.translate(rd.x - cam.x, rd.y - cam.y); ctx.rotate(rd.a);
    if (p) { const s = this.bikeScale() * (g.props.taillePilote ?? 1.16) * 1.05; ctx.drawImage(p, -p.width * s * 0.5, -p.height * s * 0.66, p.width * s, p.height * s); }
    else this.drawSkeleton(ctx);
    ctx.restore();
  }

  finishFlag(ctx, cam) {
    const g = this.game, fx = g.finishX;
    if (fx < cam.x - 40 || fx > cam.x + g.W + 40) return;
    const gy = g.groundY(fx);
    ctx.save(); this.worldT(ctx, cam, fx, gy);
    ctx.strokeStyle = '#e8dcc4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -120); ctx.stroke();
    for (let r = 0; r < 5; r++) for (let cc = 0; cc < 3; cc++) { ctx.fillStyle = ((r + cc) % 2) ? '#1a0d05' : '#e8dcc4'; ctx.fillRect(2 + cc * 12, -118 + r * 11, 12, 11); }
    ctx.fillStyle = '#d9542e'; ctx.font = "700 13px 'Oswald'"; ctx.textAlign = 'left'; ctx.fillText('終 / FIN', 4, -6);
    ctx.restore();
  }

  speedLines(ctx, W, H) {
    // very discreet: only at high speed, few lines, low opacity
    const g = this.game;
    if (g.state.screen !== 'playing') return;
    const sp = Math.hypot(g.bike.vx, g.bike.vy);
    if (sp < 520) return;
    const a = Math.min(0.10, (sp - 520) / 4500);
    ctx.strokeStyle = 'rgba(255,220,170,' + a + ')'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const y = Math.random() * H; const len = 50 + Math.random() * 90; const x = Math.random() * W; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y); ctx.stroke(); }
  }
}
