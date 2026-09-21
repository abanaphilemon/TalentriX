import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();

// Precache everything built by Vite (app shell). Unknown deep links (e.g.
// /dashboard/seeker) fall back to index.html so the SPA router keeps working,
// including when the phone is offline.
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  })
);

// In-app polling requests hit the API; keep those fast-ish with a network-only
// policy so notifications are always fresh.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  async ({ request }) => {
    const response = await fetch(request);
    const cloned = response.clone();
    try {
      const cache = await caches.open('talentrix-api');
      await cache.put(request, cloned);
    } catch {
      // non-critical
    }
    return response;
  }
);

// ── Push (PWA popup notifications on phones) ────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload → fall through with defaults */
  }
  const title = data.title || 'TalentriX';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/', type: data.type || 'notify', payload: data.payload || {} },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tap a popup → open the relevant dashboard section.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const targetUrl = new URL(url, self.location.origin).toString();

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === targetUrl && 'focus' in client) {
          client.focus();
          return;
        }
      }
      // Reuse an open app tab if possible, otherwise open a fresh one.
      if (windows.length && 'focus' in windows[0]) {
        windows[0].focus();
        if ('navigate' in windows[0]) {
          try { await windows[0].navigate(targetUrl); } catch { /* ignore */ }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});