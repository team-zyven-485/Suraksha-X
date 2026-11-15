/* SURAKSHA-X service worker — lets the app open and work with no connection.
 *
 *  - App shell + built assets are cached on install, so the very first
 *    offline launch works.
 *  - Navigations: network first (always get the newest version when online),
 *    falling back to the cached shell.
 *  - Static files + map tiles + fonts: stale-while-revalidate.
 *  - /api/* is NEVER cached here: SOS data must always be live. The app's own
 *    offline queue (localStorage) handles SOS requests made while offline.
 */
const CACHE = 'suraksha-shell-v1';
const RUNTIME = 'suraksha-runtime-v1';
const RUNTIME_MAX_ENTRIES = 300;

const CROSS_ORIGIN_OK = [
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'tile.openstreetmap.org',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const html = await res.clone().text();
        await cache.put('/', res);
        const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|svg|png|ico|webmanifest))"/g)].map((m) => m[1]);
        await Promise.all(
          assets.map((url) =>
            fetch(url)
              .then((r) => (r.ok ? cache.put(url, r) : null))
              .catch(() => null)
          )
        );
      } catch (_) {
        /* installing while offline: nothing to precache */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE, RUNTIME]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return; // never cache the API
  if (url.pathname === '/sw.js') return;

  // Page navigations
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('/', fresh.clone());
          return fresh;
        } catch (_) {
          const cached = await caches.match('/');
          return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })()
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const allowedCross = CROSS_ORIGIN_OK.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  if (!sameOrigin && !allowedCross) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const network = fetch(req)
        .then(async (res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const cache = await caches.open(sameOrigin ? CACHE : RUNTIME);
            cache.put(req, res.clone());
            if (!sameOrigin) trim(RUNTIME, RUNTIME_MAX_ENTRIES);
          }
          return res;
        })
        .catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })()
  );
});
