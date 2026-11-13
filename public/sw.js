// Service worker for the phone app (served at /app/sw.js, controls /app/).
// Caches every file the app needs, so it opens and works with no connection to the laptop.
// The server replaces __BUILD_HASH__ with a hash of all app files: whenever the app changes,
// this file changes, the phone downloads the complete new set the next time it can reach the
// laptop, and switches over in one go (never a mix of old and new files).

const VERSION = '__BUILD_HASH__';
const CACHE = 'aps-' + VERSION;

// Keep in sync with the files in public/ (test/sw.test.js checks this).
const FILES = [
  './',
  'app.js',
  'store.js',
  'validation.js',
  'planfile.js',
  'trilateration.js',
  'qr-scanner.js',
  'serial.js',
  'exporters.js',
  'styles.css',
  'manifest.webmanifest',
  'vendor/jsQR.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aps-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (req.mode === 'navigate') {
    // Any page load inside the app gets the cached app shell.
    event.respondWith(caches.match(new URL('./', scope).href).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
