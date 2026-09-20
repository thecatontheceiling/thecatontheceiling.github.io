const SHELL_CACHE = 'lyssa-shell';
const ASTRO_CACHE = 'lyssa-astro';
const IMG_CACHE = 'lyssa-img';
const PAGES_CACHE = 'lyssa-pages';
const THIRD_PARTY_CACHE = 'lyssa-3p';
const KNOWN_CACHES = [SHELL_CACHE, ASTRO_CACHE, IMG_CACHE, PAGES_CACHE, THIRD_PARTY_CACHE];
const AR_JS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SHELL = [
  '/img/logo.webp',
  '/img/favicon.ico',
  '/img/email.svg',
  '/img/discord.svg',
  '/img/signal.svg',
  '/img/externallink.svg',
];

const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('lyssa-') && !KNOWN_CACHES.includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isFresh(cachedDateHeader, maxAgeMs) {
  if (!cachedDateHeader) return false;
  const time = Date.parse(cachedDateHeader);
  if (Number.isNaN(time)) return false;
  return Date.now() - time < maxAgeMs;
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    for (let i = 0; i < keys.length - maxEntries; i++) {
      await cache.delete(keys[i]);
    }
  } catch {}
}

async function safePut(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch {}
}

function cacheableSameOrigin(res) {
  return res && res.status === 200 && res.type === 'basic';
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheableSameOrigin(res)) {
    const copy = res.clone();
    await safePut(cacheName, request, copy);
    if (maxEntries !== undefined) await trimCache(cacheName, maxEntries);
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then(async (res) => {
      if (cacheableSameOrigin(res)) {
        const copy = res.clone();
        await safePut(cacheName, request, copy);
        if (maxEntries !== undefined) await trimCache(cacheName, maxEntries);
      }
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    networkPromise.catch(() => undefined);
    return cached;
  }
  const res = await networkPromise;
  if (res) return res;
  throw new Error('network unavailable');
}

async function networkFirstNoStore(request, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('navigation timeout')), timeoutMs);
  });
  try {
    return await Promise.race([fetch(request), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function handleNavigate(request) {
  try {
    const res = await networkFirstNoStore(request, NAV_TIMEOUT_MS);
    if (cacheableSameOrigin(res)) {
      const copy = res.clone();
      await safePut(PAGES_CACHE, request, copy);
      await trimCache(PAGES_CACHE, 30);
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match('/');
    if (shell) return shell;
    throw new Error('offline and no cached shell');
  }
}

async function putThirdParty(request, response, maxEntries) {
  try {
    const cache = await caches.open(THIRD_PARTY_CACHE);
    await cache.put(request, response.clone());
    await trimCache(THIRD_PARTY_CACHE, maxEntries);
  } catch {}
}

async function handleArJs(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then(async (res) => {
      if (res && (res.status === 200 || res.status === 0)) await putThirdParty(request, res, 5);
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    if (!isFresh(cached.headers.get('date'), AR_JS_MAX_AGE_MS)) networkPromise.catch(() => undefined);
    return cached;
  }
  const res = await networkPromise;
  if (res) return res;
  throw new Error('network unavailable');
}

async function handleMinky(request) {
  try {
    const res = await fetch(request);
    if (res && (res.status === 200 || res.status === 0)) await putThirdParty(request, res, 10);
    if (res) return res;
  } catch {}
  const cached = await caches.match(request);
  if (cached) return cached;
  throw new Error('network unavailable');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (url.origin === 'https://u.widget.st' && url.pathname === '/ar.js') {
      event.respondWith(handleArJs(req));
    } else if (url.origin === 'https://minky.materii.dev') {
      event.respondWith(handleMinky(req));
    }

    return;
  }

  if (url.pathname === '/patchversion.txt') return;

  if (url.pathname.startsWith('/_astro/') && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(cacheFirst(req, ASTRO_CACHE));
    return;
  }

  if (url.pathname.startsWith('/img/')) {
    event.respondWith(staleWhileRevalidate(req, IMG_CACHE, 60));
    return;
  }

  if (url.pathname === '/blog/rss.xml') {
    event.respondWith(fetch(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, PAGES_CACHE, 30));
});
