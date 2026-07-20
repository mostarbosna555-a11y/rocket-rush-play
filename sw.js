// Rocket Rush — offline önbellek (PWA)
const CACHE = 'rocketrush-v1';
const ASSETS = [
  './', './index.html', './three.min.js', './firebase-config.js', './game.js',
  './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase gibi dış (cross-origin) istekleri önbelleğe alma; doğrudan ağa gitsin
  if (url.origin !== location.origin) return;
  // Aynı origin: önce önbellek, yoksa ağ (offline çalışsın)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
