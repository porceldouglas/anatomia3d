// Guarda todos os arquivos no iPad na primeira visita. Depois roda sem internet.
const CACHE = 'anatomia3d-0e4dc31b';
const FILES = [
 "./",
 "./app.js",
 "./data.js",
 "./icons/icon-180.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./index.html",
 "./lib/jsm/controls/OrbitControls.js",
 "./lib/jsm/libs/meshopt_decoder.module.js",
 "./lib/jsm/loaders/GLTFLoader.js",
 "./lib/jsm/utils/BufferGeometryUtils.js",
 "./lib/three.module.js",
 "./manifest.webmanifest",
 "./models/body.glb",
 "./models/head.glb",
 "./models/head_curves.json",
 "./ta.json"
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
