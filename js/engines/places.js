/**
 * Real places around you, from OpenStreetMap (free, no API key).
 *
 *  • restaurants / fast food / cafés  → recommendations, quiz results, directory
 *  • supermarkets & specialty grocers  → "stores near you" for shopping
 *
 * Results are cached on-device (separate key, so backups stay small) and
 * refreshed automatically when your location changes or the cache goes stale.
 * OpenStreetMap is volunteer-maintained: it has names, cuisine tags, addresses
 * and often opening hours — but NOT ratings, prices or live menus. FOODIE never
 * invents those; anything estimated is labelled as such.
 */
import { state } from '../store.js';
import { OSM_CUISINE_MAP, EXTRA_FLAVORS } from '../data/restaurants.js';
import { CUISINE_FLAVORS } from './nutrition.js';
import { chainOf } from '../data/stores.js';
import { miles, onLocation, getLoc, MOVE_MI } from '../lib/location.js';

const CACHE_KEY = 'foodie:places:v3';
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const RADII = [3000, 8000, 16000];
const TTL = 6 * 3600e3;

export const places = { status: 'idle', food: [], stores: [], ts: 0, at: null, radius: 0, error: '' };
const subs = new Set();
export const onPlaces = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => { try { fn(places); } catch (e) { console.warn(e); } });

/* ------------------------------------------------------------------ opening hours */
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const hm = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? +m[1] * 60 + +m[2] : NaN; };
const t12 = (min) => { const m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };

