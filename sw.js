const CACHE = 'doley-static-v44';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/updates.js',
  './js/storage.js',
  './js/calc.js',
  './js/cars.js',
  './js/dictionaries.js',
  './js/station-networks.js',
  './js/theme.js',
  './js/layout.js',
  './js/loyalty.js',
  './js/screens/refuel.js',
  './js/screens/history.js',
  './js/screens/settings.js',
  './version.json',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-180.png',
];

/** Дольше ждать сеть для страницы нельзя: на iPhone всё это время виден белый экран. */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  // cache: 'reload' — мимо HTTP-кэша, иначе в новый кэш попадают старые файлы вперемешку с новыми.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))
      )
    )
  );
  // Не вызываем skipWaiting сразу — ждём согласия пользователя в приложении
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML и version.json — сначала сеть, чтобы быстрее видеть обновления
  const isNavigate = request.mode === 'navigate' || request.destination === 'document';
  const isHtml = url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  const isVersion = url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json');

  if (isNavigate || isHtml || isVersion) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // фоновое обновление кэша
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.ok) {
          caches.open(CACHE).then((cache) => cache.put(request, response));
        }
      })
      .catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached;
  }
}
