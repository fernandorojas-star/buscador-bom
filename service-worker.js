// service-worker.js (PWA offline para Buscador BOM)
const CACHE_VERSION = "bom-v3"; // <-- cambia este número cuando actualices archivos
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE   = `data-${CACHE_VERSION}`;

// Archivos que se guardan para abrir la app offline
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./data/bom.json",
];

// Instalar: precache del “app shell”
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(APP_SHELL);
      self.skipWaiting();
    })()
  );
});

// Activar: limpia caches antiguos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, DATA_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      self.clients.claim();
    })()
  );
});

// Fetch strategy:
// - Para bom.json: "stale-while-revalidate" (muestra cache y actualiza en segundo plano)
// - Para lo demás: cache-first con fallback a network
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejar tu mismo dominio (GitHub Pages)
  if (url.origin !== self.location.origin) return;

  const isBom = url.pathname.endsWith("/data/bom.json") || url.pathname.endsWith("data/bom.json");

  if (isBom) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(req, STATIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    // fallback mínimo: si piden navegación y no hay red
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });

  const networkPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  // devuelve cache inmediatamente si existe, si no, espera red
  return cached || (await networkPromise) || new Response("[]", { headers: { "Content-Type": "application/json" } });
}
