const CACHE_NAME = 'PULSE-PARCEL-cache-v1';
const DYNAMIC_CACHE_NAME = '10kvendor-dynamic-v1';

// Core app shell files (must be cached for offline shell)
const urlsToCache = [
  '/',
  '/index.html',
  'static/WhatsApp_Image_2025-11-14_at_15.22.15_e0a3a264-removebg-preview.png',
];

// Optional third-party resources (pre-cached during install only)
const optionalUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js',
  'https://cdn.jsdelivr.net/npm/animejs/lib/anime.iife.min.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('Caching core assets...');
      try {
        await cache.addAll(urlsToCache);
      } catch (error) {
        console.error('Failed to cache core assets:', error);
        throw error;
      }

      // Opportunistically pre-cache optional third-party assets
      optionalUrlsToCache.forEach(url => {
        fetch(url, { mode: 'no-cors' }).then(response => {
          if (response.ok || response.type === 'opaque') {
            cache.put(url, response);
          }
        }).catch(() => {}); // silent fail
      });
    })
  );
  self.skipWaiting();
});

// Activate – clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== DYNAMIC_CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// =============================================
// FETCH: Network-first when online, cache fallback when offline
// =============================================
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // 1. API requests – always try network first, cache successful responses
  if (requestUrl.pathname.startsWith('/api/public/')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status < 400) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline → try cache
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: 'You are offline and no cached data is available.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 2. Everything else (HTML, JS, CSS, images, CDN assets, navigation)
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Online & successful → return it and update cache in background
        if (networkResponse && networkResponse.status < 400) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline → fall back to cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;

          // Last resort for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }

          // For all other failed fetches when offline, let it fail naturally
          throw new Error('Network error and no cache');
        });
      })
  );
});

// Push notifications (unchanged)
self.addEventListener('push', event => {
  let data = {
    title: '10kVendor',
    body: 'New update available!',
    url: '/orders.html'
  };
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: 'static/logo.png',
    badge: 'static/logo.png',
    data: { url: data.url || '/orders.html' },
    vibrate: [200, 100, 200],
    actions: [{ action: 'view-order', title: 'View Order' }]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click (unchanged)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data.url || '/orders.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (let client of clientsArr) {
        if (client.url.includes(new URL(url, self.location).pathname) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});