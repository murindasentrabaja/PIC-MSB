const C = 'msb-tp-v4';
const A = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'];

// Install: simpan file satu per satu. Satu file yang gagal tidak menggagalkan instalasi.
self.addEventListener('install', e => e.waitUntil(
  caches.open(C)
    .then(c => Promise.all(A.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting())
));

// Activate: hapus HANYA cache lama milik aplikasi ini (domain github.io dipakai bersama aplikasi MSB lain,
// jadi cache aplikasi lain tidak boleh ikut terhapus).
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(k => Promise.all(k.filter(x => x.startsWith('msb-tp-') && x !== C).map(x => caches.delete(x))))
    .then(() => self.clients.claim())
));

// Jaringan dulu, cache sebagai cadangan offline (hanya file milik aplikasi; API tidak di-cache)
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r.url, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const cp = res.clone();
          caches.open(C).then(c => c.put(r.url, cp)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(r.url, { ignoreSearch: true })
          .then(m => m || (r.mode === 'navigate'
            ? caches.match('index.html').then(x => x || caches.match('./'))
            : null))
          .then(m => m || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
      )
  );
});
