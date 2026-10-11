// Service worker for the NEW Health Tracker only. Registered with scope '/apps/health/'
// (see data/pwa.js + ../shared/sw-register.js), so it never touches the old healthtracker.html, the Money Tracker,
// diary, garments or any other page on the site. Same design as apps/money/sw.js.
//
// Strategy: cache-first app shell, stale-while-revalidate in the background, so the app opens instantly and still
// picks up changes next time it is online. Offline navigations fall back to the cached index.html (this is a
// single-page app: the URL hash picks the tab, not the path). Your health data is NOT in this cache: it lives in
// localStorage and Firestore, which this worker never touches.
//
// Update flow: a new SW install does NOT auto-activate over an existing one; it waits. When the person is ready,
// sw-register.js shows a toast and posts {type:'SKIP_WAITING'} (handled below), which lets the new SW take over and
// the page reload once. A brand new install (nothing controlling the page yet) activates immediately.
//
// Bump CACHE_VERSION whenever a file in PRECACHE is added, removed or renamed, so old caches are dropped on activate
// instead of lingering. Editing a file's CONTENTS does not need a bump: the stale-while-revalidate fetch handler
// refreshes it in the background on the next load anyway. tests/run.mjs checks that PRECACHE matches the real
// import graph of main.js, so a forgotten file fails the test instead of failing offline on someone's phone.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `health-shell-${CACHE_VERSION}`;
const SHELL_FALLBACK = '/apps/health/index.html';

const PRECACHE = [
  '/apps/health/app.css',
  '/apps/health/icon-192.png',
  '/apps/health/icon-512.png',
  '/apps/health/icon-touch.png',
  '/apps/health/icons.js',
  '/apps/health/index.html',
  '/apps/health/main.js',
  '/apps/health/manifest.json',
  '/apps/health/components/backup-guard.js',
  '/apps/health/components/charts.js',
  '/apps/health/components/day-form.js',
  '/apps/health/components/export-sheet.js',
  '/apps/health/components/restore.js',
  '/apps/health/components/settings-sheet.js',
  '/apps/health/data/backup.js',
  '/apps/health/data/defaults.js',
  '/apps/health/data/keys.js',
  '/apps/health/data/pwa.js',
  '/apps/health/data/report-files.js',
  '/apps/health/data/storage.js',
  '/apps/health/data/sync.js',
  '/apps/health/domain/calendar.js',
  '/apps/health/domain/day.js',
  '/apps/health/domain/guide-content.js',
  '/apps/health/domain/guide.js',
  '/apps/health/domain/insights.js',
  '/apps/health/domain/lock.js',
  '/apps/health/domain/metrics.js',
  '/apps/health/domain/report.js',
  '/apps/health/domain/search.js',
  '/apps/health/domain/stats.js',
  '/apps/health/views/guide.js',
  '/apps/health/views/history.js',
  '/apps/health/views/insights.js',
  '/apps/health/views/more.js',
  '/apps/health/views/today.js',
  '/apps/shared/confirm.js',
  '/apps/shared/dom.js',
  '/apps/shared/download.js',
  '/apps/shared/sheet.js',
  '/apps/shared/splash.js',
  '/apps/shared/store.js',
  '/apps/shared/sw-register.js',
  '/apps/shared/tabbar.js',
  '/apps/shared/toast.js',
  '/apps/shared/ui.css',
  '/apps/shared/xlsx.js',
  '/owner.js',
  '/site.css?v=3',     // exact URL as index.html links it: the Cache API treats a different query string as a different file
  '/theme.js'
  // apps/shared/firestore.js is deliberately left out: it only loads once someone signs in, and caching the
  // Firebase SDK wrapper risks serving a stale copy after a login or rules change.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('health-shell-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// sw-register.js posts this once the person taps "Reload" on the update toast.
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                              // never touch writes; Firestore's own channel isn't a fetch anyway
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                // fonts, Firebase SDK, etc. go straight to the network

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
      return res;
    }).catch(() => null);
    if (cached) { network; return cached; }                       // serve the cached copy now, refresh it in the background
    const fresh = await network;
    if (fresh) return fresh;
    if (req.mode === 'navigate') return (await caches.match(SHELL_FALLBACK)) || Response.error();
    return Response.error();
  })());
});
