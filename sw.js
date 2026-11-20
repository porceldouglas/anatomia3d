// Guarda todos os arquivos no iPad na primeira visita. Depois roda sem internet.
const CACHE = 'anatomia3d-37fd6722';
const FILES = [
 "./",
 "./BufferGeometryUtils.js",
 "./GLTFLoader.js",
 "./OrbitControls.js",
 "./app.js",
 "./body.glb",
 "./data.js",
 "./head.glb",
 "./head_curves.json",
 "./icon-180.png",
 "./icon-192.png",
 "./icon-512.png",
 "./index.html",
 "./manifest.webmanifest",
 "./meshopt_decoder.module.js",
 "./ta.json",
 "./three.module.js"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
