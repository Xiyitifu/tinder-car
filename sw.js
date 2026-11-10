// Incrémenter VERSION à chaque changement de code, de données ou de photos.
const VERSION = 'v2';
const CODE = ['./', 'index.html', 'style.css', 'app.js', 'score.js', 'modeles.json',
  'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'photos/index.json', 'photos/CREDITS.csv'];

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(VERSION);
  const index = await (await fetch('photos/index.json', { cache: 'reload' })).json();
  const photos = Object.entries(index).flatMap(([id, fs]) => fs.map(f => `photos/${id}/${f}`));
  await cache.addAll([...CODE, ...photos].map(u => new Request(u, { cache: 'reload' })));
  self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
