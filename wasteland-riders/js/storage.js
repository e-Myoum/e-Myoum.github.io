// Global arcade leaderboard, backed by a public Firebase Realtime Database —
// plain REST calls (no SDK needed). Anyone can append a valid score entry;
// the DB rules forbid editing or deleting existing ones, so the "top 5" is
// just whatever the server-side query returns, never something we curate
// and overwrite from the client. A localStorage cache keeps the last-seen
// list around so the start screen has something to paint before the network
// round-trip resolves (or if it's offline).
const DB_URL = 'https://wasteland-riders-default-rtdb.europe-west1.firebasedatabase.app';
const KEY_TOP5_CACHE = 'mm_top5_cache';
const KEY_PERSO = 'mm_perso';

export function loadCachedTop5() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY_TOP5_CACHE) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  return list.filter(e => e && typeof e.score === 'number').slice(0, 5);
}

function cacheTop5(top5) {
  try { localStorage.setItem(KEY_TOP5_CACHE, JSON.stringify(top5)); } catch (e) { /* storage unavailable — non-fatal */ }
}

// Pulls the 5 highest scores across everyone who's played. Falls back to the
// local cache (last successful fetch) if the network/DB is unreachable.
export async function fetchTop5() {
  try {
    const res = await fetch(DB_URL + '/scores.json?orderBy=' + encodeURIComponent('"score"') + '&limitToLast=5');
    if (!res.ok) throw new Error('bad response');
    const obj = await res.json();
    const list = obj ? Object.values(obj) : [];
    list.sort((a, b) => b.score - a.score);
    cacheTop5(list);
    return list;
  } catch (e) {
    return loadCachedTop5();
  }
}

// Appends a new score (never edits/deletes — the DB rules wouldn't allow it
// anyway), then returns the refreshed global top 5.
export async function submitScore(name, score) {
  try {
    await fetch(DB_URL + '/scores.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, ts: Date.now() }),
    });
  } catch (e) { /* offline — the score just won't show up on other devices */ }
  return fetchTop5();
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
