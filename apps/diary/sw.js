// Service worker for the NEW diary only. Registered with scope '/apps/diary/' (see data/pwa.js), so it never
// touches diary.html, the Money/Health trackers or any other page.
// Strategy (same as Money): cache-first app shell + stale-while-revalidate; offline navigations get index.html.
// A new worker waits until the person taps "Reload" (sw-register.js posts SKIP_WAITING).
// Bump CACHE_VERSION whenever a file in PRECACHE is added, removed or renamed.
const CACHE_VERSION = 'v4';
const CACHE_NAME = `diary-shell-${CACHE_VERSION}`;
const SHELL_FALLBACK = '/apps/diary/index.html';

const PRECACHE = [
  '/apps/diary/app.css',
  '/apps/diary/components/entry-row.js',
  '/apps/diary/components/entry-sheet.js',
  '/apps/diary/components/export-sheet.js',
  '/apps/diary/components/lock-screen.js',
  '/apps/diary/components/lock-settings.js',
  '/apps/diary/components/memory-card.js',
  '/apps/diary/components/memory-reader.js',
  '/apps/diary/components/pin-pad.js',
  '/apps/diary/components/print.js',
  '/apps/diary/components/restore-sheet.js',
  '/apps/diary/data/backends.js',
  '/apps/diary/data/backup.js',
  '/apps/diary/data/keys.js',
  '/apps/diary/data/lock.js',
  '/apps/diary/data/pwa.js',
  '/apps/diary/data/remote.js',
  '/apps/diary/data/restore.js',
  '/apps/diary/data/schema.js',
  '/apps/diary/data/storage.js',
  '/apps/diary/data/sync.js',
  '/apps/diary/domain/calendar.js',
  '/apps/diary/domain/dates.js',
  '/apps/diary/domain/entries.js',
  '/apps/diary/domain/export.js',
  '/apps/diary/domain/memories.js',
  '/apps/diary/domain/moods.js',
  '/apps/diary/domain/search.js',
  '/apps/diary/domain/tags.js',
  '/apps/diary/icon-192.png',
  '/apps/diary/icon-512.png',
  '/apps/diary/icon-touch.png',
  '/apps/diary/icons.js',
  '/apps/diary/index.html',
  '/apps/diary/main.js',
  '/apps/diary/manifest.json',
  '/apps/diary/views/calendar.js',
  '/apps/diary/views/memories.js',
  '/apps/diary/views/more.js',
  '/apps/diary/views/timeline.js',
  '/apps/diary/views/today.js',
  '/apps/shared/dom.js',
  '/apps/shared/store.js',
  '/apps/shared/splash.js',
  '/apps/shared/tabbar.js',
  '/apps/shared/toast.js',
  '/apps/shared/sheet.js',
  '/apps/shared/confirm.js',
  '/apps/shared/download.js',
  '/apps/shared/sw-register.js',
  '/apps/shared/firestore.js',
  '/apps/shared/ui.css',
  '/site.css?v=3',
  '/theme.js',
  '/owner.js',
  '/scroll-nav.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => PRECACHE.reduce(
      (ready, url) => ready.then(() => cache.add(url)),
      Promise.resolve()
    ))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('diary-shell-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // fonts, Firebase SDK etc. go straight to the network

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok) event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone())));
      return res;
    }).catch(() => null);
    if (cached) { network; return cached; }
    const fresh = await network;
    if (fresh) return fresh;
    if (req.mode === 'navigate') return (await caches.match(SHELL_FALLBACK)) || Response.error();
    return Response.error();
  })());
});
