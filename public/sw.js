const CACHE_NAME = 'payku-static-v2';
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function isCacheableStaticAsset(requestUrl, request) {
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return false;
  }

  return (
    PRECACHE_ASSETS.includes(requestUrl.pathname) ||
    requestUrl.pathname.startsWith('/_next/static/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith('payku-static-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (!isCacheableStaticAsset(requestUrl, event.request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        event.waitUntil(
          fetch(event.request)
            .then((response) => {
              if (response.ok && response.type === 'basic') {
                return cache.put(event.request, response);
              }
              return undefined;
            })
            .catch(() => undefined),
        );
        return cachedResponse;
      }

      const response = await fetch(event.request);
      if (
        response.ok &&
        response.type === 'basic' &&
        response.headers.get('Cache-Control')?.includes('no-store') !== true
      ) {
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
