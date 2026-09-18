// Offline-Cache ausschließlich für App-Dokumente und statische Dateien.
const CACHE = "fernwerk-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.add("/")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key.startsWith("fernwerk-") && key !== CACHE)
      .map(key => caches.delete(key)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin ||
      /^\/api(?:\/|$)/i.test(url.pathname) ||
      /^\/(?:login|register|forgot-password|reset-password|oauth|auth)(?:\/|$)/i.test(url.pathname) ||
      request.headers.has("Authorization") ||
      [...url.searchParams.keys()].some(key => /token|code|session/i.test(key))) return;

  const remember = (response) => {
    if (response.ok && response.type !== "opaque" && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  };
  if (request.mode === "navigate") {
    // Dokumente mit Query-Parametern können sitzungsbezogen sein.
    if (url.search) return;
    event.respondWith(fetch(request).then(remember).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(request) || await cache.match("/") || Response.error();
    }));
    return;
  }
  const isAsset = url.pathname.startsWith("/assets/") ||
    /^\/(?:favicon\.(?:ico|png|svg)|manifest\.json|icons\/[^/]+\.(?:png|svg|webp))$/.test(url.pathname);
  if (!isAsset) return;
  event.respondWith(caches.open(CACHE).then(async cache =>
    await cache.match(request) || fetch(request).then(remember)
  ));
});
