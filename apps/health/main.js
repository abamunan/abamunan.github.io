import { h } from '../shared/dom.js';
import { createStore } from '../shared/store.js';
import { initSplash } from '../shared/splash.js';
import { mountTabbar } from '../shared/tabbar.js';
import { toast } from '../shared/toast.js';
import { NEW_KEYS } from './data/keys.js';
import { createRepo } from './data/storage.js';
import { initialSync } from './data/sync.js';
import { todayView } from './views/today.js';
import { historyView } from './views/history.js';
import { insightsView } from './views/insights.js';
import { guideView } from './views/guide.js';
import { moreView } from './views/more.js';
import { openSettingsSheet } from './components/settings-sheet.js';
import { initPWA } from './data/pwa.js';
import { icon } from './icons.js';

const splash = initSplash(document.getElementById('splash'), { total: 4 });
const chip = document.getElementById('syncState');
const say = (t, cls = '', title = '') => { chip.textContent = t; chip.className = 'sync ' + cls; chip.title = title || t; };
const store = createStore({ outboxKey: NEW_KEYS.outbox, onState: s => say(s.pending ? `${s.pending} unsynced` : 'Synced', s.pending ? 'sync--wait' : '') });
const repo = createRepo({ store });
const app = { repo, store, state: {}, form: null };
const views = { today: todayView, history: historyView, insights: insightsView, guide: guideView, more: moreView };
const main = document.getElementById('main'); let current = 'today';

// force=true: the person navigated or changed something. force=false: a background sync finished — never replace a form that is being typed in.
function render(force = true) {
  if (!force && app.form?.busy()) return;
  app.form?.flush(); app.form = null;
  try { views[current](main, app); } catch (e) { console.error(e); main.replaceChildren(h('p', { class: 'empty' }, 'Something went wrong showing this screen. Your data is safe.')); }
}
app.refresh = () => render(true);
app.openSettings = tab => openSettingsSheet(app, tab);
app.installChanged = () => { if (current === 'more') render(true); };     // the Install row lives in More; other screens (and any form being typed in) are left alone
app.openDay = (y, m0, d) => { app.state.day = { y, m0, d }; if (location.hash === '#today') render(true); else location.hash = 'today'; };

const TABS = [['today', 'Today'], ['history', 'History'], ['insights', 'Insights'], ['guide', 'Guide'], ['more', 'More']].map(([id, label]) => ({ id, label, icon: icon(id) }));
const tabs = mountTabbar(document.getElementById('tabbar'), TABS, { active: 'today', onSelect: id => { location.hash = id; } });
const go = () => { const id = location.hash.slice(1); current = views[id] ? id : 'today'; if (current !== 'today') app.state.unlocked?.clear(); tabs.select(current); render(true); main.focus({ preventScroll: true }); window.scrollTo(0, 0); };
window.addEventListener('hashchange', go);
const flushForm = () => app.form?.flush();
window.addEventListener('pagehide', flushForm);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushForm(); });
go(); splash.step('Local data ready'); initPWA(app);

(async () => {                                              // cloud is optional: the app is already usable from local data
  try {
    const fsMod = await import('../shared/firestore.js').catch(() => null); splash.step('Signing in');
    const user = fsMod && await fsMod.requireUser({ redirect: '../../login.html?redirect=apps/health/index.html' });
    if (!user) { say('Offline', 'sync--wait', 'Offline \u2014 changes are saved on this device and sync when you are back online'); return; }
    app.remote = fsMod.firestoreRemote(); await store.setRemote(app.remote); say('Syncing\u2026');
    const rep = await Promise.race([initialSync(repo, store, name => splash.step(name)), new Promise(r => setTimeout(() => r(null), 6000))]);
    render(false); say(store.pendingCount() ? `${store.pendingCount()} unsynced` : 'Synced', store.pendingCount() ? 'sync--wait' : '');
    if (rep?.errors?.length) toast('Some data could not be synced. Working from this device.', { error: true });
  } catch (e) { console.warn(e); say('Offline', 'sync--wait', 'Offline \u2014 changes are saved on this device and sync when you are back online'); }
  finally { splash.finish(); }
})();
