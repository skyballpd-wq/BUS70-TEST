// BUS70 TEST: 정적 리소스만 캐시. 기사 개인정보 및 API 결과는 캐시하지 않음.
const CACHE = "bus70-test-static-v14-driver-confirmations";
const ASSETS = ["./", "./index.html", "./manager-ocr.js?v=11", "./manifest.webmanifest", "./icons/bus70-192.png", "./icons/bus70-512.png", "./icons/bus70-180.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
