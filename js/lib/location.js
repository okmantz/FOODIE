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

/** Persist a fix and derive hemisphere / units from it. */
async function applyFix(lat, lon, { acc = null, source = 'gps', info: given = null } = {}) {
  const prev = state.profile.homeLoc;
  const moved = !prev || miles(prev.lat, prev.lon, lat, lon) >= MOVE_MI;
  let info = given || (prev && !moved && prev.source === source ? { label: prev.label, city: prev.city, region: prev.region, cc: prev.cc, country: prev.country } : null);
  if (!info) info = (await reverse(lat, lon)) || { label: prev?.label || 'Your location', city: prev?.city || '', region: prev?.region || '', cc: prev?.cc || '', country: prev?.country || '' };
  commit((s) => {
    const p = s.profile;
    p.homeLoc = { lat: round5(lat), lon: round5(lon), acc: acc != null ? Math.round(acc) : null, ts: Date.now(), source, ...info };
    if (p.hemisphereAuto !== false) p.hemisphere = lat >= 0 ? 'north' : 'south';
    if (!p.unitsSet && info.cc) p.units = ['us', 'lr', 'mm'].includes(info.cc) ? 'us' : 'metric';
  }, { silent: true });
  lastFix = { lat, lon, acc, ts: Date.now() };
  emit();
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
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60e3, ...opts }));
}

/** Ask for / refresh the position once. Resolves {ok, moved, loc, error}. */
export async function refreshLocation({ force = false } = {}) {
  if (!('geolocation' in navigator)) { permission = 'unsupported'; emit(); return { ok: false, error: 'unsupported' }; }
  if (busy) return { ok: false, error: 'busy' };
  const have = state.profile.homeLoc;
  if (!force && have?.source === 'gps' && Date.now() - have.ts < 2 * 60e3) return { ok: true, moved: false, loc: have };
  busy = true; emit();
  try {
    const pos = await getOnce({});
    permission = 'granted';
    const r = await applyFix(pos.coords.latitude, pos.coords.longitude, { acc: pos.coords.accuracy });
    return { ok: true, ...r };
  } catch (e) {
    if (e && e.code === 1) permission = 'denied';
    return { ok: false, error: e?.code === 1 ? 'denied' : e?.code === 3 ? 'timeout' : 'unavailable' };
  } finally { busy = false; emit(); }
}

/** Follow the position while the app is on screen; stop when hidden to save battery. */
export function startLocation() {
  if (!('geolocation' in navigator) || permission === 'denied') return;
  refreshLocation();
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    if (accuracy > 5000) return;                       // ignore wildly imprecise (IP-based) fixes
    if (lastFix && miles(lastFix.lat, lastFix.lon, lat, lon) < MOVE_MI && Date.now() - lastFix.ts < STALE_MS) return;
    permission = 'granted';
    applyFix(lat, lon, { acc: accuracy });
  }, (e) => { if (e.code === 1) { permission = 'denied'; stopLocation(); emit(); } }, { enableHighAccuracy: false, maximumAge: 120e3, timeout: 30e3 });
}
export function stopLocation() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

/** Boot: start following, and refresh again every time the app returns to the foreground. */
export function initLocation() {
  checkPermission().then(() => { if (permission !== 'denied' && permission !== 'unsupported') startLocation(); else emit(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (permission !== 'denied') { startLocation(); refreshLocation({ force: Date.now() - (state.profile.homeLoc?.ts || 0) > 5 * 60e3 }); } }
    else stopLocation();
  });
  window.addEventListener('online', () => emit());
}

/** Fallback when GPS is denied/unavailable: geocode a ZIP / city / address. */
export async function setManualLocation(text) {
  const t = text.trim(); if (!t) return { ok: false, error: 'empty' };
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(t)}`, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    if (!j[0]) return { ok: false, error: 'notfound' };
    const a = j[0].address || {}; const cc = (a.country_code || '').toLowerCase();
    const city = a.city || a.town || a.village || a.suburb || a.county || '';
    const label = [city, cc === 'us' ? stateAbbr(a.state) || a.state : a.state || a.country].filter(Boolean).join(', ') || t;
    await applyFix(+j[0].lat, +j[0].lon, { source: 'manual', info: { label, city, region: a.state || '', cc, country: a.country || '' } });
    return { ok: true, loc: state.profile.homeLoc };
  } catch { return { ok: false, error: 'network' }; }
}

export function clearLocation() { commit((s) => { s.profile.homeLoc = null; }, { silent: true }); lastFix = null; emit(); }
