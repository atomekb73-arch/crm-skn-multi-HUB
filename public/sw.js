const CACHE_NAME = 'skn-crm-pwa-v3';

// Statyczne zasoby powłoki aplikacji
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Obsługujemy wyłącznie bezpieczne zapytania GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Nigdy nie przechwytujemy w Service Workerze żądań cross-origin (Google Fonts, Supabase,
  // Vercel Live, Teamup, Google Apps Script) ani endpointów API — przeglądarka obsługuje je natywnie
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/api-teamup/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // Network-First dla nawigacji (strony HTML), aby zawsze pobierać najnowszą wersję z Vercela
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallbackIndex = await caches.match('/index.html');
          return fallbackIndex || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Stale-While-Revalidate dla lokalnych assetów statycznych (CSS, JS, ikony)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || new Response('', { status: 504, statusText: 'Gateway Timeout' }));

      return cachedResponse || fetchPromise;
    })
  );
});
