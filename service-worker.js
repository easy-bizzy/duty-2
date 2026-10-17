const CACHE_NAME = 'duty-v12';
const FILES = ['./', './index.html', './style.css', './script.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
      return response;
    })).catch(() => caches.match('./index.html'))
  );
});
