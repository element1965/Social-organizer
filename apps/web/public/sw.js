// Service worker: Web Push + a small offline layer (app shell and immutable build assets).
//
// Safety rules (the native apps load the production URL, so a bad worker could pin people to an old build):
//  - The HTML shell is network-first. The cached copy is used only when the network fails or is very slow.
//  - Hashed build files are cache-first, but only real files: an HTML answer for a script URL (the SPA fallback
//    of a deleted chunk) is never cached, and it is returned as it is so the page's own reload logic can recover.
//  - Never touched: /trpc, /api, /gun, /health, videos, source maps, cross-origin, non-GET and range requests.
//  - Kill switch: replace this file with a worker that has no fetch handler and calls
//    registration.unregister() plus caches.delete() in `activate`. The browser installs it on the next update check.

const VERSION = 'v1';
const SHELL_CACHE = `so-shell-${VERSION}`;
const ASSET_CACHE = `so-assets-${VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE];
const SHELL_URL = '/index.html';
const NAVIGATION_TIMEOUT_MS = 3500;
const MAX_ASSET_ENTRIES = 250;

const NEVER_HANDLE = [/^\/trpc(\/|$)/, /^\/api(\/|$)/, /^\/gun(\/|$)/, /^\/health(\/|$)/, /^\/videos\//, /^\/sw\.js$/, /\.map$/];
const IMMUTABLE = [/^\/assets\//, /^\/fonts\//];
const REVALIDATED_STATIC = new Set(['/logo.png', '/logo-dark.png', '/favicon.ico', '/manifest.webmanifest']);

/* ---------- lifecycle ---------- */

self.addEventListener('install', (event) => {
  // A failed precache must never block the install: the worker still works, it just caches as pages load.
  event.waitUntil(precacheShell().catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith('so-') && !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name)));
      } catch {
        /* cache storage unavailable */
      }
      await self.clients.claim();
    })(),
  );
});

/* ---------- helpers ---------- */

function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html');
}

/** Hashed files the shell asks for: the entry script, its preloads and the stylesheet. */
function assetUrlsOf(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(match[1]);
  return [...urls].sort();
}

async function precacheShell() {
  const response = await fetch(SHELL_URL, { cache: 'reload' });
  if (!response.ok || !isHtml(response)) return;
  await storeShell(response);
}

let shellQueue = Promise.resolve();

/** Keep the newest shell. Runs are serialized: two navigations finishing together never interleave their cache work. */
function storeShell(response) {
  const run = shellQueue.then(() => storeShellNow(response));
  shellQueue = run.catch(() => undefined);
  return run;
}

function pathOf(url) {
  try {
    return new URL(url, self.location.origin).pathname;
  } catch {
    return url;
  }
}

async function storeShellNow(response) {
  // A redirected response cannot be served to a navigation later
  if (response.redirected) return;
  const html = await response.clone().text();
  // Other HTML answers (a domain verification page, an error page) are not the app.
  if (!html.includes('id="root"')) return;
  const shells = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const previous = await shells.match(SHELL_URL);
  const previousUrls = previous ? assetUrlsOf(await previous.text()) : [];
  const urls = assetUrlsOf(html);

  // 1. The new entry files first. If one cannot be downloaded the old shell stays: a stored shell never points
  //    at files the device does not have.
  await Promise.all(
    urls.map(async (url) => {
      if (await assets.match(url)) return;
      const file = await fetch(url);
      if (!isCacheableAsset(file)) throw new Error('entry file unavailable: ' + url);
      await assets.put(url, file);
    }),
  );
  // 2. Then the shell.
  await shells.put(SHELL_URL, response);
  // 3. Then forget build files that neither this shell nor the previous one uses. The previous build is kept so a
  //    tab that is still open on it keeps working.
  if (previousUrls.join('|') !== urls.join('|')) {
    const keep = new Set([...urls, ...previousUrls]);
    for (const request of await assets.keys()) {
      const path = pathOf(request.url);
      if (path.startsWith('/assets/') && !keep.has(path)) await assets.delete(request);
    }
  }
}

/** Never keep an HTML answer for a file URL: the SPA fallback returns 200 HTML for any missing file. */
function isCacheableAsset(response) {
  return response.status === 200 && response.type === 'basic' && !isHtml(response);
}

async function trimAssets(cache) {
  const keys = await cache.keys();
  let extra = keys.length - MAX_ASSET_ENTRIES;
  if (extra <= 0) return;
  // The entry files of the stored shell were cached first, so they are the oldest: never evict them
  const shell = await (await caches.open(SHELL_CACHE)).match(SHELL_URL);
  const entry = new Set(shell ? assetUrlsOf(await shell.text()) : []);
  for (const request of keys) {
    if (extra <= 0) break;
    if (entry.has(pathOf(request.url))) continue;
    await cache.delete(request);
    extra -= 1;
  }
}

function remember(event, work) {
  const promise = work.catch(() => undefined);
  try {
    event.waitUntil(promise);
  } catch {
    /* the event is already finished: the work still runs while the worker lives */
  }
}

/* ---------- strategies ---------- */

async function handleNavigation(event, refreshed) {
  const request = event.request;
  const network = fetch(request).then(
    (response) => {
      if (response.ok && isHtml(response)) storeShell(response.clone()).catch(() => undefined).finally(refreshed);
      else refreshed();
      return response;
    },
    (error) => {
      refreshed();
      throw error;
    },
  );
  const cachedShell = () =>
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.match(SHELL_URL))
      .catch(() => undefined);

  try {
    const timer = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
    const first = await Promise.race([network, timer]);
    if (first) {
      // A fast server-error page from the edge is worse than the saved shell (4xx stays as it is)
      if (first.status >= 500) {
        const shell = await cachedShell();
        if (shell) return shell;
      }
      return first;
    }
    // Very slow network: show the saved shell now, the answer still refreshes it for the next load.
    const shell = await cachedShell();
    if (shell) {
      network.catch(() => undefined);
      return shell;
    }
    return await network;
  } catch (error) {
    const shell = await cachedShell();
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirst(event) {
  const request = event.request;
  let cache = null;
  try {
    cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
  } catch {
    cache = null;
  }
  const response = await fetch(request);
  if (cache && isCacheableAsset(response)) {
    try {
      const copy = response.clone();
      remember(event, cache.put(request, copy).then(() => trimAssets(cache)));
    } catch {
      /* a failed cache write never breaks the response */
    }
  }
  return response;
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  let cache = null;
  let hit;
  try {
    cache = await caches.open(ASSET_CACHE);
    hit = await cache.match(request, { ignoreVary: true });
  } catch {
    cache = null;
  }
  const refresh = fetch(request).then((response) => {
    if (cache && isCacheableAsset(response)) {
      try {
        remember(event, cache.put(request, response.clone()));
      } catch {
        /* ignore */
      }
    }
    return response;
  });
  if (hit) {
    refresh.catch(() => undefined);
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (NEVER_HANDLE.some((pattern) => pattern.test(path))) return;

  if (request.mode === 'navigate') {
    // The cache refresh is registered with the event right now, before respondWith settles, so it also runs when
    // the saved shell is shown first (slow network) and the real answer arrives later.
    let refreshed;
    event.waitUntil(new Promise((resolve) => (refreshed = resolve)));
    event.respondWith(handleNavigation(event, refreshed));
  } else if (IMMUTABLE.some((pattern) => pattern.test(path))) {
    event.respondWith(cacheFirst(event));
  } else if (REVALIDATED_STATIC.has(path)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

/* ---------- Web Push ---------- */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Social Organizer', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'Social Organizer', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
