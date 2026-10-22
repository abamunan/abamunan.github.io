// Service worker for the NEW Money Tracker only. Registered with scope '/apps/money/'
// (see data/pwa.js + ../shared/sw-register.js), so it never touches the old moneytracker.html,
// healthtracker.html, diary, garments or any other page on the site.
//
// Strategy: cache-first app shell, stale-while-revalidate in the background, so the app opens
// instantly and still picks up changes next time it's online. Offline navigations fall back to
// the cached index.html (this is a single-page app: the URL hash picks the tab, not the path).
//
// Update flow: a new SW install does NOT auto-activate over an existing one — it waits. When the
// person is ready, sw-register.js shows a toast and posts {type:'SKIP_WAITING'} (handled below),
// which lets the new SW take over and the page reload once. A brand new install (nothing
// controlling the page yet) activates immediately — that's normal Service Worker behaviour and
// needs no extra code here.
//
// Bump CACHE_VERSION whenever a file in PRECACHE is added, removed or renamed, so old caches are
// dropped on activate instead of lingering. Editing a file's CONTENTS does not need a bump: the
// stale-while-revalidate fetch handler refreshes it in the background on the next load anyway.
const CACHE_VERSION = 'v10';
const CACHE_NAME = `money-shell-${CACHE_VERSION}`;
const SHELL_FALLBACK = '/apps/money/index.html';

const PRECACHE = [
  '/apps/money/index.html',
  '/apps/money/manifest.json',
  '/apps/money/app.css',
  '/apps/money/main.js',
  '/apps/money/icons.js',
  '/apps/money/icon-192.png',
  '/apps/money/icon-512.png',
  '/apps/money/icon-touch.png',
  '/apps/money/data/pwa.js',
  '/apps/money/components/add-sheet.js',
  '/apps/money/components/backup-guard.js',
  '/apps/money/components/calculator.js',
  '/apps/money/components/charts.js',
  '/apps/shared/download.js',
  '/apps/money/components/entry-actions.js',
  '/apps/money/components/entry-row.js',
  '/apps/money/components/form-sheet.js',
  '/apps/money/data/backup.js',
  '/apps/money/data/defaults.js',
  '/apps/money/data/export.js',
  '/apps/money/data/keys.js',
  '/apps/money/data/report-files.js',
  '/apps/money/data/storage.js',
  '/apps/money/data/sync.js',
  '/apps/money/data/xlsx.js',
  '/apps/shared/xlsx.js',
  '/apps/money/domain/calc.js',
  '/apps/money/domain/categories.js',
  '/apps/money/domain/entries.js',
  '/apps/money/domain/expr.js',
  '/apps/money/domain/insights.js',
  '/apps/money/domain/plan.js',
  '/apps/money/domain/reconcile.js',
  '/apps/money/domain/report.js',
  '/apps/money/domain/search.js',
  '/apps/money/domain/totals.js',
  '/apps/money/domain/viewmodels.js',
  '/apps/money/views/export.js',
  '/apps/money/views/history.js',
  '/apps/money/views/insights.js',
  '/apps/money/views/manage.js',
  '/apps/money/views/more.js',
  '/apps/money/views/plan.js',
  '/apps/money/views/accounts.js',
  '/apps/money/views/today.js',
  '/apps/shared/confirm.js',
  '/apps/shared/dom.js',
  '/apps/shared/fmt.js',
  '/apps/shared/lock.js',
  '/apps/shared/sheet.js',
  '/apps/shared/splash.js',
  '/apps/shared/store.js',
  '/apps/shared/sw-register.js',
  '/apps/shared/tabbar.js',
  '/apps/shared/toast.js',
  '/apps/shared/ui.css',
  '/site.css?v=3',
  '/theme.js',
  '/owner.js'
  // apps/shared/firestore.js is deliberately left out: it only loads once someone signs in, and
  // caching the Firebase SDK wrapper risks serving a stale copy after a login or rules change.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('money-shell-') && k !== CACHE_NAME).map(k => caches.delete(k))))
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
