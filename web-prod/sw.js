// Service worker PWA: network-first untuk semua GET (halaman/JS/CSS/CDN), cache cuma jadi
// cadangan saat offline. Network-first (bukan cache-first) supaya deploy baru langsung
// kepakai tanpa perlu bump versi cache. POST /api/proxy tidak pernah lewat cache (SW cuma
// menangani GET), dan tile peta Google dilewati supaya cache tidak membengkak.
const CACHE = 'super-muncul-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('mt1.google.com') || req.url.includes('router.project-osrm.org')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
