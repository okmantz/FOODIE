/**
 * Live location for FOODIE.
 *
 * A web app can only read the device location while it is open (browsers do not
 * allow background tracking), so FOODIE asks as soon as it starts, follows you
 * while the app is visible, and refreshes whenever you come back to it. Every
 * fix is used to:
 *   • find real restaurants and grocery stores around you (OpenStreetMap)
 *   • pick the correct season (hemisphere) for seasonal recipes and plans
 *   • default your units (US vs metric) the first time
 *
 * The position is stored only in this browser. It is sent to two public,
 * key-free OpenStreetMap services — Nominatim (to turn coordinates into a town
 * name) and Overpass (to list places) — and nowhere else.
 */
import { state, commit } from '../store.js';

export const MOVE_MI = 0.25;          // re-query places after moving this far
export const STALE_MS = 20 * 60e3;    // …or after this long
const listeners = new Set();
let watchId = null;
let lastFix = null;                   // {lat, lon, acc, ts}
let permission = 'unknown';           // 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown'
let busy = false;

export const onLocation = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(getLoc()); } catch (e) { console.warn(e); } });

export const miles = (a, b, c, d) => {
  const R = 3958.8, rad = Math.PI / 180, dLat = (c - a) * rad, dLon = (d - b) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
/** Distance for display, in the user's unit system. */
export const fmtDist = (mi, units = state.profile.units) => (mi == null ? '' : units === 'metric' ? `${(mi * 1.609).toFixed(mi * 1.609 < 10 ? 1 : 0)} km` : `${mi.toFixed(mi < 10 ? 1 : 0)} mi`);

/** Current best-known location + how fresh it is. */
export function getLoc() {
  const h = state.profile.homeLoc;
  return { loc: h || null, permission, fresh: !!(h && Date.now() - (h.ts || 0) < STALE_MS), live: h?.source === 'gps', busy };
}
export const hasLoc = () => !!state.profile.homeLoc;
export const ageLabel = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

async function reverse(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&addressdetails=1&lat=${lat}&lon=${lon}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(); const a = j.address || {};
    const city = a.city || a.town || a.village || a.suburb || a.municipality || a.county || '';
    const region = a.state || a.region || '';
    const cc = (a.country_code || '').toLowerCase();
    const short = [city, cc === 'us' ? stateAbbr(region) || region : region || a.country].filter(Boolean).join(', ');
    return { label: short || 'Your location', city, region, cc, country: a.country || '' };
  } catch { return null; }
}

const ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC' };
const stateAbbr = (s) => ABBR[s] || '';

/** Persist a fix right away (so nothing waits on the network), then fill in the town name in the background. */
async function applyFix(lat, lon, { acc = null, source = 'gps', info: given = null } = {}) {
  const prev = state.profile.homeLoc;
  const moved = !prev || miles(prev.lat, prev.lon, lat, lon) >= MOVE_MI;
  let info = given || (prev && !moved ? { label: prev.label, city: prev.city, region: prev.region, cc: prev.cc, country: prev.country } : null);
  const needName = !info;
  if (!info) info = { label: prev?.label && !moved ? prev.label : 'Your location', city: '', region: '', cc: prev?.cc || '', country: prev?.country || '' };
  const write = (inf) => commit((s) => {
    const p = s.profile;
    p.homeLoc = { lat: round5(lat), lon: round5(lon), acc: acc != null ? Math.round(acc) : null, ts: Date.now(), source, ...inf };
    if (p.hemisphereAuto !== false) p.hemisphere = lat >= 0 ? 'north' : 'south';
    if (!p.unitsSet && inf.cc) p.units = ['us', 'lr', 'mm'].includes(inf.cc) ? 'us' : 'metric';
  }, { silent: true });
  write(info);
  lastFix = { lat, lon, acc, ts: Date.now() };
  emit();
  if (needName) reverse(lat, lon).then((r) => { const h = state.profile.homeLoc; if (r && h && h.lat === round5(lat) && h.lon === round5(lon)) { write(r); emit(); } });
  return { moved, loc: state.profile.homeLoc };
}
const round5 = (n) => Math.round(n * 1e5) / 1e5;

