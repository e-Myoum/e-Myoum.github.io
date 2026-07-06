// Lightweight live-tuning panel: one slider per TWEAKS value, grouped by what
// they affect (pilot / wheels / chassis). No build step, no framework — just
// DOM nodes that write straight into `game.props`, which the renderer already
// reads every frame, so dragging a slider updates the game instantly.
// Toggle with the "⚙" tab; read off the numbers once happy and hardcode them
// back into TWEAKS (js/config.js) — this panel is a fitting tool, not a
// player-facing feature.
const GROUPS = [
  {
    label: 'PILOTE',
    fields: [
      { key: 'taillePilote', label: 'taille', min: 0.5, max: 2, step: 0.01 },
      { key: 'piloteX', label: 'pos X', min: -150, max: 150, step: 1 },
      { key: 'piloteY', label: 'pos Y', min: -150, max: 150, step: 1 },
      { key: 'piloteRot', label: 'rotation', min: -0.5, max: 0.5, step: 0.005 },
    ],
  },
  {
    label: 'ROUES',
    fields: [
      { key: 'tailleRoueAv', label: 'taille avant', min: 0.5, max: 2, step: 0.01 },
      { key: 'tailleRoueAr', label: 'taille arrière', min: 0.5, max: 2, step: 0.01 },
    ],
  },
  {
    label: 'MOTO (essieux)',
    fields: [
      { key: 'axeArX', label: 'arrière X', min: -50, max: 250, step: 1 },
      { key: 'axeArY', label: 'arrière Y', min: 0, max: 450, step: 1 },
      { key: 'axeAvX', label: 'avant X', min: 100, max: 550, step: 1 },
      { key: 'axeAvY', label: 'avant Y', min: 0, max: 450, step: 1 },
    ],
  },
];

export function initTweaksPanel(game) {
  const style = document.createElement('style');
  style.textContent = `
    #tweaks-tab {
      position: fixed; top: 50%; right: 0; transform: translateY(-50%);
      z-index: 20000; cursor: pointer; touch-action: manipulation;
      background: rgba(30,14,7,.92); color: #e8a94a; border: 2px solid #e8a94a; border-right: none;
      border-radius: 8px 0 0 8px; font: 13px/1 'Space Mono', monospace; padding: 10px 7px;
      writing-mode: vertical-rl;
    }
    #tweaks-panel {
      position: fixed; top: 0; right: 0; height: 100%; width: 260px; z-index: 19999;
      background: rgba(18,11,8,.94); color: #f4e6cf; font: 12px/1.3 'Space Mono', monospace;
      padding: 16px 14px; overflow-y: auto; box-sizing: border-box;
      border-left: 2px solid #e8a94a; transform: translateX(100%); transition: transform .2s ease;
    }
    #tweaks-panel.open { transform: translateX(0); }
    #tweaks-panel h3 { margin: 14px 0 6px; font-size: 11px; letter-spacing: .2em; color: #e8a94a; }
    #tweaks-panel h3:first-child { margin-top: 0; }
    #tweaks-panel .row { margin-bottom: 8px; }
    #tweaks-panel .row label { display: flex; justify-content: space-between; margin-bottom: 2px; color: #caa27a; }
    #tweaks-panel .row output { color: #ffd27a; }
    #tweaks-panel input[type=range] { width: 100%; }
    #tweaks-panel .dump { width: 100%; height: 90px; margin-top: 10px; font: 11px/1.3 'Space Mono', monospace;
      background: rgba(0,0,0,.35); color: #9fe89f; border: 1px solid #5c4a3a; padding: 6px; box-sizing: border-box; }
  `;
  document.head.appendChild(style);

  const tab = document.createElement('div');
  tab.id = 'tweaks-tab'; tab.textContent = '⚙ TWEAKS';
  const panel = document.createElement('div');
  panel.id = 'tweaks-panel';

  GROUPS.forEach(group => {
    const h = document.createElement('h3'); h.textContent = group.label; panel.appendChild(h);
    group.fields.forEach(f => {
      const row = document.createElement('div'); row.className = 'row';
      const label = document.createElement('label');
      const span = document.createElement('span'); span.textContent = f.label;
      const out = document.createElement('output'); out.textContent = game.props[f.key];
      label.appendChild(span); label.appendChild(out);
      const input = document.createElement('input');
      input.type = 'range'; input.min = f.min; input.max = f.max; input.step = f.step;
      input.value = game.props[f.key];
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        game.props[f.key] = v;
        out.textContent = v;
        dump.value = dumpText();
      });
      row.appendChild(label); row.appendChild(input);
      panel.appendChild(row);
    });
  });

  const dump = document.createElement('textarea');
  dump.className = 'dump'; dump.readOnly = true;
  const dumpText = () => GROUPS.flatMap(g => g.fields).map(f => `  ${f.key}: ${game.props[f.key]},`).join('\n');
  dump.value = dumpText();
  panel.appendChild(dump);

  tab.addEventListener('click', () => panel.classList.toggle('open'));

  document.body.appendChild(panel);
  document.body.appendChild(tab);
}
