// Bump this version whenever any cached file changes, so clients pick up the update.
const CACHE = "e-kunye-v9";
const FONT_CACHE = "e-kunye-fonts";
const LIB_CACHE = "e-kunye-libs"; // Firebase SDK, fetched only once sync is turned on

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./js/sync.js",
  "./js/sync-core.js",
  "./lang/tr.js",
  "./lang/en.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/qr.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove app caches from older versions (the font cache is kept).
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE && k !== LIB_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts and the (versioned) Firebase SDK: cache on first load so the
  // typeface and sync also work offline.
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  const isLib = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (isFont || isLib) {
    event.respondWith(
      caches.open(isLib ? LIB_CACHE : FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Anything else from another origin (Firestore, Google sign-in) goes
  // straight to the network untouched.
  if (url.origin !== self.location.origin) return;

  // App shell: cache-first. User data lives in localStorage, not the network.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
  );
});
