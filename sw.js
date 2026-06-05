// WormTrace service worker — NETWORK-FIRST so updates always show,
// falling back to cache only when offline.
const CACHE = 'wormtrace-v8';

self.addEventListener('install', e => {
  self.skipWaiting();   // activate the new SW immediately
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))   // wipe ALL old caches
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Cache a fresh copy for offline fallback
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))   // offline → serve cached
  );
});