/** Parse the common subset of OSM `opening_hours`. Returns [[intervals] x 7] (index = JS weekday) or null if too exotic. */
export function parseHours(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/^24\/7$/i.test(s)) return Array.from({ length: 7 }, () => [[0, 1440]]);
  if (/sunrise|sunset|dawn|dusk|week|\[|easter|"|\bopen\b|\bby appointment\b|\+/i.test(s)) return null;
  const days = Array.from({ length: 7 }, () => []); let seen = false;
  for (const raw of s.split(';')) {
    const rule = raw.trim(); if (!rule) continue;
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const dayPart = m[1], timePart = m[2].trim();
    let target = [0, 1, 2, 3, 4, 5, 6];
    if (dayPart) {
      target = [];
      for (const tok of dayPart.split(',').map((x) => x.trim())) {
        if (tok === 'PH') continue;
        const [a, b] = tok.split('-'); const ia = DAYS.indexOf(a);
        if (!b) target.push(ia); else { let i = ia; const ib = DAYS.indexOf(b); for (let n = 0; n < 8; n++) { target.push(i); if (i === ib) break; i = (i + 1) % 7; } }
      }
      if (!target.length) continue;            // "PH off" only
    }
    if (/^(off|closed)$/i.test(timePart)) { target.forEach((d) => (days[d] = [])); seen = true; continue; }
    const spans = [];
    for (const seg of timePart.split(',')) {
      const t = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(seg); if (!t) return null;
      const a = hm(t[1]), b = hm(t[2]); if (Number.isNaN(a) || Number.isNaN(b)) return null;
      spans.push([a, b <= a ? b + 1440 : b]);
    }
    if (!spans.length) return null;
    target.forEach((d) => (days[d] = spans.slice())); seen = true;
  }
  return seen ? days : null;
}

/** {open:boolean, label:string} or null when unknown. */
export function openStatus(str, now = new Date()) {
  const days = parseHours(str); if (!days) return null;
  const d = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
  for (const [a, b] of days[d]) if (min >= a && min < b) return { open: true, label: b - a >= 1440 ? 'Open 24 hours' : `Open until ${t12(b)}`, closesIn: b - min };
  for (const [a, b] of days[(d + 6) % 7]) if (b > 1440 && min + 1440 < b) return { open: true, label: `Open until ${t12(b)}`, closesIn: b - 1440 - min };
  for (let k = 0; k < 7; k++) {
    const day = (d + k) % 7;
    const next = days[day].map(([a]) => a).sort((x, y) => x - y).find((a) => k > 0 || a > min);
    if (next != null) return { open: false, label: `Closed · opens ${k === 0 ? '' : k === 1 ? 'tomorrow ' : DAYS[day] + ' '}${t12(next)}` };
  }
  return { open: false, label: 'Closed' };
}

/* ------------------------------------------------------------------ parsing */
const cap = (s) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const FAST_CHAINS = /mcdonald|burger king|wendy|taco bell|subway|kfc|popeyes|chick-?fil|sonic|arby|jack in the box|domino|pizza hut|papa john|little caesars|five guys|whataburger|in-?n-?out|panda express|chipotle|culver|dairy queen|jimmy john|jersey mike|wingstop|raising cane|zaxby|del taco|carl'?s jr|hardee|white castle|dunkin|starbucks|tim hortons|panera|qdoba|moe'?s/i;

export function parseOverpass(json, lat, lon) {
  const food = [], stores = [];
  for (const el of json.elements || []) {
    const t = el.tags || {}; if (!t.name) continue;
    const clat = el.lat ?? el.center?.lat, clon = el.lon ?? el.center?.lon; if (clat == null || clon == null) continue;
    const dist = Math.round(miles(lat, lon, clat, clon) * 100) / 100;
    const web = t.website || t['contact:website'];
    const addr = [t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : t['addr:street'], t['addr:city']].filter(Boolean).join(', ');
    const base = { id: `osm-${el.type}-${el.id}`, name: t.name, lat: clat, lon: clon, distance: dist, address: addr, website: web ? (/^https?:\/\//.test(web) ? web : 'https://' + web) : null, phone: t.phone || t['contact:phone'] || null, hours: t.opening_hours || null, source: 'osm' };
    if (t.shop) {
      const chain = chainOf(t.name, t.brand || '');
      stores.push({ ...base, kind: 'store', shop: t.shop, chain: chain?.id || null, brand: t.brand || null });
      continue;
    }
    const raw = (t.cuisine || '').split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const mapped = raw.map((c) => OSM_CUISINE_MAP[c]).find(Boolean);
    const cuisine = mapped || (t.amenity === 'cafe' ? 'Café' : raw[0] ? cap(raw[0]) : t.amenity === 'fast_food' ? 'Fast food' : 'Restaurant');
    const fast = t.amenity === 'fast_food' || FAST_CHAINS.test(`${t.brand || ''} ${t.name}`);
    const diet = [];
    if (t['diet:vegan'] === 'yes' || t['diet:vegan'] === 'only') diet.push('vegan');
    if (t['diet:vegetarian'] === 'yes' || t['diet:vegetarian'] === 'only' || diet.includes('vegan')) diet.push('vegetarian');
    if (t['diet:gluten_free'] === 'yes') diet.push('gluten-free');
    if (t['diet:halal'] === 'yes') diet.push('halal');
    if (t['diet:kosher'] === 'yes') diet.push('kosher');
    const feat = [t.takeaway === 'yes' || t.takeaway === 'only' ? 'Takeout' : null, t.delivery === 'yes' ? 'Delivery' : null, t.outdoor_seating === 'yes' ? 'Outdoor seating' : null, t.wheelchair === 'yes' ? 'Wheelchair accessible' : null, t.drive_through === 'yes' ? 'Drive-through' : null].filter(Boolean);
    food.push({ ...base, kind: 'food', type: t.amenity, cuisine, rawCuisine: raw, price: fast || t.amenity === 'cafe' ? 1 : null, priceEst: true, rating: null,
      tags: CUISINE_FLAVORS[cuisine] || EXTRA_FLAVORS[cuisine] || EXTRA_FLAVORS[raw[0]] || [], dishes: [], diet, features: feat, brand: t.brand || null });
  }
  const byDist = (a, b) => a.distance - b.distance;
  return { food: dedupe(food).sort(byDist), stores: dedupe(stores).sort(byDist) };
}
function dedupe(list) {   // OSM sometimes maps a venue as both node and building way
  const seen = new Map();
  for (const p of list) { const k = p.name.toLowerCase() + '|' + Math.round(p.lat * 2000) + '|' + Math.round(p.lon * 2000); if (!seen.has(k)) seen.set(k, p); }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ fetching */
async function overpass(lat, lon, r) {
  const shopR = Math.max(r, 8000);
  const q = `[out:json][timeout:20];(nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"](around:${r},${lat},${lon});nwr["shop"~"^(supermarket|grocery|greengrocer|butcher|seafood|farm|health_food|wholesale|international|deli)$"]["name"](around:${shopR},${lat},${lon}););out center tags 500;`;
  // Ask every mirror at once and take the first good answer (was: one after another, up to 22 s each).
  const ask = async (url) => {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 14000);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json(); if (!j || !Array.isArray(j.elements)) throw new Error('bad response');
      return j;
    } finally { clearTimeout(to); }
  };
  try { return await Promise.any(MIRRORS.map(ask)); } catch (e) { throw e.errors?.[0] || e; }
}

function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } }
function writeCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, food: c.food.slice(0, 80), stores: c.stores.slice(0, 40) })); } catch { /* storage full: skip cache */ }
  }
}

