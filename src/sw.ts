declare const __PRECACHE__: readonly string[];
declare const __CACHE_NAME__: string;
const worker = self as unknown as ServiceWorkerGlobalScope;
const absolute = (path: string): string => new URL(path, worker.registration.scope).href;
worker.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(__CACHE_NAME__);
    await cache.addAll(__PRECACHE__.map(absolute)); await worker.skipWaiting();
  })());
});
worker.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("pixelquill-") && name !== __CACHE_NAME__).map(name => caches.delete(name)));
    await worker.clients.claim();
  })());
});
worker.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== worker.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(__CACHE_NAME__);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === "navigate") {
        const index = await cache.match(absolute("index.html"));
        if (index) return index;
      }
      throw error;
    }
  })());
});
