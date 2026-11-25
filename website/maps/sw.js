const CACHE = "posicao-shell-v44"

const SHELL = [
  "/maps/index.html",
  "/maps/styles.css",
  "/maps/app.js?v=43",
  "/maps/countries.geojson",
  "/maps/i18n.js",
  "/maps/places.js",
  "/maps/water.js",
  "/maps/buildings.js",
  "/maps/route.js",
  "/maps/search.js",
  "/maps/addresses.js",
  "/maps/geo.json.gz",
  "/maps/estimator.js",
  "/maps/sensors.js",
  "/maps/storage.js",
  "/maps/style.js",
  "/maps/manifest.webmanifest",
  "/maps/vendor/maplibre-gl.css",
  "/maps/vendor/maplibre-gl.mjs",
  "/maps/vendor/maplibre-gl-worker.mjs",
  "/maps/vendor/pmtiles.js",
  "/maps/glyphs/Noto%20Sans%20Regular/0-255.pbf",
  "/maps/glyphs/Noto%20Sans%20Regular/256-511.pbf",
  "/maps/icons/icon-180.png",
  "/maps/icons/icon-192.png",
  "/maps/icons/icon-512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && response.type === "basic") cache.put(request, response.clone())
    return response
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    if (request.mode === "navigate") {
      const cached = await cache.match("/maps/index.html")
      if (cached) return cached
    }
    return new Response("offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === "/maps/portugal.pmtiles" || url.pathname === "/maps/world.pmtiles") return
  event.respondWith(networkFirst(request))
})
