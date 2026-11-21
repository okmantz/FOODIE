/* Offline support: precache the app shell, then serve same-origin files cache-first
   with a background refresh. Bump VERSION to force clients to update. */
const VERSION = 'foodie-v2.0.0';
const CORE = ['./', 'index.html', 'css/styles.css', 'js/main.js', 'manifest.webmanifest', 'assets/coach.png', 'assets/coach-sm.png', 'assets/favicon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
