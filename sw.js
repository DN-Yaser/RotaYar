// نسخه را با هر تغییر مهم افزایش دهید تا کش قدیمی پاک شود
const V = 'rotayar-v7';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/ui.js', './js/logic.js', './js/storage.js', './js/calendar.js',
  './shabnam.ttf', './shabnam_bold.ttf', './icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))));
  self.clients.claim();
});
// stale-while-revalidate: سریع و آفلاین، و در پس‌زمینه به‌روز می‌شود
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const copy = r.clone();
        caches.open(V).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
