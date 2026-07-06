// Keyboard, mouse and touch input. Exposes plain `.gas`/`.brake` booleans that
// the physics step reads every frame; everything else here is just the various
// ways a player can set them (or trigger menu actions) across desktop/mobile.
export class InputController {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.gas = false;
    this.brake = false;

    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._bindPads();
    this._bindFullScreenTouch();
    this._bindMouseCapture();
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._touchEvts.forEach(ev => this.root.removeEventListener(ev, this._onTouch));
    this.root.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onMouseUp);
  }

  _key(e, down) {
    const game = this.game;
    if (e.target && e.target.tagName === 'INPUT') {
      if (down && (e.code === 'Enter' || e.code === 'NumpadEnter')) game.saveScore();
      return;
    }
    const k = e.code;
    if (k === 'KeyR') { if (down) { e.preventDefault(); game.newGame(); } return; }
    if (k === 'Escape' || k === 'KeyP') {
      if (down) {
        if (game.state.screen === 'playing') { this.gas = false; this.brake = false; game.setState({ screen: 'paused' }); }
        else if (game.state.screen === 'paused') game.setState({ screen: 'playing' });
      }
      return;
    }
    if (k === 'ArrowRight' || k === 'KeyD') { this.gas = down; e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'KeyA') { this.brake = down; e.preventDefault(); }
    else if ((k === 'Space' || k === 'Enter') && down) {
      e.preventDefault();
      const s = game.state.screen;
      if (s === 'start') game.newGame();
      else if (s === 'crashed') game.retry();
      else if (s === 'complete') game.nextLevel();
      else if (s === 'gameover' && !(game.state.qualifies && !game.state.saved)) game.newGame();
    }
  }

  // GAZ/FREIN on-screen buttons: pointer + touch, both belt-and-suspenders
  // (some mobile browsers miss synthetic pointer events on held buttons)
  _bindPads() {
    const gasBtn = document.getElementById('btn-gas'), brakeBtn = document.getElementById('btn-brake');
    const gasDown = (e) => { if (e && e.preventDefault) e.preventDefault(); this.gas = true; };
    const gasUp = () => { this.gas = false; };
    const brakeDown = (e) => { if (e && e.preventDefault) e.preventDefault(); this.brake = true; };
    const brakeUp = () => { this.brake = false; };
    ['pointerdown'].forEach(ev => { gasBtn.addEventListener(ev, gasDown); brakeBtn.addEventListener(ev, brakeDown); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => { gasBtn.addEventListener(ev, gasUp); brakeBtn.addEventListener(ev, brakeUp); });
    ['touchstart'].forEach(ev => { gasBtn.addEventListener(ev, gasDown, { passive: false }); brakeBtn.addEventListener(ev, brakeDown, { passive: false }); });
    ['touchend', 'touchcancel'].forEach(ev => { gasBtn.addEventListener(ev, gasUp); brakeBtn.addEventListener(ev, brakeUp); });
    [gasBtn, brakeBtn].forEach(b => b.addEventListener('contextmenu', e => e.preventDefault()));
  }

  // native full-screen touch capture (bypasses synthetic events — reliable on iOS + Android):
  // left half of the screen = brake, right half = gas; multi-touch aware
  _bindFullScreenTouch() {
    this._onTouch = (e) => {
      if (this.game.state.screen !== 'playing') return;
      const r = this.root.getBoundingClientRect();
      let gas = false, brake = false, onGameArea = false;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const btn = t.target && t.target.closest ? t.target.closest('button') : null;
        if (btn) {
          const ctl = btn.getAttribute('data-ctl');
          if (ctl === 'gas') gas = true; else if (ctl === 'brake') brake = true;
        } else {
          onGameArea = true;
          if (t.clientX > r.left + r.width / 2) gas = true; else brake = true;
        }
      }
      this.gas = gas; this.brake = brake;
      if (onGameArea && e.cancelable) e.preventDefault();   // block scroll/zoom while driving
    };
    this._touchEvts = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    this._touchEvts.forEach(ev => this.root.addEventListener(ev, this._onTouch, { passive: false }));
  }

  // native mouse capture for the GAZ/FREIN buttons (works even when synthetic pointer events don't)
  _bindMouseCapture() {
    this._onMouseDown = (e) => {
      if (this.game.state.screen !== 'playing') return;
      const btn = e.target && e.target.closest ? e.target.closest('[data-ctl]') : null;
      if (!btn) return;
      e.preventDefault();
      const ctl = btn.getAttribute('data-ctl') === 'gas' ? 'gas' : 'brake';
      this[ctl] = true; this._mouseCtl = ctl;
    };
    this._onMouseUp = () => { if (this._mouseCtl) { this[this._mouseCtl] = false; this._mouseCtl = null; } };
    this.root.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onMouseUp);
  }
}
