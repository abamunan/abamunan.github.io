import { h } from '../shared/dom.js';
import { createStore } from '../shared/store.js';
import { initSplash } from '../shared/splash.js';
import { mountTabbar } from '../shared/tabbar.js';
import { toast } from '../shared/toast.js';
import { NEW_KEYS, CLOUD_MERGE } from './data/keys.js';
import { confirmDialog } from '../shared/confirm.js';
import { createRepo } from './data/storage.js';
import { initialSync } from './data/sync.js';
import { backupGuard } from './components/backup-guard.js';
import { openAddSheet } from './components/add-sheet.js';
import { todayView } from './views/today.js';
import { historyView } from './views/history.js';
import { moreView } from './views/more.js';
import { insightsView } from './views/insights.js';
import { planView } from './views/plan.js';
import { accountsView } from './views/accounts.js';
import { icon } from './icons.js';
import { mountCalculator } from './components/calculator.js';
import { initPWA } from './data/pwa.js';
import '../../scroll-nav.js';

const splash = initSplash(document.getElementById('splash'), { total: 6 });
const chip = document.getElementById('syncState');
const sideSyncLbl = document.getElementById('sidebarSyncLabel');
const say = (t, cls = '', title = '') => {
  if (chip) {
    chip.textContent = t;
    chip.className = 'sync ' + cls;
    chip.title = title || t;
  }
  if (sideSyncLbl) {
    sideSyncLbl.textContent = t;
    const parent = sideSyncLbl.closest('.sidebar-sync-pill');
    if (parent) parent.className = 'sidebar-sync-pill ' + (cls ? 'sidebar-sync-pill--wait' : '');
  }
};
let shownFailed = 0;
const store = createStore({ outboxKey: NEW_KEYS.outbox, onState: s => {
  say(s.failed ? `${s.failed} not synced` : s.pending ? `${s.pending} unsynced` : 'Synced', s.failed || s.pending ? 'sync--wait' : '', s.failed ? 'The cloud refused some changes. They are safe on this device.' : '');
  if (s.failed && s.failed !== shownFailed) toast(`${s.failed} change${s.failed > 1 ? 's' : ''} could not be saved to the cloud. Everything is still safe on this device.`, { error: true, action: 'Retry', timeout: 12000, onAction: () => store.retryFailed() });
  shownFailed = s.failed;
} });
const repo = createRepo({ store, backupGuard });
const app = { repo, store, state: {}, refresh: () => render() };
app.installChanged = () => { if (current === 'more') render(); };
app.calc = mountCalculator();
const views = { today: todayView, history: historyView, insights: insightsView, plan: planView, accounts: accountsView, more: moreView };
const main = document.getElementById('main'); let current = 'today';
function render() {
  main.dataset.view = current;
  try {
    views[current](main, app);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('p', { class: 'empty' }, 'Something went wrong showing this screen. Your data is safe.'));
  }
}
const TABS = [['today', 'Today'], ['history', 'History'], ['insights', 'Insights'], ['plan', 'Plan'], ['accounts', 'Accounts'], ['more', 'More']].map(([id, label]) => ({ id, label, icon: icon(id) }));
const tabs = mountTabbar(document.getElementById('tabbar'), TABS, { active: 'today', onSelect: id => { location.hash = id; } });
const go = () => { const id = location.hash.slice(1); current = views[id] ? id : 'today'; tabs.select(current); render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); };
window.addEventListener('hashchange', go);
document.getElementById('fab').addEventListener('click', () => openAddSheet(repo, { date: new Date(), onDone: render }));
document.getElementById('sidebarAddBtn')?.addEventListener('click', () => document.getElementById('fab')?.click());

const bindTheme = () => {
  const syncIcons = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.theme-icon-btn, .mobile-theme-btn').forEach(btn => {
      btn.classList.toggle('is-dark', isDark);
      btn.setAttribute('aria-pressed', String(isDark));
      btn.title = isDark ? 'Switch to Day (Green-White) Mode' : 'Switch to Dark (Blue-Black) Mode';
    });
  };
  const toggle = () => {
    window.MunanTheme?.toggle();
    syncIcons();
  };
  document.getElementById('sidebarThemeBtn')?.addEventListener('click', toggle);
  document.getElementById('mobileThemeBtn')?.addEventListener('click', toggle);
  window.addEventListener('storage', e => { if (e.key === 'theme') syncIcons(); });
  syncIcons();
};
bindTheme();

go(); splash.step('Local data ready');
let shownDay = new Date().toDateString();           // the Today screen must roll over at midnight even if the app stays open
const rollover = () => { const n = new Date().toDateString(); if (n !== shownDay) { shownDay = n; if (current === 'today') render(); } };
setInterval(rollover, 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
initPWA(app);   // service worker + install-prompt tracking; never blocks first paint, never touches app data

(async () => {                                              // cloud is optional: the app is already usable from local data
  try {
    const fsMod = await import('../shared/firestore.js').catch(() => null); splash.step('Signing in');
    const user = fsMod && await fsMod.optionalUser();
    if (!user) { say('Local only', 'sync--wait', 'Not signed in \u2014 changes are saved on this device only'); return; }
    // Data on this device belongs to the account that first synced it. A different account must not silently receive it (shared phone / laptop).
    const owner = store.getRaw(NEW_KEYS.owner);
    if (owner && owner !== user.uid && !await confirmDialog({ title: 'Different account', message: 'This device holds Money Tracker data from another account. Sync it into the account you are signed in with now? Choose "Keep on this device only" to leave the cloud untouched.', confirmLabel: 'Sync to this account', cancelLabel: 'Keep on this device only' })) {
      say('Local only', 'sync--wait', 'Not synced: this device holds another account\u2019s data'); return;
    }
    try { store.setRaw(NEW_KEYS.owner, user.uid); } catch { /* storage full: sync still works */ }
    app.remote = fsMod.firestoreRemote({ overwrite: true, merge: CLOUD_MERGE }); await store.setRemote(app.remote); say('Syncing\u2026');
    const sync = initialSync(repo, store, name => splash.step(name));
    const done = rep => { render(); say(store.pendingCount() ? `${store.pendingCount()} unsynced` : 'Synced', store.pendingCount() ? 'sync--wait' : '');
      if (rep?.errors?.length) toast('Some data could not be synced. Working from this device.', { error: true }); };
    const rep = await Promise.race([sync, new Promise(r => setTimeout(() => r(null), 6000))]);
    done(rep);
    if (rep === null) sync.then(done, () => {});      // slow network: the sync keeps going after the 6 s wait, and the screen is redrawn when it finishes
    let lastSync = Date.now();                        // the cloud is read again when the app comes back to the foreground, so a second device is picked up without a restart
    const resync = async () => { if (document.hidden || !app.remote || Date.now() - lastSync < 30000) return; lastSync = Date.now(); try { const r = await initialSync(repo, store); done(r); } catch { /* offline: next time */ } };
    document.addEventListener('visibilitychange', resync); window.addEventListener('online', resync);
  } catch (e) { console.warn(e); say('Offline', 'sync--wait', 'Offline \u2014 changes are saved on this device and sync when you are back online'); }
  finally { splash.finish(); }
})();
