const toCamel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

const OVERLAY_IDS = [
  'screen-start', 'screen-pause', 'screen-crashed', 'screen-gameover', 'screen-complete',
  'game-title', 'btn-perso-m', 'btn-perso-f', 'top5-start', 'top5-start-list',
  'crash-lives', 'crash-cs', 'crash-cf', 'crash-banked',
  'go-finalscore', 'entry-wrap', 'table-wrap', 'top5-go', 'top5-go-list',
  'complete-kt', 'complete-kb', 'complete-ks', 'complete-banked',
];
const HUD_KEYS = ['wrap', 'pads', 'score', 'combo', 'speed', 'dist', 'lvl', 'progfill', 'trick', 'lives'];

// Screen/overlay switching and the per-frame HUD text. Two separate update
// rhythms on purpose: `applyState` runs only on screen transitions (menu
// navigation, crash, game over, ...), `updateHud` runs every animation frame
// while playing (score/speed/distance/combo).
export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.els = {};
    OVERLAY_IDS.forEach(id => { this.els[toCamel(id)] = document.getElementById(id); });
    this.hud = {};
    HUD_KEYS.forEach(k => { this.hud[k] = root.querySelector('[data-hud="' + k + '"]'); });
    this._bindButtons();
  }

  _bindButtons() {
    const g = this.game;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-pause', () => { if (g.state.screen === 'playing') { g.input.gas = false; g.input.brake = false; g.setState({ screen: 'paused' }); } });
    on('btn-newgame', () => g.newGame());
    on('btn-newgame-go', () => g.newGame());
    on('btn-perso-m', () => g.setPerso('masculin'));
    on('btn-perso-f', () => g.setPerso('feminin'));
    on('btn-resume', () => { if (g.state.screen === 'paused') g.setState({ screen: 'playing' }); });
    on('btn-menu-pause', () => g.toMenu());
    on('btn-menu-go', () => g.toMenu());
    on('btn-retry', () => g.retry());
    on('btn-next', () => g.nextLevel());
    on('btn-savescore', () => g.saveScore());
  }

  livesStr(lives) { return '▲'.repeat(Math.max(0, lives)) + '△'.repeat(Math.max(0, 3 - lives)); }

  renderTop5(container, list) {
    container.innerHTML = '';
    list.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'top5-row';
      const rank = document.createElement('span'); rank.textContent = (i + 1) + '. ' + e.name;
      const score = document.createElement('span'); score.className = 'score'; score.textContent = e.score;
      row.appendChild(rank); row.appendChild(score);
      container.appendChild(row);
    });
  }

  // called on every screen/state transition (see Game#setState)
  applyState(state) {
    const el = this.els, st = state;
    el.screenStart.hidden = st.screen !== 'start';
    el.screenPause.hidden = st.screen !== 'paused';
    el.screenCrashed.hidden = st.screen !== 'crashed';
    el.screenGameover.hidden = st.screen !== 'gameover';
    el.screenComplete.hidden = st.screen !== 'complete';

    const persoF = this.game.perso() === 'feminin';
    el.gameTitle.textContent = persoF ? 'LOU' : 'JOE';
    el.btnPersoM.classList.toggle('active', !persoF);
    el.btnPersoF.classList.toggle('active', persoF);

    this.renderTop5(el.top5StartList, st.top5);
    el.top5Start.hidden = st.top5.length === 0;

    if (st.screen === 'crashed') {
      el.crashLives.textContent = this.livesStr(st.lives);
      el.crashCs.textContent = st.cs;
      el.crashCf.textContent = st.cf;
      el.crashBanked.textContent = st.banked;
    }
    if (st.screen === 'gameover') {
      el.goFinalscore.textContent = st.finalScore;
      const entryOpen = st.qualifies && !st.saved;
      el.entryWrap.hidden = !entryOpen;
      el.tableWrap.hidden = entryOpen;
      if (!entryOpen) {
        this.renderTop5(el.top5GoList, st.top5);
        el.top5Go.hidden = st.top5.length === 0;
      }
    }
    if (st.screen === 'complete') {
      el.completeKt.textContent = st.kt;
      el.completeKb.textContent = st.kb;
      el.completeKs.textContent = st.ks;
      el.completeBanked.textContent = st.banked;
    }
  }

  // called every animation frame while the run loop is active (see Game#loop)
  updateHud(playing) {
    const g = this.game;
    // heal stale references if the DOM nodes were ever recreated
    if (!this.hud.score || !this.hud.score.isConnected) {
      HUD_KEYS.forEach(k => { this.hud[k] = this.root.querySelector('[data-hud="' + k + '"]'); });
      if (!this.hud.score) return;
    }
    if (this.hud.wrap) this.hud.wrap.style.opacity = (playing && !g.hudFrozen) ? 1 : 0;
    if (this.hud.pads) this.hud.pads.style.opacity = (playing && !g.hudFrozen) ? 1 : 0;
    if (!playing || g.hudFrozen) return;
    const b = g.bike;
    this.hud.score.textContent = g.banked + g.runScore();
    if (this.hud.lives) this.hud.lives.textContent = this.livesStr(g.lives);
    this.hud.speed.textContent = Math.round(Math.hypot(b.vx, b.vy) * 0.14);
    this.hud.dist.textContent = Math.floor(b.x / 10) + ' M';
    this.hud.lvl.textContent = '砂漠 ' + String(g.level).padStart(2, '0');
    const pr = Math.max(0, Math.min(100, (b.x / g.finishX) * 100));
    this.hud.progfill.style.width = pr + '%';
    if (g.combo > 1) { this.hud.combo.style.opacity = 1; this.hud.combo.textContent = 'COMBO ×' + g.combo; }
    else this.hud.combo.style.opacity = 0;
  }

  // trick/score popup text (e.g. "BACKFLIP  +150"); queued so simultaneous
  // awards (a flip plus an AIR bonus) show one after another, not overwritten
  showPopup(msg) {
    const el = this.root.querySelector('[data-hud="trick"]');
    if (!el) return;
    el.textContent = msg;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'mmpop 1.05s ease-out forwards';
  }

  focusPseudoInput() {
    const el = this.root.querySelector('[data-hud="pseudo"]');
    if (el) el.focus();
  }

  pseudoValue() {
    const el = this.root.querySelector('[data-hud="pseudo"]');
    return el ? el.value : '';
  }
}
