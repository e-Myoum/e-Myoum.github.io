// Keyboard + on-screen touch controls. Exposes plain `.steer` (-1..1), `.gas`,
// `.brake` that the physics step reads every frame — everything else here is
// just the various ways those get set across desktop/mobile, plus menu keys.
export class InputController {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.steerL = false; this.steerR = false;
    this.gas = false; this.brake = false;

    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._bindPads();
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  get steer() { return (this.steerR ? 1 : 0) - (this.steerL ? 1 : 0); }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._padCleanup && this._padCleanup();
  }

  clear() { this.steerL = false; this.steerR = false; this.gas = false; this.brake = false; }

  _key(e, down) {
    const game = this.game;
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.code;
    if (k === 'Escape' || k === 'KeyP') {
      if (down) game.togglePause();
      return;
    }
    if (k === 'KeyR') { if (down) { e.preventDefault(); game.retry(); } return; }
    if (k === 'ArrowUp' || k === 'KeyW') { this.gas = down; e.preventDefault(); return; }
    if (k === 'ArrowDown' || k === 'KeyS') { this.brake = down; e.preventDefault(); return; }
    if (k === 'ArrowLeft' || k === 'KeyA') { this.steerL = down; e.preventDefault(); return; }
    if (k === 'ArrowRight' || k === 'KeyD') { this.steerR = down; e.preventDefault(); return; }
    if ((k === 'Space' || k === 'Enter') && down) {
      e.preventDefault();
      const s = game.state.screen;
      if (s === 'start') game.startRace();
      else if (s === 'finished') game.retry();
    }
  }

  // 4 on-screen buttons: steer-left/steer-right (bottom-left cluster) and
  // gas/brake (bottom-right cluster). Pointer + touch, both belt-and-suspenders
  // (some mobile browsers miss synthetic pointer events on held buttons).
  _bindPads() {
    const map = [
      ['btn-steer-l', 'steerL'], ['btn-steer-r', 'steerR'],
      ['btn-gas', 'gas'], ['btn-brake', 'brake'],
    ];
    const handlers = [];
    for (const [id, prop] of map) {
      const el = document.getElementById(id);
      if (!el) continue;
      const down = (e) => { if (e && e.preventDefault) e.preventDefault(); this[prop] = true; };
      const up = () => { this[prop] = false; };
      ['pointerdown'].forEach(ev => el.addEventListener(ev, down));
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, up));
      ['touchstart'].forEach(ev => el.addEventListener(ev, down, { passive: false }));
      ['touchend', 'touchcancel'].forEach(ev => el.addEventListener(ev, up));
      el.addEventListener('contextmenu', e => e.preventDefault());
      handlers.push([el, down, up]);
    }
    this._padCleanup = () => {
      for (const [el, down, up] of handlers) {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointerup', up); el.removeEventListener('pointerleave', up); el.removeEventListener('pointercancel', up);
        el.removeEventListener('touchstart', down); el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up);
      }
    };
  }
}
