const ASTRO_CACHE = 'lyssa-astro';
const IMG_CACHE = 'lyssa-img';
const PAGES_CACHE = 'lyssa-pages';
const THIRD_PARTY_CACHE = 'lyssa-3p';
const KNOWN_CACHES = [ASTRO_CACHE, IMG_CACHE, PAGES_CACHE, THIRD_PARTY_CACHE];

const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', () => self.skipWaiting());

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

async function put(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (let i = 0; i + maxEntries < keys.length; i++) {
    await cache.delete(keys[i]);
  }
}

function cacheableSameOrigin(res) {
  return res.status === 200 && res.type === 'basic';
}

function cacheableThirdParty(res) {
  return res.status === 200 || res.status === 0;
}

function fetchAndStore(event, cacheName, maxEntries, cacheable) {
  const network = fetch(event.request);
  event.waitUntil(
    network
      .then((res) => cacheable(res) && put(cacheName, event.request, res.clone(), maxEntries))
      .catch(() => {}),
  );
  return network;
}

async function staleWhileRevalidate(event, cacheName, maxEntries, cacheable = cacheableSameOrigin) {
  const network = fetchAndStore(event, cacheName, maxEntries, cacheable);
  return (await caches.match(event.request)) || network;
}

async function networkFirst(event, cacheName, maxEntries, cacheable) {
  try {
    return await fetchAndStore(event, cacheName, maxEntries, cacheable);
  } catch (err) {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    throw err;
  }
}

// Fall back to cached page if network is taking too long
async function handleNavigate(event) {
  const network = fetchAndStore(event, PAGES_CACHE, 30, cacheableSameOrigin);
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(resolve, NAV_TIMEOUT_MS);
  });
  const first = await Promise.race([network, slow]).catch(() => undefined);
  clearTimeout(timer);
  if (first) return first;
  return (await caches.match(event.request)) || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (url.origin === 'https://u.widget.st' && url.pathname === '/ar.js') {
      event.respondWith(staleWhileRevalidate(event, THIRD_PARTY_CACHE, 10, cacheableThirdParty));
    } else if (url.origin === 'https://minky.materii.dev') {
      event.respondWith(networkFirst(event, THIRD_PARTY_CACHE, 10, cacheableThirdParty));
    }
    return;
  }

  if (url.pathname === '/patchversion.txt' || url.pathname === '/blog/rss.xml' || url.pathname.startsWith('/img/donate/')) {
    return;
  }

  if (url.pathname.startsWith('/_astro/') && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(staleWhileRevalidate(event, ASTRO_CACHE, 20));
    return;
  }

  if (url.pathname.startsWith('/img/')) {
    event.respondWith(staleWhileRevalidate(event, IMG_CACHE, 60));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, PAGES_CACHE, 30));
});
