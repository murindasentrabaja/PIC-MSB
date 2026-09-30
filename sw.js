const C = 'msb-tp-v3';
const A = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'];

// Install: simpan file aplikasi satu per satu. Jika ada satu file yang gagal,
// instalasi service worker TIDAK ikut gagal (penyebab "tidak dapat membuka aplikasi").
self.addEventListener('install', e => e.waitUntil(
  caches.open(C)
    .then(c => Promise.all(A.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))
    .then(() => self.clients.claim())
));

// Jaringan dulu, cache sebagai cadangan offline (hanya file milik aplikasi; API tidak di-cache)
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const cp = res.clone();
          caches.open(C).then(c => c.put(r, cp)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(r, { ignoreSearch: true })
          .then(m => m || (r.mode === 'navigate'
            ? caches.match('index.html').then(x => x || caches.match('./'))
            : null))
          .then(m => m || new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }))
      )
  );
});
