import { h } from '../shared/dom.js';
import { createStore } from '../shared/store.js';
import { pickBackend, migrateLegacy } from './data/backends.js';
import { createLock } from './data/lock.js';
import { showLock } from './components/lock-screen.js';
import { initSplash } from '../shared/splash.js';
import { mountTabbar } from '../shared/tabbar.js';
import { toast } from '../shared/toast.js';
import { confirmDialog } from '../shared/confirm.js';
import { K } from './data/keys.js';
import { createRepo } from './data/storage.js';
import { pull } from './data/sync.js';
import { initPWA } from './data/pwa.js';
import { blankDraft, draftFromEntry } from './domain/entries.js';
import { todayView } from './views/today.js';
import { timelineView } from './views/timeline.js';
import { calendarView } from './views/calendar.js';
import { memoriesView } from './views/memories.js';
import { moreView } from './views/more.js';
import { icon } from './icons.js';
import '../../scroll-nav.js';

const splash = initSplash(document.getElementById('splash'), { total: 4 });
const chip = document.getElementById('syncState');
const main = document.getElementById('main');

// mode: 'local' = this device only (signed out / unverified / offline / other account's data), 'cloud' = syncing.
const app = { mode: 'local', localReason: 'Local only', user: null, remote: null, blocked: false, lastPullTry: 0,
  lastSyncMs: Number(localStorage.getItem(K.lastSync)) || 0, state: { today: blankDraft(), search: '', tag: '', cal: null } };

const store = createStore({ outboxKey: K.outbox, onState: () => { paintChip(); app.onState?.(); } });

// Entries live in IndexedDB (localStorage is only a fallback). Phase 1/2 entries are moved over once, verified before deleting.
const backend = await pickBackend(store);
try { await migrateLegacy({ store, backend }); } catch (e) { console.warn('Storage migration skipped:', e); }
if (backend.kind === 'idb') store.setRaw(K.backend, 'idb');
else if (store.getRaw(K.backend) === 'idb') setTimeout(() => toast('Device storage is unavailable right now, so entries may look missing until it recovers. Nothing was deleted.', { error: true }), 1500);
navigator.storage?.persist?.().catch(() => {});          // ask the browser not to evict the diary when space is low

let lastStorageToast = 0;
const repo = await createRepo({ store, backend, onError: e => {
  console.error('Local save failed:', e);
  if (Date.now() - lastStorageToast > 10000) { lastStorageToast = Date.now(); toast('Could not save on this device — storage may be full. Download a backup and free some space.', { error: true }); }
} });
app.store = store; app.repo = repo;

// App lock (PIN). Cold start with a PIN set: nothing is rendered until it is entered.
const lock = createLock(localStorage);
app.lock = lock; app.locked = lock.isEnabled();
let lockPromise = null;
function lockNow() {
  if (!lock.isEnabled()) return Promise.resolve();
  if (lockPromise) return lockPromise;
  try { app.flushEditor?.(); } catch (e) { console.error(e); }
  app.locked = true; render();                         // empties #main (the editor flushes its last keystrokes first)
  lockPromise = showLock(app).then(() => { app.locked = false; lockPromise = null; render(); });
  return lockPromise;
}
app.lockNow = lockNow;
app.wipeDevice = async () => {
  await repo.clearAll();
  [K.outbox, K.owner, K.lastSync, K.lock, K.backend].forEach(k => store.remove(k));
  location.reload();
};

function paintChip() {
  const p = store.pendingCount();
  let text = 'Synced', cls = '';
  if (app.mode !== 'cloud') { text = app.localReason; cls = 'sync--wait'; }
  else if (p) { text = `${p} unsynced`; cls = 'sync--wait'; }
  chip.textContent = text; chip.className = 'sync ' + cls; chip.title = text;
}
function setLocal(reason) { app.mode = 'local'; app.localReason = reason; paintChip(); }

// ---------- routing ----------
const views = { today: todayView, timeline: timelineView, calendar: calendarView, memories: memoriesView, more: moreView };
let current = 'today', dispose = null;

function ownerGate() {
  return h('section', { class: 'dy-card dm-card' }, h('h2', { class: 'dm-h' }, 'Another account’s diary is on this device'),
    h('p', { class: 'dm-note' }, 'To protect that diary, nothing is shown or synced here. Sign in with the right account, or clear this device first.'),
    h('div', { class: 'dm-links' },
      h('a', { class: 'ui-btn ui-btn--ghost', href: '../../login.html?redirect=apps/diary/index.html' }, 'Sign in again'),
      h('button', { class: 'ui-btn ui-btn--ghost dy-danger', type: 'button', onclick: async () => {
        if (!(await confirmDialog({ title: 'Clear this device?', danger: true, typeToConfirm: 'CLEAR', confirmLabel: 'Clear',
          message: 'Removes the diary copy stored on this device (including unsynced changes).' }))) return;
        app.wipeDevice();
      } }, 'Clear this device')));
}

