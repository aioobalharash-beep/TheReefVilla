/* eslint-disable */
/* global self, clients */

// Single service worker for the whole app:
//   1. PWA shell caching (offline navigation fallback + stale-while-revalidate
//      for assets).
//   2. Web Push handler for FCM admin notifications.
//
// Why one file? Service Workers are keyed by scope, not by file. Registering
// two different SW scripts at the same scope (`/`) causes the second one to
// replace the first on every page load — which is what was silently killing
// background push notifications.

// Bump on every change that should invalidate caches. `activate` deletes any
// cache whose name doesn't match, so a returning visitor gets a clean slate.
const CACHE_NAME = 'reef-villa-shell-v5';

self.addEventListener('install', (event) => {
  // Deliberately DO NOT precache an index.html snapshot. A fixed snapshot goes
  // stale against Vite's content-hashed assets: after a redeploy it would point
  // at /assets/index-<oldhash>.css which 404s, painting the (now prerendered)
  // HTML completely unstyled. Instead the navigate handler below caches the
  // latest good HTML on each online visit, so the offline fallback always
  // matches the assets cached alongside it.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // Network-first, then refresh the cached fallback. Caching the fresh HTML
    // keeps the offline fallback in sync with the hashed assets cached on the
    // same visit, so it never references a CSS/JS hash that has been rotated
    // away by a later deploy.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed, immutable assets: cache-first with background revalidate. Fall back
  // to cache if the network is unavailable.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

// FCM speaks the standard Web Push protocol (VAPID), so we handle the push
// event directly with no Firebase code in the SW. Works identically on Chrome,
// Safari, and iOS PWAs — and avoids the iOS quirks that broke firebase-
// messaging-compat.js inside service workers.
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { notification: { body: event.data.text() } };
    }
  }

  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || '🛎️ حجز جديد! (New Booking!)';
  const body =
    n.body ||
    d.body ||
    (d.guest_name && d.total_amount
      ? `${d.guest_name} has booked for ${d.total_amount} OMR.`
      : 'A new booking just arrived.');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.bookingId || 'al-malak-booking',
      data: {
        url: d.url || '/admin',
        bookingId: d.bookingId || null,
      },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client && client.url.includes(targetUrl)) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return null;
    })
  );
});
