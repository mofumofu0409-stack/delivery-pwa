const CACHE_PREFIX = 'delivery-support:' + self.registration.scope + ':';
const CACHE = CACHE_PREFIX + 'v0.4.5-week-column1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './calendar.js',
  './calendar.css',
  './excel-import.js',
  './excel-ui.js',
  './excel-worker.js',
  './xlsx.full.min.js',
  './security.js',
  './vault.js',
  './vault.css',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(asset => new Request(new URL(asset, self.registration.scope), {cache:'reload'})))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Cache only the app's known static assets, never arbitrary user-data URLs.
  const allowed = ASSETS.some(asset => new URL(asset, self.registration.scope).pathname === url.pathname);
  if (!allowed) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.status === 200 && response.type === 'basic' && !url.search && !response.redirected) {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (e) {
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return Response.error();
    }
  }));
});

