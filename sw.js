/* Service Worker: macht die App installierbar. Nur das Gerüst wird zwischengespeichert, nie Daten. */
const CACHE = "teamheft-v4";
const GERUEST = ["./", "./index.html", "./app.js?v=4", "./plan.js?v=4", "./plan.css?v=4", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(GERUEST)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const k = r.clone(); caches.open(CACHE).then(c => c.put(e.request, k)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
