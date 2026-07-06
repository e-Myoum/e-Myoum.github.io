// localStorage persistence for the arcade leaderboard and character choice.
// Isolated here so the rest of the app never touches localStorage directly.
const KEY_TOP5 = 'mm_top5';
const KEY_BEST = 'mm_best';
const KEY_PERSO = 'mm_perso';

export function loadTop5() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY_TOP5) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  return list.filter(e => e && typeof e.score === 'number').slice(0, 5);
}

export function loadBest(top5) {
  if (top5.length) return top5[0].score;
  return parseInt(localStorage.getItem(KEY_BEST) || '0', 10) || 0;
}

export function saveTop5(top5) {
  try {
    localStorage.setItem(KEY_TOP5, JSON.stringify(top5));
    localStorage.setItem(KEY_BEST, String(top5[0] ? top5[0].score : 0));
  } catch (e) { /* storage unavailable (private mode, quota, ...) — non-fatal */ }
}

export function loadPerso() {
  try {
    const p = localStorage.getItem(KEY_PERSO);
    return (p === 'feminin' || p === 'masculin') ? p : null;
  } catch (e) { return null; }
}

export function savePerso(p) {
  try { localStorage.setItem(KEY_PERSO, p); } catch (e) { /* ignore */ }
}
