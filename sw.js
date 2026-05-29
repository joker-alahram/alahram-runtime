const CACHE = {
  static: 'v2-static-v4',
  images: 'v2-images-v1',
  shell: 'v2-shell-v1',
};

const OFFLINE_HTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>غير متصل</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa;text-align:center;padding:1rem} .v2-offline{max-width:360px} .v2-offline-icon{font-size:4rem;margin-bottom:1rem;opacity:.6} h2{font-size:1.25rem;color:#1a1a2e;margin-bottom:.5rem} p{font-size:.875rem;color:#6b7280;margin-bottom:1.5rem;line-height:1.6} .v2-offline-btn{display:inline-block;padding:.75rem 2rem;background:#0d2b6b;color:#fff;border:none;border-radius:12px;font-size:.9375rem;cursor:pointer;text-decoration:none} .v2-offline-btn:hover{opacity:.9}</style></head><body><div class="v2-offline"><div class="v2-offline-icon">📡</div><h2>غير متصل بالإنترنت</h2><p>التطبيق يحتاج اتصال بالإنترنت للعمل.<br>حاول مرة أخرى عندما يتوفر الاتصال.</p><button class="v2-offline-btn" onclick="location.reload()">إعادة المحاولة</button></div></body></html>`;

const STATIC_PATTERNS = [
  /\/new\/sw\.js$/,
  /\/new\/app\.js$/,
  /\/new\/bootstrap\.js$/,
  /\/new\/registry\.js$/,
  /\/new\/config\.js$/,
  /\/new\/utils\//,
  /\/new\/auth\//,
  /\/new\/state\//,
  /\/new\/ui\//,
  /\/new\/pwa\//,
  /\/new\/services\//,
  /\/new\/domains\//,
  /\/new\/styles\/main\.css$/,
  /\/new\/manifest\.webmanifest$/,
];

const IMAGE_PATTERNS = [
  /\/assets\/pwa\//,
  /\/new\/assets\//,
  /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i,
];

const SHELL_PATTERNS = [
  /\/new\/index\.html$/,
  /\/new\/$/,
];

const API_PATTERNS = [
  /supabase\.co\/rest\/v1\//,
  /supabase\.co\/rest\/v1\/rpc\//,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE.shell);
    await cache.addAll([
      './index.html',
      './manifest.webmanifest',
      './styles/main.css',
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const valid = new Set(Object.values(CACHE));
    await Promise.all(
      keys.map((key) => valid.has(key) ? Promise.resolve() : caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!_shouldHandle(request)) return;

  const url = new URL(request.url);

  if (_isRpc(url)) return;
  if (_isApi(url)) return;
  if (_isStatic(url)) { event.respondWith(_cacheFirst(request, CACHE.static)); return; }
  if (_isImage(url)) { event.respondWith(_staleWhileRevalidate(request, CACHE.images)); return; }
  if (_isShell(url)) { event.respondWith(_cacheFirst(request, CACHE.shell)); return; }
});

function _shouldHandle(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/new/')) return false;
  return true;
}

function _isRpc(url) {
  return RPC_PATTERNS.some((p) => p.test(url.href));
}

function _isApi(url) {
  return API_PATTERNS.some((p) => p.test(url.href));
}

function _isStatic(url) {
  return STATIC_PATTERNS.some((p) => p.test(url.pathname));
}

function _isImage(url) {
  return IMAGE_PATTERNS.some((p) => p.test(url.pathname));
}

function _isShell(url) {
  return SHELL_PATTERNS.some((p) => p.test(url.pathname));
}

async function _cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const network = await fetch(request);
    if (network.ok) cache.put(request, network.clone());
    return network;
  } catch (e) {
    if (request.mode === 'navigate') {
      return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new Response('غير متاح حالياً', { status: 503 });
  }
}

async function _staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }

  return network || new Response('', { status: 503 });
}
