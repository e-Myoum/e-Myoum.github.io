// Global best-times leaderboard, backed by the same public Firebase Realtime
// Database as Wasteland Riders — plain REST calls, just a different path so
// the two games don't share a leaderboard. Anyone can append a valid entry;
// the DB rules forbid editing/deleting existing ones, so "top 5" is just
// whatever the server returns, sorted client-side (lowest time first).
// Scores are nested one level by circuit (/microriders_scores/<trackId>/...)
// rather than a new sibling path per track — lap times aren't comparable
// across circuits of very different length, and nesting stays inside the
// already-allowed /microriders_scores subtree instead of needing new DB
// rules added for each future track (see the microriders_scores rules fix).
const DB_URL = 'https://wasteland-riders-default-rtdb.europe-west1.firebasedatabase.app';
const pathFor = (trackId) => '/microriders_scores/' + trackId + '.json';
const KEY_TOP5_CACHE = 'mr_top5_cache_';
const KEY_PREFS = 'mr_prefs';

export function loadCachedTop5(trackId) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY_TOP5_CACHE + trackId) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  return list.filter(e => e && typeof e.time === 'number').slice(0, 5);
}

function cacheTop5(trackId, top5) {
  try { localStorage.setItem(KEY_TOP5_CACHE + trackId, JSON.stringify(top5)); } catch (e) { /* storage unavailable — non-fatal */ }
}

export async function fetchTop5(trackId) {
  try {
    const res = await fetch(DB_URL + pathFor(trackId));
    const body = await res.text();
    if (!res.ok) { console.error('[leaderboard] fetch failed', res.status, body); return loadCachedTop5(trackId); }
    const obj = body ? JSON.parse(body) : null;
    const list = obj ? Object.values(obj) : [];
    list.sort((a, b) => a.time - b.time);
    const top5 = list.slice(0, 5);
    cacheTop5(trackId, top5);
    return top5;
  } catch (e) {
    console.error('[leaderboard] fetch error', e);
    return loadCachedTop5(trackId);
  }
}

export async function submitScore(trackId, name, time) {
  try {
    const res = await fetch(DB_URL + pathFor(trackId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, time, ts: Date.now() }),
    });
    const body = await res.text();
    if (!res.ok) console.error('[leaderboard] submit rejected', res.status, body);
  } catch (e) {
    console.error('[leaderboard] submit error (offline?)', e);
  }
  return fetchTop5(trackId);
}

export function loadPrefs() {
  const def = { carId: 'buggy', color: '#e6402c', difficulty: 'normal', trackId: 'bedroom' };
  try {
    const p = JSON.parse(localStorage.getItem(KEY_PREFS) || 'null');
    if (!p) return def;
    return { carId: p.carId || def.carId, color: p.color || def.color, difficulty: p.difficulty || def.difficulty, trackId: p.trackId || def.trackId };
  } catch (e) { return def; }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(KEY_PREFS, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
}
