/* Offline support: precache the app shell, then serve same-origin files cache-first with a background refresh.
   Recipe photos (assets/recipes/t|f/<hash>.webp) live in their own cache: their file names are content hashes
   (immutable), so they are served cache-first with no revalidation, survive app-version bumps, and are capped
   so a long browsing session cannot fill the device. Bump VERSION to force clients to update the app files. */
const VERSION = 'foodie-v3.0.0';
const IMG_CACHE = 'foodie-recipe-photos-v1';
const MAX_PHOTOS = 800; // ~40 MB at typical sizes; oldest-cached are dropped first
const CORE = ['./', 'index.html', 'css/styles.css', 'js/main.js', 'manifest.webmanifest', 'assets/coach.png', 'assets/coach-sm.png', 'assets/favicon.png'];
const isPhoto = (u) => /\/assets\/recipes\/[tf]\/[0-9a-f]+\.webp$/.test(u.pathname);

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== IMG_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PHOTOS; i++) await cache.delete(keys[i]);
}
async function photo(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req); if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) { await cache.put(req, res.clone()); trim(cache); }
    return res;
  } catch { return Response.error(); } // offline + never viewed: <img> onerror falls back to the emoji tile
}

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (isPhoto(url)) { e.respondWith(photo(req)); return; }
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
