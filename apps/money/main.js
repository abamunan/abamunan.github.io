import { h } from '../shared/dom.js';
import { createStore } from '../shared/store.js';
import { initSplash } from '../shared/splash.js';
import { mountTabbar } from '../shared/tabbar.js';
import { toast } from '../shared/toast.js';
import { NEW_KEYS } from './data/keys.js';
import { createRepo } from './data/storage.js';
import { initialSync } from './data/sync.js';
import { backupGuard } from './components/backup-guard.js';
import { openAddSheet } from './components/add-sheet.js';
import { todayView } from './views/today.js';
import { historyView } from './views/history.js';
import { moreView } from './views/more.js';
import { insightsView } from './views/insights.js';
import { planView } from './views/plan.js';
import { icon } from './icons.js';
import { mountCalculator } from './components/calculator.js';
import { initPWA } from './data/pwa.js';

const splash = initSplash(document.getElementById('splash'), { total: 6 });
const chip = document.getElementById('syncState');
const sideSyncLbl = document.getElementById('sidebarSyncLabel');
const say = (t, cls = '', title = '') => {
  chip.textContent = t;
  chip.className = 'sync ' + cls;
  chip.title = title || t;
  if (sideSyncLbl) {
    sideSyncLbl.textContent = t;
    const parent = sideSyncLbl.closest('.sidebar-sync-pill');
    if (parent) parent.className = 'sidebar-sync-pill ' + (cls ? 'sidebar-sync-pill--wait' : '');
  }
};
const store = createStore({ outboxKey: NEW_KEYS.outbox, onState: s => say(s.pending ? `${s.pending} unsynced` : 'Synced', s.pending ? 'sync--wait' : '') });
const repo = createRepo({ store, backupGuard });
const app = { repo, store, state: {}, refresh: () => render() };
app.installChanged = () => { if (current === 'more') render(); };
app.calc = mountCalculator();
const views = { today: todayView, history: historyView, insights: insightsView, plan: planView, more: moreView };
const main = document.getElementById('main'); let current = 'today';
function render() { try { views[current](main, app); } catch (e) { console.error(e); main.replaceChildren(h('p', { class: 'empty' }, 'Something went wrong showing this screen. Your data is safe.')); } }
const TABS = [['today', 'Today'], ['history', 'History'], ['insights', 'Insights'], ['plan', 'Plan'], ['more', 'More']].map(([id, label]) => ({ id, label, icon: icon(id) }));
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
initPWA(app);   // service worker + install-prompt tracking; never blocks first paint, never touches app data

(async () => {                                              // cloud is optional: the app is already usable from local data
  try {
    const fsMod = await import('../shared/firestore.js').catch(() => null); splash.step('Signing in');
    const user = fsMod && await fsMod.requireUser({ redirect: '../../login.html?redirect=apps/money/index.html' });
    if (!user) { say('Offline', 'sync--wait', 'Offline \u2014 changes are saved on this device and sync when you are back online'); return; }
    app.remote = fsMod.firestoreRemote(); await store.setRemote(app.remote); say('Syncing\u2026');
    const rep = await Promise.race([initialSync(repo, store, name => splash.step(name)), new Promise(r => setTimeout(() => r(null), 6000))]);
    render(); say(store.pendingCount() ? `${store.pendingCount()} unsynced` : 'Synced', store.pendingCount() ? 'sync--wait' : '');
    if (rep?.errors?.length) toast('Some data could not be synced. Working from this device.', { error: true });
  } catch (e) { console.warn(e); say('Offline', 'sync--wait', 'Offline \u2014 changes are saved on this device and sync when you are back online'); }
  finally { splash.finish(); }
})();
