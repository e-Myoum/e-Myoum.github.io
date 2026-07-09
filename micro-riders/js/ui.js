import { CARS, COLOR_SWATCHES, DIFFICULTIES } from './config.js';
import { TRACK_LIST } from './tracks/index.js';
import { carSpeedKmh } from './car.js';

const toCamel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

const OVERLAY_IDS = [
  'screen-start', 'screen-countdown', 'screen-paused', 'screen-finished',
  'circuit-tagline', 'track-select', 'car-select', 'color-select', 'diff-select', 'top5-start', 'top5-start-list',
  'countdown-num',
  'final-standings', 'player-time', 'entry-wrap', 'table-wrap', 'top5-finish', 'top5-finish-list',
];
const HUD_KEYS = ['wrap', 'pads', 'position', 'lap', 'time', 'speed'];

export function fmtTime(s) {
  if (s == null) return '--:--.-';
  const m = Math.floor(s / 60), rem = s - m * 60;
  return m + ':' + rem.toFixed(1).padStart(4, '0');
}

// Screen/overlay switching, the selection screen widgets, and the per-frame
// HUD text. `applyState` runs on screen transitions and selection changes;
// `updateHud` runs every animation frame while a race is live.
export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.els = {};
    OVERLAY_IDS.forEach(id => { this.els[toCamel(id)] = document.getElementById(id); });
    this.hud = {};
    HUD_KEYS.forEach(k => { this.hud[k] = root.querySelector('[data-hud="' + k + '"]'); });
    this._buildSelectionWidgets();
    this._bindButtons();
  }

  _buildSelectionWidgets() {
    const g = this.game;
    if (this.els.trackSelect) {
      this.els.trackSelect.innerHTML = '';
      TRACK_LIST.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'car-btn'; btn.dataset.track = t.id;
        btn.innerHTML = '<span class="car-btn-name">' + t.label + '</span><span class="car-btn-tag">' + t.tagline + '</span>';
        btn.addEventListener('click', () => g.setTrackSel(t.id));
        this.els.trackSelect.appendChild(btn);
      });
    }
    if (this.els.carSelect) {
      this.els.carSelect.innerHTML = '';
      CARS.forEach(car => {
        const btn = document.createElement('button');
        btn.className = 'car-btn'; btn.dataset.car = car.id;
        btn.innerHTML = '<span class="car-btn-name">' + car.name + '</span><span class="car-btn-tag">' + car.tagline + '</span>';
        btn.addEventListener('click', () => g.setCarSel(car.id));
        this.els.carSelect.appendChild(btn);
      });
    }
    if (this.els.colorSelect) {
      this.els.colorSelect.innerHTML = '';
      COLOR_SWATCHES.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'swatch-btn'; btn.style.background = color; btn.dataset.color = color;
        btn.addEventListener('click', () => g.setColorSel(color));
        this.els.colorSelect.appendChild(btn);
      });
    }
    if (this.els.diffSelect) {
      this.els.diffSelect.innerHTML = '';
      Object.entries(DIFFICULTIES).forEach(([key, d]) => {
        const btn = document.createElement('button');
        btn.className = 'diff-btn'; btn.dataset.diff = key; btn.textContent = d.label;
        btn.addEventListener('click', () => g.setDiffSel(key));
        this.els.diffSelect.appendChild(btn);
      });
    }
  }

  _bindButtons() {
    const g = this.game;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-pause', () => g.togglePause());
    on('btn-start', () => g.startRace());
    on('btn-resume', () => g.togglePause());
    on('btn-menu-pause', () => g.toMenu());
    on('btn-retry', () => g.retry());
    on('btn-menu-finish', () => g.toMenu());
    on('btn-savescore', () => g.saveScore());
  }

  renderTop5(container, list, fmt) {
    if (!container) return;
    container.innerHTML = '';
    list.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'top5-row';
      const rank = document.createElement('span'); rank.textContent = (i + 1) + '. ' + e.name;
      const time = document.createElement('span'); time.className = 'score'; time.textContent = fmt(e.time);
      row.appendChild(rank); row.appendChild(time);
      container.appendChild(row);
    });
  }

  renderStandings(list) {
    const container = this.els.finalStandings;
    if (!container) return;
    container.innerHTML = '';
    list.forEach(s => {
      const row = document.createElement('div');
      row.className = 'standing-row' + (s.isPlayer ? ' me' : '');
      const rank = document.createElement('span'); rank.className = 'standing-rank'; rank.textContent = s.rank + (s.rank === 1 ? 'er' : 'e');
      const name = document.createElement('span'); name.className = 'standing-name'; name.textContent = s.name;
      const time = document.createElement('span'); time.className = 'standing-time'; time.textContent = s.time != null ? fmtTime(s.time) : '—';
      row.appendChild(rank); row.appendChild(name); row.appendChild(time);
      container.appendChild(row);
    });
  }

  applyState(state) {
    const el = this.els, st = state;
    el.screenStart.hidden = st.screen !== 'start';
    el.screenCountdown.hidden = st.screen !== 'countdown';
    el.screenPaused.hidden = st.screen !== 'paused';
    el.screenFinished.hidden = st.screen !== 'finished';

    if (el.trackSelect) Array.from(el.trackSelect.children).forEach(b => b.classList.toggle('active', b.dataset.track === st.trackSel));
    if (el.circuitTagline) {
      const t = TRACK_LIST.find(t => t.id === st.trackSel) || TRACK_LIST[0];
      el.circuitTagline.textContent = 'CIRCUIT ・ ' + t.label;
    }
    if (el.carSelect) Array.from(el.carSelect.children).forEach(b => b.classList.toggle('active', b.dataset.car === st.carSel));
    if (el.colorSelect) Array.from(el.colorSelect.children).forEach(b => b.classList.toggle('active', b.dataset.color === st.colorSel));
    if (el.diffSelect) Array.from(el.diffSelect.children).forEach(b => b.classList.toggle('active', b.dataset.diff === st.diffSel));

    this.renderTop5(el.top5StartList, st.top5, fmtTime);
    if (el.top5Start) el.top5Start.hidden = st.top5.length === 0;

    if (st.screen === 'countdown' && el.countdownNum) {
      el.countdownNum.textContent = st.countdown > 0 ? String(st.countdown) : 'GO !';
    }

    if (st.screen === 'finished') {
      this.renderStandings(st.standings);
      if (el.playerTime) el.playerTime.textContent = fmtTime(st.playerTime);
      const entryOpen = st.qualifies && !st.saved;
      if (el.entryWrap) el.entryWrap.hidden = !entryOpen;
      if (el.tableWrap) el.tableWrap.hidden = entryOpen;
      if (!entryOpen) {
        this.renderTop5(el.top5FinishList, st.top5, fmtTime);
        if (el.top5Finish) el.top5Finish.hidden = st.top5.length === 0;
      }
    }
  }

  updateHud() {
    if (!this.hud.position || !this.hud.position.isConnected) {
      HUD_KEYS.forEach(k => { this.hud[k] = this.root.querySelector('[data-hud="' + k + '"]'); });
      if (!this.hud.position) return;
    }
    const g = this.game, live = g.state.screen === 'playing' || g.state.screen === 'countdown';
    if (this.hud.wrap) this.hud.wrap.style.opacity = live ? 1 : 0;
    if (this.hud.pads) this.hud.pads.style.opacity = g.state.screen === 'playing' ? 1 : 0;
    if (!live) return;
    const st = g.state;
    this.hud.position.textContent = st.position + (st.position === 1 ? 'er' : 'e');
    this.hud.lap.textContent = 'TOUR ' + st.lap + '/' + st.laps;
    this.hud.time.textContent = fmtTime(g.raceTime || 0);
    if (this.hud.speed) this.hud.speed.textContent = carSpeedKmh(g.player);
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