function render() {
  try { dispose?.(); } catch (e) { console.error(e); }
  dispose = null; main.dataset.view = current;
  if (app.locked) { main.replaceChildren(); return; }
  if (app.blocked) { main.replaceChildren(ownerGate()); return; }
  try { dispose = views[current](main, app) || null; }
  catch (e) { console.error(e); main.replaceChildren(h('p', { class: 'dy-empty' }, 'Something went wrong showing this screen. Your entries are safe on this device.')); }
}
app.refresh = render;

const go = id => { if (current === id && location.hash.slice(1) === id) render(); else location.hash = id; };
app.newEntry = date => { app.state.today = blankDraft(); if (date) app.state.today.date = date; go('today'); };
app.edit = id => { const e = repo.get(id); if (!e) return; app.state.today = draftFromEntry(e); go('today'); };

const TABS = [['today', 'Write'], ['timeline', 'Timeline'], ['calendar', 'Calendar'], ['memories', 'Memories'], ['more', 'More']].map(([id, label]) => ({ id, label, icon: icon(id) }));
const tabs = mountTabbar(document.getElementById('tabbar'), TABS, { active: 'today', onSelect: id => { location.hash = id; } });
const route = () => { const id = location.hash.slice(1); current = views[id] ? id : 'today'; tabs.select(current); render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); };
window.addEventListener('hashchange', route);

repo.subscribe(info => {
  if (app.blocked || app.locked) return;
  if (current === 'today') app.onExternal?.(info);
  else {
    render();
    if (info.type === 'conflict' && info.copyId) toast('An entry was edited on another device. Your version was kept as a separate entry.', { action: 'View', onAction: () => app.edit(info.copyId), timeout: 8000 });
  }
});

// ---------- sync ----------
app.sync = async ({ quiet = false } = {}) => {
  if (app.mode !== 'cloud') return null;
  app.lastPullTry = Date.now();
  try {
    await store.flush();
    const r = await pull({ repo, store, remote: app.remote });
    app.lastSyncMs = Date.now(); localStorage.setItem(K.lastSync, String(app.lastSyncMs)); paintChip();
    return r;
  } catch (e) {
    console.warn(e);
    if (!quiet) toast('Could not sync — you may be offline. Your entries are safe on this device.', { error: true });
    return null;
  }
};

let connecting = false;
async function connectCloud() {
  if (connecting || app.mode === 'cloud' || app.blocked || !app.user) return;
  connecting = true;
  try {
    const mod = await import('./data/remote.js').catch(() => null);
    if (!mod) { setLocal('Offline · saved on this device'); return; }
    app.remote = mod.diaryRemote({ base: repo.base, onWritten: repo.markSynced, onConflict: repo.forkConflict });
    app.mode = 'cloud'; paintChip();
    await store.setRemote(app.remote);
    await Promise.race([app.sync({ quiet: true }), new Promise(r => setTimeout(r, 6000))]);
    paintChip();
  } catch (e) { console.warn(e); app.mode = 'local'; setLocal('Offline · saved on this device'); }
  finally { connecting = false; }
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    app.flushEditor?.(); hiddenAt = Date.now();
    if (lock.isEnabled() && lock.timeoutMs() === 0) lockNow();     // 'Immediately': gone before the app switcher takes its picture
  } else {
    if (lock.isEnabled() && !app.locked && hiddenAt && Date.now() - hiddenAt >= lock.timeoutMs()) lockNow();
    hiddenAt = 0;
    if (app.mode === 'cloud' && Date.now() - app.lastPullTry > 30000) app.sync({ quiet: true });
  }
});
window.addEventListener('pagehide', () => app.flushEditor?.());
window.addEventListener('online', () => { if (app.mode === 'cloud') app.sync({ quiet: true }); else connectCloud(); });

// ---------- theme (same behaviour as Money Tracker) ----------
const themeBtn = document.getElementById('mobileThemeBtn');
const syncTheme = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark'; themeBtn?.classList.toggle('is-dark', dark); themeBtn?.setAttribute('aria-pressed', String(dark)); };
themeBtn?.addEventListener('click', () => { window.MunanTheme?.toggle(); syncTheme(); });
window.addEventListener('storage', e => { if (e.key === 'theme') syncTheme(); });
syncTheme();

// ---------- boot ----------
route(); splash.step('Local data ready'); paintChip();
if (app.locked) { app.locked = false; lockNow(); }     // cold start behind a PIN
initPWA(app);                                   // service worker + install prompt; never blocks first paint

(async () => {                                  // the cloud is optional: the app is already usable from local data
  try {
    const fsMod = await import('../shared/firestore.js').catch(() => null); splash.step('Signing in');
    const user = fsMod && await fsMod.optionalUser();
    if (!user) { setLocal('Local only · sign in to sync'); return; }
    const owner = store.getRaw(K.owner);
    if (owner && owner !== user.uid) { app.blocked = true; render(); setLocal('Different account'); return; }
    if (!owner) store.setRaw(K.owner, user.uid);
    app.user = user;
    if (!user.emailVerified) { setLocal('Verify your email to sync'); return; }
    splash.step('Syncing');
    await connectCloud();
    if (current !== 'today') render();
  } catch (e) { console.warn(e); setLocal('Offline · saved on this device'); }
  finally { splash.finish(); }
})();
