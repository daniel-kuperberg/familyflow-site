const CACHE = 'familyflow-demo-v12';
// Cache only the public application shell and synthetic demo, never arbitrary requests.
const ASSETS = ['./', './index.html', './styles.css?v=12', './app.js?v=12', './schedule-core.mjs?v=12', './schedule.demo.json', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const allowed = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('familyflow-demo-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !allowed.has(event.request.url)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); }
      catch { return cache.match(event.request); }
    }
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});
