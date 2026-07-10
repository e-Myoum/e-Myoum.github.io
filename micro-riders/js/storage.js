// Global best-times leaderboard, backed by the same public Firebase Realtime
// Database as Wasteland Riders — plain REST calls, just a different path so
// the two games don't share a leaderboard. Anyone can append a valid entry;
// the DB rules forbid editing/deleting existing ones, so "top 5" is just
// whatever the server returns, sorted client-side (lowest time first).
//
// Per-circuit boards are done by tagging each entry with a `track` field and
// filtering client-side, keeping every write at the same flat
// /microriders_scores path as before — NOT nested per track
// (/microriders_scores/<trackId>/...). An earlier version nested by track,
// which silently broke the leaderboard: the existing DB rules validate score
// entries one level below /microriders_scores, so a nested write landed a
// level too deep and got rejected there (or read back as {} client-side).
// Entries from before the kitchen circuit existed have no `track` field —
// treated as 'bedroom' so those old scores keep showing up.
const DB_URL = 'https://wasteland-riders-default-rtdb.europe-west1.firebasedatabase.app';
const PATH = '/microriders_scores.json';
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
    const res = await fetch(DB_URL + PATH);
    const body = await res.text();
    if (!res.ok) { console.error('[leaderboard] fetch failed', res.status, body); return loadCachedTop5(trackId); }
    const obj = body ? JSON.parse(body) : null;
    const list = obj ? Object.values(obj) : [];
    const filtered = list.filter(e => (e.track || 'bedroom') === trackId);
    filtered.sort((a, b) => a.time - b.time);
    const top5 = filtered.slice(0, 5);
    cacheTop5(trackId, top5);
    return top5;
  } catch (e) {
    console.error('[leaderboard] fetch error', e);
    return loadCachedTop5(trackId);
  }
}

export async function submitScore(trackId, name, time) {
  try {
    const res = await fetch(DB_URL + PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, time, ts: Date.now(), track: trackId }),
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