/** Recompute distances from the current position (cheap) and re-sort. */
function reproject(lat, lon) {
  for (const list of [places.food, places.stores]) { for (const p of list) p.distance = Math.round(miles(lat, lon, p.lat, p.lon) * 100) / 100; list.sort((a, b) => a.distance - b.distance); }
}

let inflight = null;
/** Make sure `places` matches the user's current location. Safe to call often. */
export function syncPlaces({ force = false } = {}) {
  const loc = state.profile.homeLoc; if (!loc) return Promise.resolve(places);
  const near = places.at && miles(places.at.lat, places.at.lon, loc.lat, loc.lon) < MOVE_MI * 2;
  if (!force && near && Date.now() - places.ts < TTL && places.status === 'ok') { reproject(loc.lat, loc.lon); emit(); return Promise.resolve(places); }
  if (inflight) return inflight;
  const c = readCache();
  if (!force && c && miles(c.lat, c.lon, loc.lat, loc.lon) < MOVE_MI * 2) {
    Object.assign(places, { food: c.food, stores: c.stores, ts: c.ts, at: { lat: c.lat, lon: c.lon }, radius: c.radius, status: Date.now() - c.ts < TTL ? 'ok' : 'stale', error: '' });
    reproject(loc.lat, loc.lon); emit();
    if (places.status === 'ok') return Promise.resolve(places);
  }
  places.status = places.food.length ? 'refreshing' : 'loading'; places.error = ''; emit();
  inflight = (async () => {
    try {
      let out = { food: [], stores: [] }, used = RADII[0];
      for (const r of RADII) { used = r; out = parseOverpass(await overpass(loc.lat, loc.lon, r), loc.lat, loc.lon); if (out.food.length >= 15) break; }
      Object.assign(places, { food: out.food, stores: out.stores, ts: Date.now(), at: { lat: loc.lat, lon: loc.lon }, radius: used, status: 'ok', error: '' });
      writeCache({ lat: loc.lat, lon: loc.lon, ts: places.ts, radius: used, food: out.food.slice(0, 250), stores: out.stores.slice(0, 120) });
    } catch (e) {
      places.status = places.food.length ? 'stale' : 'error';
      places.error = navigator.onLine === false ? 'You\'re offline — showing the last places FOODIE found.' : 'OpenStreetMap servers didn\'t respond (they can be busy). FOODIE will retry automatically.';
    } finally { inflight = null; emit(); }
    return places;
  })();
  return inflight;
}

/** Wire places to location: refetch whenever the user moves or comes back. Call once at boot. */
export function initPlaces() {
  let retry = null;
  const run = () => syncPlaces().then((p) => { clearTimeout(retry); if (p.status === 'error' || (p.status === 'stale' && Date.now() - p.ts > TTL)) retry = setTimeout(run, 45e3); });
  onLocation(() => { if (getLoc().loc) run(); });
  window.addEventListener('online', run);
  if (getLoc().loc) run();
}

/** Stores near the user that match a FOODIE chain, nearest per chain. */
export function nearbyChains() {
  const best = new Map();
  for (const s of places.stores) if (s.chain && !best.has(s.chain)) best.set(s.chain, s);
  return best;
}

export const closedNow = (p) => { const st = openStatus(p.hours); return st ? !st.open : false; };
