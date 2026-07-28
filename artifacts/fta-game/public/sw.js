const CACHE_NAME = "football-tactics-arena-offline-v3-training-fix";
const RUNTIME_CACHE = "football-tactics-arena-runtime-v3-training-fix";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
];

// Install: save the core shell immediately.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          CORE_ASSETS.map(
            (url) =>
              new Request(url, {
                cache: "reload",
              }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// Activate: delete old caches and take control immediately.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name !== CACHE_NAME &&
                name !== RUNTIME_CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Save every successful same-origin GET request.
// This catches Vite JS/CSS/assets after the app loads once online.
async function cacheRuntimeRequest(request, response) {
  if (!response || !response.ok) return response;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return response;
  }

  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, response.clone());

  return response;
}

// For app page navigation:
// Try network first. If offline, fall back to cached app shell.
async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    await cacheRuntimeRequest(request, networkResponse.clone());
    return networkResponse;
  } catch {
    const cached =
      (await caches.match(request)) ||
      (await caches.match("/")) ||
      (await caches.match("/index.html"));

    if (cached) return cached;

    return new Response("Football Tactics Arena is offline, but the app shell was not cached yet. Open it once while online first.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}

// For JS/CSS/images:
// Cache first. If not cached, fetch and save.
async function handleAsset(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    return await cacheRuntimeRequest(request, networkResponse);
  } catch {
    return new Response("", {
      status: 504,
      statusText: "Offline and asset not cached",
    });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  event.respondWith(handleAsset(event.request));
});