const CACHE_VERSION = "obr-offline-20260521-59";
const SHELL_CACHE = `${CACHE_VERSION}:shell`;
const PAGE_CACHE = `${CACHE_VERSION}:pages`;
const IMAGE_CACHE = `${CACHE_VERSION}:images`;
const PAGE_CACHE_LIMIT = 40;
const IMAGE_CACHE_LIMIT = 300;
const NAVIGATION_FALLBACK_TIMEOUT_MS = 800;
const PAGE_API_FALLBACK_TIMEOUT_MS = 1500;

const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/assets/favicon.svg",
  "/assets/style.css?v=20260521-capture-preview-fallback",
  "/assets/app.js?v=20260521-capture-preview-fallback",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("obr-offline-") && !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname === "/api/ping") return;
  if (request.cache === "no-store") return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL_CACHE, 0, {
        timeoutMs: NAVIGATION_FALLBACK_TIMEOUT_MS,
        fallbackRequest: "/",
      }),
    );
    return;
  }

  if (isPageApi(url)) {
    event.respondWith(
      networkFirst(request, PAGE_CACHE, PAGE_CACHE_LIMIT, {
        timeoutMs: PAGE_API_FALLBACK_TIMEOUT_MS,
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/images/")) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

function isPageApi(url) {
  return (
    url.pathname === "/api/page" ||
    url.pathname === "/api/page/edit" ||
    url.pathname === "/api/page/source" ||
    url.pathname === "/api/search"
  );
}

function isShellAsset(url) {
  return (
    url.pathname === "/" ||
    url.pathname === "/obweb" ||
    url.pathname === "/front" ||
    url.pathname === "/front/" ||
    url.pathname === "/front/index.html" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/assets/")
  );
}

async function networkFirst(request, cacheName, limit = 0, options = {}) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
      if (limit) await trimCache(cache, limit);
    }
    return response;
  });

  if (options.timeoutMs) {
    const timeout = new Promise((resolve) => {
      setTimeout(async () => {
        resolve(await cachedFallback(cache, request, options.fallbackRequest));
      }, options.timeoutMs);
    });
    const winner = await Promise.race([
      network
        .then((response) => ({ type: "network", response }))
        .catch((error) => ({ type: "error", error })),
      timeout.then((response) => ({ type: "timeout", response })),
    ]);

    if (winner.type === "network") return winner.response;
    if (winner.type === "timeout" && winner.response) {
      network.catch(() => {});
      return winner.response;
    }
    if (winner.type === "error") {
      const cached = await cachedFallback(cache, request, options.fallbackRequest);
      if (cached) return cached;
      throw winner.error;
    }
  }

  try {
    return await network;
  } catch (error) {
    const cached = await cachedFallback(cache, request, options.fallbackRequest);
    if (cached) return cached;
    throw error;
  }
}

async function cachedFallback(cache, request, fallbackRequest) {
  const cached =
    (await cache.match(request)) || (fallbackRequest && (await cache.match(fallbackRequest)));
  return cached ? offlineResponse(cached) : null;
}

async function cacheFirst(request, cacheName, limit = 0) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (limit) await trimCache(cache, limit);
  }
  return response;
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function offlineResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Obr-Offline-Cache", "1");
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
