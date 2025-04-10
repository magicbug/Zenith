const CACHE_NAME = 'zenith-v1';
const STATIC_CACHE = 'zenith-static-v1';
const DATA_CACHE = 'zenith-data-v1';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/main.js',
  '/js/satellite.js',
  '/js/leaflet.js',
  '/assets/pwa_icons/windows/Square44x44Logo.targetsize-96.png',
  '/assets/pwa_icons/windows/Square44x44Logo.targetsize-256.png',
  '/assets/pwa_icons/windows/Square150x150Logo.scale-400.png',
  '/assets/pwa_icons/windows/SplashScreen.scale-100.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_FILES))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DATA_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  // Don't cache POST requests
  if (event.request.method === 'POST') {
    return;
  }

  // Handle API requests
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            // Only cache GET requests
            if (event.request.method === 'GET') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // If offline, return cached data for GET requests
            if (event.request.method === 'GET') {
              return cache.match(event.request);
            }
            return new Response('Offline - POST requests not supported', { status: 503 });
          });
      })
    );
    return;
  }

  // Handle static file requests
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

// Background sync for satellite data
self.addEventListener('sync', (event) => {
  if (event.tag === 'update-satellite-data') {
    event.waitUntil(
      fetch('/api/satellite-data')
        .then((response) => response.json())
        .then((data) => {
          // Update IndexedDB with new data
          // This would need to be implemented based on your data storage
        })
    );
  }
}); 