export async function checkPermission() {
  if (!('geolocation' in navigator)) { permission = 'unsupported'; return permission; }
  try {
    if (navigator.permissions?.query) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      permission = st.state; st.onchange = () => { permission = st.state; if (st.state === 'granted') startLocation(); emit(); };
    }
  } catch { /* Safari: unknown until asked */ }
  return permission;
}

function getOnce(opts) {
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60e3, ...opts }));
}
/** Race a quick network/cached fix against a precise GPS fix; the first usable one wins, the better one refines it. */
async function fastFix() {
  const quick = getOnce({ timeout: 6000, maximumAge: 15 * 60e3 });
  const precise = getOnce({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  precise.catch(() => {}); quick.catch(() => {});
  let first;
  try { first = await Promise.any([quick, precise]); } catch (e) { throw e.errors?.find((x) => x?.code === 1) || e.errors?.[0] || e; }
  precise.then((p) => { if (p.coords.accuracy < (first.coords.accuracy || 1e9) * 0.8) applyFix(p.coords.latitude, p.coords.longitude, { acc: p.coords.accuracy }); }).catch(() => {});
  return first;
}
/** Accuracy worse than this is almost certainly an IP-based guess (often the wrong city/country). */
export const COARSE_M = 20000;

/** Use the saved ZIP when live location is missing or unreliable. */
export async function useSavedZip() {
  const z = (state.profile.zip || '').trim(); if (!z) return { ok: false, error: 'nozip' };
  const zl = state.profile.zipLoc;
  if (zl && zl.zip === z) { await applyFix(zl.lat, zl.lon, { source: 'zip', info: zl.info }); return { ok: true, loc: state.profile.homeLoc }; }
  const r = await setManualLocation(z, { source: 'zip' });
  if (r.ok) commit((s) => { const h = s.profile.homeLoc; s.profile.zipLoc = { zip: z, lat: h.lat, lon: h.lon, info: { label: h.label, city: h.city, region: h.region, cc: h.cc, country: h.country } }; }, { silent: true });
  return r;
}

/** Ask for / refresh the position once. Resolves {ok, moved, loc, error}. Falls back to the saved ZIP. */
export async function refreshLocation({ force = false } = {}) {
  if (busy) return { ok: false, error: 'busy' };
  const have = state.profile.homeLoc;
  if (!force && have?.source === 'gps' && Date.now() - have.ts < 2 * 60e3) return { ok: true, moved: false, loc: have };
  busy = true; emit();
  try {
    if (!('geolocation' in navigator)) { permission = 'unsupported'; const z = await useSavedZip(); return z.ok ? { ...z, viaZip: true } : { ok: false, error: 'unsupported' }; }
    try {
      const pos = await fastFix();
      permission = 'granted';
      if (pos.coords.accuracy > COARSE_M && state.profile.zip) { const z = await useSavedZip(); if (z.ok) return { ...z, viaZip: true }; }
      const r = await applyFix(pos.coords.latitude, pos.coords.longitude, { acc: pos.coords.accuracy });
      return { ok: true, ...r };
    } catch (e) {
      if (e && e.code === 1) permission = 'denied';
      const z = await useSavedZip();
      if (z.ok) return { ...z, viaZip: true };
      return { ok: false, error: e?.code === 1 ? 'denied' : e?.code === 3 ? 'timeout' : 'unavailable' };
    }
  } finally { busy = false; emit(); }
}

/** Follow the position while the app is on screen; stop when hidden to save battery. */
export function startLocation() {
  if (!state.profile.homeLoc && state.profile.zip) useSavedZip();     // instant place to show while GPS warms up
  if (!('geolocation' in navigator) || permission === 'denied') return;
  refreshLocation();
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    if (accuracy > COARSE_M) return;                    // ignore wildly imprecise (IP-based) fixes
    if (lastFix && miles(lastFix.lat, lastFix.lon, lat, lon) < MOVE_MI && Date.now() - lastFix.ts < STALE_MS) return;
    permission = 'granted';
    applyFix(lat, lon, { acc: accuracy });
  }, (e) => { if (e.code === 1) { permission = 'denied'; stopLocation(); emit(); } }, { enableHighAccuracy: false, maximumAge: 5 * 60e3, timeout: 30e3 });
}
export function stopLocation() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

