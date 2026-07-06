import { Game } from './game.js';
import { initTweaksPanel } from './tweaks.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game(document.getElementById('game-root'));
  initTweaksPanel(game);
});
