/* NeuroLens service worker.
 *
 * Scope is deliberately narrow. A service worker is the easiest way to break an
 * app permanently — cache the wrong thing and every visitor is pinned to a
 * broken build with no way back — so this one only does what it can do safely:
 *
 *   - build assets under /_build/ are content-hashed, so their URL changes when
 *     their content does. They can be cached forever with no staleness risk.
 *   - navigations go to the network first and only fall back to a cached shell
 *     when the network fails. A code update therefore always wins; the cache is
 *     a safety net, never the source of truth.
 *   - book text and cover images are cached after a successful fetch, because
 *     those are the parts worth having on a train.
 *
 * Everything else — the API, anything cross-origin not listed, POSTs — is left
 * strictly alone.
 */

const VERSION = "nl-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const CONTENT = `${VERSION}-content`;
const KEEP = new Set([SHELL, ASSETS, CONTENT]);

/** Roughly how many book/cover responses to keep before trimming oldest. */
const CONTENT_LIMIT = 120;

self.addEventListener("install", (event) => {
  // Nothing is precached: the shell is whatever HTML the visitor actually
  // fetched, which avoids guessing at build output paths that change per build.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this worker so a bad release can be
      // cleared by shipping a new VERSION rather than by asking people to
      // clear site data.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !KEEP.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Let the page tell the worker to stand down — the kill switch. */
self.addEventListener("message", (event) => {
  if (event.data !== "nl-unregister") return;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
    })(),
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  // Oldest-first: `keys()` preserves insertion order.
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

/** Immutable, content-hashed build output. Safe to serve from cache first. */
function isHashedAsset(url) {
  return url.origin === self.location.origin && /\/_build\/|\/assets\//.test(url.pathname);
}

/** Reading material worth having offline. */
function isContent(url) {
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/gutendex/")) return true;
  if (url.hostname.endsWith("gutenberg.org")) return true;
  return url.origin === self.location.origin && /\/images\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Navigations: network first, cached shell only if the network is gone.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match("/", { cacheName: SHELL });
          if (cached) return cached;
          throw new Error("offline and no cached shell");
        }
      })(),
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(ASSETS);
          cache.put(request, fresh.clone());
        }
        return fresh;
      })(),
    );
    return;
  }

  if (isContent(url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(CONTENT);
            await cache.put(request, fresh.clone());
            void trim(CONTENT, CONTENT_LIMIT);
          }
          return fresh;
        } catch (error) {
          const hit = await caches.match(request, { cacheName: CONTENT });
          if (hit) return hit;
          throw error;
        }
      })(),
    );
  }
});