/** Boot: start following, and refresh again every time the app returns to the foreground. */
export function initLocation() {
  checkPermission().then(() => { if (permission !== 'denied' && permission !== 'unsupported') startLocation(); else { if (state.profile.zip && (!state.profile.homeLoc || state.profile.homeLoc.source !== 'zip')) useSavedZip(); emit(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (permission !== 'denied') { startLocation(); refreshLocation({ force: Date.now() - (state.profile.homeLoc?.ts || 0) > 5 * 60e3 }); } }
    else stopLocation();
  });
  window.addEventListener('online', () => emit());
}

/** Look up a ZIP / postal code / city / address. US ZIPs use a fast dedicated lookup first, then OpenStreetMap. */
async function geocode(t) {
  const out = (lat, lon, a, fallback) => {
    const cc = (a.country_code || a.cc || '').toLowerCase();
    const city = a.city || a.town || a.village || a.suburb || a.county || '';
    const label = [city, cc === 'us' ? stateAbbr(a.state) || a.state : a.state || a.country].filter(Boolean).join(', ') || fallback;
    return { lat, lon, info: { label, city, region: a.state || '', cc, country: a.country || '' } };
  };
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  if (/^\d{5}(-\d{4})?$/.test(t)) {
    try {
      const r = await fetch(`https://api.zippopotam.us/us/${t.slice(0, 5)}`, { signal: timeout(6000) });
      if (r.ok) { const j = await r.json(); const pl = j.places?.[0]; if (pl) return out(+pl.latitude, +pl.longitude, { city: pl['place name'], state: pl.state, country_code: 'us', country: 'United States' }, t); }
    } catch { /* fall through to OpenStreetMap */ }
  }
  const zipLike = /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(t) && /\d/.test(t) && !/\s.*\s.*\s/.test(t);
  const q = zipLike && /^\d{5}(-\d{4})?$/.test(t) ? `postalcode=${encodeURIComponent(t.slice(0, 5))}&countrycodes=us` : `q=${encodeURIComponent(t)}`;
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&${q}`, { headers: { Accept: 'application/json' }, signal: timeout(9000) });
  const j = await r.json();
  if (!j[0]) return null;
  return out(+j[0].lat, +j[0].lon, j[0].address || {}, t);
}

export async function setManualLocation(text, { source = 'manual' } = {}) {
  const t = text.trim(); if (!t) return { ok: false, error: 'empty' };
  try {
    const g = await geocode(t);
    if (!g) return { ok: false, error: 'notfound' };
    await applyFix(g.lat, g.lon, { source, info: g.info });
    return { ok: true, loc: state.profile.homeLoc };
  } catch { return { ok: false, error: 'network' }; }
}

/** Save a ZIP to the profile and switch to it right away. */
export async function saveZip(text) {
  const z = text.trim();
  if (!z) { commit((s) => { s.profile.zip = ''; s.profile.zipLoc = null; }, { silent: true }); emit(); return { ok: true, cleared: true }; }
  const r = await setManualLocation(z, { source: 'zip' });
  if (r.ok) commit((s) => { const h = s.profile.homeLoc; s.profile.zip = z; s.profile.zipLoc = { zip: z, lat: h.lat, lon: h.lon, info: { label: h.label, city: h.city, region: h.region, cc: h.cc, country: h.country } }; }, { silent: true });
  return r;
}

export function clearLocation() { commit((s) => { s.profile.homeLoc = null; }, { silent: true }); lastFix = null; emit(); }
