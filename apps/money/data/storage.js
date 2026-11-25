// The ONLY module that reads/writes storage. Views call this (and domain/), never localStorage.
import { K, NEW_KEYS, META, DAY_RE, SETTINGS_LISTS, dayLocalKey, dayPath, parseDayKey } from './keys.js';
import { DEFAULT_EXPENSE_FIELDS, DEFAULT_INCOME_FIELDS, DEFAULT_ACCOUNTS, DEFAULT_PINNED_EXPENSE_IDS } from './defaults.js';
import { reconcile } from '../domain/reconcile.js';
import * as E from '../domain/entries.js';
import { isDayLocked, LockedError } from '../../shared/lock.js';
import { newId } from '../../shared/dom.js';
import { buildBackup } from './backup.js';
import * as P from '../domain/plan.js';
import * as C from '../domain/categories.js';

const cp = o => JSON.parse(JSON.stringify(o));
const arr = a => Array.isArray(a) ? a : [];
const SETTINGS_EXTRA = 'mt2_settings_extra_v1';
const TOMB_CAP = 3000, DELETED_DAYS_CAP = 5000;
const plainMap = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const sameItem = (a, b) => { const { updatedAt: _a, ...x } = a || {}, { updatedAt: _b, ...y } = b || {}; return JSON.stringify(x) === JSON.stringify(y); };
const capMap = (m, cap) => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, cap));   // keep the newest entries
const pad = n => String(n).padStart(2, '0');

// backupGuard({kind, payload}) → Promise<boolean>: the app downloads the file; false/throw = abort the write.
export function createRepo({ store, backupGuard = async () => true, today = () => new Date(), now = () => Date.now() }) {
  const s = { expense: [], income: [], accounts: [], goal: 0, ledger: [], debts: [], lastAccounts: {}, templates: [], extra: {}, tomb: { ledger: [], debts: [] }, deletedDays: {}, smeta: { deleted: {}, goalAt: 0 } };

  function load() {                                                   // mirrors legacy load*Local + migrations
    const c = store.get(K.categories), a = store.get(K.accounts);
    s.expense = Array.isArray(c?.expense) && c.expense.length ? c.expense : cp(DEFAULT_EXPENSE_FIELDS);
    s.income = Array.isArray(c?.income) && c.income.length ? c.income : cp(DEFAULT_INCOME_FIELDS);
    s.expense.forEach(f => { if (typeof f.pinned !== 'boolean') f.pinned = DEFAULT_PINNED_EXPENSE_IDS.includes(f.id); });
    s.income.forEach(f => { if (typeof f.pinned !== 'boolean') f.pinned = true; });
    s.accounts = Array.isArray(a) && a.length ? a : cp(DEFAULT_ACCOUNTS);
    s.accounts.forEach(x => { if (typeof x.opening !== 'number') x.opening = typeof x.balance === 'number' ? x.balance : 0; });
    s.goal = parseFloat(store.getRaw(K.goal)) || 0;
    s.ledger = arr(store.get(K.ledger)); s.debts = arr(store.get(K.debts));
    s.lastAccounts = store.get(NEW_KEYS.lastAccounts, {}) || {}; s.extra = store.get(SETTINGS_EXTRA, {}) || {};
    s.templates = arr(store.get(NEW_KEYS.templates));
    const tb = store.get(NEW_KEYS.tomb, {}) || {}; s.tomb = { ledger: arr(tb.ledger), debts: arr(tb.debts) };
    const sm = plainMap(store.get(NEW_KEYS.settingsMeta, {})); s.smeta = { deleted: plainMap(sm.deleted), goalAt: Number(sm.goalAt) || 0 };
    const dd = store.get(NEW_KEYS.deletedDays, {}); s.deletedDays = dd && typeof dd === 'object' && !Array.isArray(dd) ? dd : {};
  }
  load();

  // Ids that are known to have been a category or source at some time: the defaults, the ones removed on a device (smeta.deleted), and what templates / remembered accounts still point at.
  const formerCategoryIds = () => [...DEFAULT_EXPENSE_FIELDS, ...DEFAULT_INCOME_FIELDS].map(f => f.id)
    .concat(Object.keys(s.smeta.deleted).filter(k => /^(expense|income):/.test(k)).map(k => k.slice(k.indexOf(':') + 1)), s.templates.map(t => t.cat), Object.keys(s.lastAccounts));
  const catIds = () => [...s.expense, ...s.income].map(f => f.id);
  const activeAccounts = () => s.accounts.filter(a => !a.archived);
  const defaultAcct = () => activeAccounts().some(a => a.id === 'cash') ? 'cash' : (activeAccounts()[0]?.id ?? s.accounts[0]?.id ?? null);
  const ctx = () => ({ catIds: catIds(), acctIds: s.accounts.map(a => a.id), defaultAcct: defaultAcct(), now: now() });
  const acctOk = id => !!id && s.accounts.some(a => a.id === id && !a.archived);   // an archived account is never offered as a default
  // Default account for the Add sheet: the category's own default → last used for it → Cash/first.
  const resolveAccount = cat => { const f = [...s.expense, ...s.income].find(x => x.id === cat);
    return [f?.defaultAcct, s.lastAccounts[cat]].find(acctOk) || defaultAcct(); };

  const getDay = (y, m0, d) => store.get(dayLocalKey(y, m0, d), {}) || {};
  const saveDay = (key, doc, path) => store.save(key, { ...doc, updatedAt: now() }, path);
  // Parsed days are reused while their stored text is unchanged, so a screen does not JSON.parse every day again on each render.
  const parsed = new Map();
  const listDays = () => {
    const seen = new Set(), out = [];
    for (const k of store.keys(DAY_RE)) {
      const raw = store.getRaw(k); if (raw == null) continue; seen.add(k);
      let hit = parsed.get(k);
      if (!hit || hit.raw !== raw) { let doc = null; try { doc = JSON.parse(raw); } catch { /* unreadable day: skipped */ } hit = { raw, doc }; parsed.set(k, hit); }
      if (hit.doc && typeof hit.doc === 'object') out.push({ key: k, ...parseDayKey(k), doc: hit.doc, data: hit.doc });
    }
    for (const k of parsed.keys()) if (!seen.has(k)) parsed.delete(k);
    return out.sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);
  };
  // All-or-nothing group of writes: if one fails (storage full), the keys already written are put back as they were.
  function commit(pairs) {
    const prev = pairs.map(([k]) => store.getRaw(k));
    try { pairs.forEach(([k, v]) => store.set(k, v)); }
    catch (e) { pairs.forEach(([k], i) => { try { prev[i] == null ? store.remove(k) : store.setRaw(k, prev[i]); } catch { /* best effort */ } }); throw e; }
  }
  const LOCAL_KEY = /^mt_/, LOCAL_EXTRA = [NEW_KEYS.lastAccounts, NEW_KEYS.templates, NEW_KEYS.tomb, NEW_KEYS.deletedDays, NEW_KEYS.settingsMeta, SETTINGS_EXTRA];
  const localKeys = () => [...store.keys(LOCAL_KEY), ...LOCAL_EXTRA];
  const takeSnapshot = () => Object.fromEntries(localKeys().map(k => [k, store.getRaw(k)]));
  function rollback(snap) {                                       // put every local key back, then tell the cloud queue what the truth is again
    const changed = [];
    for (const k of localKeys()) if (!(k in snap) || snap[k] == null) { if (store.getRaw(k) != null) { store.remove(k); changed.push(k); } }
    for (const [k, v] of Object.entries(snap)) if (v != null && store.getRaw(k) !== v) { store.setRaw(k, v); changed.push(k); }
    load();
    for (const k of changed) { const p = parseDayKey(k); if (p) { const raw = store.getRaw(k); raw == null ? store.pushDelete(dayPath(p.y, p.m, p.d)) : store.push(dayPath(p.y, p.m, p.d), JSON.parse(raw)); } }
    store.push(META.settings, settingsDoc()); store.push(META.ledger, ledgerDoc()); store.push(META.debts, debtsDoc());
  }

  function settingsDoc() { return { ...s.extra, expense: s.expense, income: s.income, goal: s.goal, goalAt: s.smeta.goalAt, accounts: s.accounts, lastAccounts: s.lastAccounts, templates: s.templates, deleted: s.smeta.deleted }; }   // always written, even when empty: with overwrite sync an omitted key would let another device keep (and re-upload) stale data
  const ledgerDoc = () => ({ events: s.ledger, deleted: s.tomb.ledger }), debtsDoc = () => ({ items: s.debts, deleted: s.tomb.debts });
  const addTomb = (kind, ids) => (ids.length ? { ...s.tomb, [kind]: [...new Set([...s.tomb[kind], ...ids])].slice(-TOMB_CAP) } : s.tomb);
  // Storage is written FIRST; memory changes only after the write worked, so a full disk never leaves the screen showing something that is not saved.
  // Every category / source / account / template carries `updatedAt` (stamped here when it is new or changed), and a removed one is remembered in smeta.deleted
  // as { 'list:id': time }. The cloud adapter merges the settings document by id with these (CLOUD_MERGE), so two devices editing different things keep both edits.
  function saveSettings(patch = {}) {
    const t = now(), next = { ...patch }, deleted = { ...s.smeta.deleted };
    for (const list of SETTINGS_LISTS) {
      if (!(list in patch)) continue;
      const before = new Map(s[list].map(x => [x.id, x]));
      next[list] = patch[list].map(x => { const o = before.get(x.id); return o && sameItem(o, x) ? x : { ...x, updatedAt: t }; });
      const keep = new Set(next[list].map(x => x.id));
      for (const x of next[list]) if (x.updatedAt === t) delete deleted[`${list}:${x.id}`];       // saved again (e.g. restored): no longer removed
      for (const o of s[list]) if (!keep.has(o.id)) deleted[`${list}:${o.id}`] = t;
    }
    const smeta = { deleted: capMap(deleted, TOMB_CAP), goalAt: 'goal' in patch && patch.goal !== s.goal ? t : s.smeta.goalAt }, n = { ...s, ...next };
    commit([[K.categories, { expense: n.expense, income: n.income }], [K.goal, n.goal], [K.accounts, n.accounts], [NEW_KEYS.lastAccounts, n.lastAccounts], [NEW_KEYS.templates, n.templates], [NEW_KEYS.settingsMeta, smeta]]);
    Object.assign(s, next); s.smeta = smeta; store.push(META.settings, settingsDoc());
  }
  function saveLedger(list, removed = []) { const tomb = addTomb('ledger', removed); commit([[K.ledger, list], [NEW_KEYS.tomb, tomb]]); s.ledger = list; s.tomb = tomb; store.push(META.ledger, ledgerDoc()); }
  function saveDebts(list, removed = []) { const tomb = addTomb('debts', removed); commit([[K.debts, list], [NEW_KEYS.tomb, tomb]]); s.debts = list; s.tomb = tomb; store.push(META.debts, debtsDoc()); }
  const saveTemplates = list => saveSettings({ templates: list });
  function recordDeletedDays(ids) {                              // lets the other devices drop days removed by Replace / Remove all
    if (!ids.length) return; const t = now(), m = { ...s.deletedDays }; ids.forEach(id => { m[id] = t; });
    const keep = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, DELETED_DAYS_CAP); s.deletedDays = Object.fromEntries(keep);
    store.set(NEW_KEYS.deletedDays, s.deletedDays); store.push(META.deletedDays, { days: s.deletedDays });
  }

  const templates = {
    listTemplates: () => s.templates || [],
    addTemplate(t) {
      const list = s.templates || [];
      const amt = t.amt === '' || t.amt == null ? 0 : Number(t.amt);
      if (!Number.isFinite(amt) || amt < 0) throw new Error('Template amount must be 0 or more');
      const item = { id: t.id || newId('tmpl_'), label: String(t.label || '').trim(), cat: t.cat, amt, acct: acctOk(t.acct) ? t.acct : defaultAcct(), note: String(t.note || '').trim() };
      if (!item.label) throw new Error('Enter a template name');
      if (!s.expense.some(x => x.id === item.cat) && !s.income.some(x => x.id === item.cat)) throw new Error('Unknown category');
      saveTemplates([...list, item]);
      return item;
    },
    removeTemplate(id) {
      saveTemplates((s.templates || []).filter(t => t.id !== id));
    }
  };

  const snapshot = () => buildBackup({ expense: s.expense, income: s.income, goal: s.goal, accounts: s.accounts, ledger: s.ledger, debts: s.debts,
    days: Object.fromEntries(listDays().map(x => [x.key, x.doc])), lastAccounts: s.lastAccounts, templates: s.templates }, new Date(now()));

  async function ensureBackup() {                               // once per calendar day, before the first migrating write
    const t = today(), day = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    if (store.getRaw(NEW_KEYS.backupDay) === day) return true;
    let ok = false; try { ok = await backupGuard({ kind: 'auto-before-migration', payload: snapshot() }); } catch { ok = false; }
    if (ok) store.setRaw(NEW_KEYS.backupDay, day);
    return !!ok;
  }
  async function mutate(y, m0, d, fn, { unlocked = false } = {}) {
    if (!unlocked && isDayLocked(y, m0, d, getDay(y, m0, d), today())) throw new LockedError();
    if (reconcile(getDay(y, m0, d), catIds(), ctx()).changed && !(await ensureBackup())) throw new Error('Automatic backup failed \u2014 nothing was changed');
    const res = fn(getDay(y, m0, d), ctx());                    // re-read after the await
    saveDay(dayLocalKey(y, m0, d), res.doc, dayPath(y, m0, d));
    return res;
  }
  const ops = {
    async addEntry(y, m0, d, e, o) { const r = await mutate(y, m0, d, (src, c) => E.addEntry(src, e, c), o);
      if (r.entry.acct !== s.lastAccounts[r.entry.cat] && acctOk(r.entry.acct)) { s.lastAccounts = { ...s.lastAccounts, [r.entry.cat]: r.entry.acct }; try { store.set(NEW_KEYS.lastAccounts, s.lastAccounts); } catch { /* a remembered account is a convenience: never fail the entry for it */ } } return r; },   // per-device memory: not pushed, so a stale device cannot overwrite the shared settings
    updateEntry: (y, m0, d, id, patch, o) => mutate(y, m0, d, (src, c) => E.updateEntry(src, id, patch, c), o),
    deleteEntry: (y, m0, d, id, o) => mutate(y, m0, d, (src, c) => E.deleteEntry(src, id, c), o),
    restoreEntry: (y, m0, d, entry, o) => mutate(y, m0, d, (src, c) => E.restoreEntry(src, entry, c), o),
    async moveEntry(from, to, id, patch = {}, o) {               // from/to = [y, m0, d]
      const e = (reconcile(getDay(...from), catIds(), ctx()).doc.entries || []).find(x => x.id === id);
      if (!e) throw new Error('Entry not found');
      await ops.addEntry(...to, { ...e, ...patch }, o);
      try { await ops.deleteEntry(...from, id, o); } catch (err) { await ops.deleteEntry(...to, id, o).catch(() => {}); throw err; }
    }
  };
  const setManualLock = (y, m0, d, locked) => saveDay(dayLocalKey(y, m0, d), { ...getDay(y, m0, d), locked: !!locked }, dayPath(y, m0, d));
  const setAccountArchived = (id, archived) => saveSettings({ accounts: P.setAccountArchived(s.accounts, id, archived) });

  // Plan tab. None of these touch day documents, so no migration backup is needed.
  const plan = {
    setBudgets: changes => saveSettings({ expense: P.setBudgets(s.expense, changes) }),
    setGoal: v => saveSettings({ goal: P.normGoal(v) }),
    addAccount(o) { const accounts = P.addAccount(s.accounts, o); saveSettings({ accounts }); return accounts[accounts.length - 1]; },
    updateAccount: (id, patch) => saveSettings({ accounts: P.updateAccount(s.accounts, id, patch) }),
    async deleteAccount(id, moveTo) {                            // history moves to `moveTo`; the total does not change
      P.deleteAccount(s.accounts, s.debts, id, moveTo, s.ledger);                          // validate first: no backup prompt for an invalid request
      if (!(await ensureBackup())) throw new Error('Automatic backup failed \u2014 nothing was changed');
      const r = P.deleteAccount(s.accounts, s.debts, id, moveTo, s.ledger);                // re-read after the await
      const snap = takeSnapshot();                                                         // many writes follow: if any fails (storage full) everything is put back
      try {
      let days = 0, entries = 0;
      for (const { key, y, m, d, doc } of listDays()) {                                    // locked days too: only the account label moves, no amount changes
        const res = P.moveDayAccount(doc, id, moveTo);
        if (res.changed) { saveDay(key, res.doc, dayPath(y, m, d)); days++; entries += res.entries; }
      }
      if (r.moved.ledger || r.moved.dropped) saveLedger(r.ledger);
      if (r.moved.debts) saveDebts(r.debts);
      const swap = v => (v === id ? moveTo : v);
      saveSettings({ accounts: r.accounts,                                                  // category defaults, remembered accounts and templates must not keep pointing at the deleted account
        expense: s.expense.map(f => (f.defaultAcct === id ? { ...f, defaultAcct: moveTo } : f)), income: s.income.map(f => (f.defaultAcct === id ? { ...f, defaultAcct: moveTo } : f)),
        lastAccounts: Object.fromEntries(Object.entries(s.lastAccounts).map(([k, v]) => [k, swap(v)])), templates: s.templates.map(t => (t.acct === id ? { ...t, acct: moveTo } : t)) });
      return { ...r.moved, days, entries };
      } catch (e) { rollback(snap); throw e; }
    },
    updateLedgerEvent: (id, amount) => saveLedger(P.updateLedgerEvent(s.ledger, id, { amount })),
    removeLedgerEvent(id) { const ev = s.ledger.find(x => x.id === id); saveLedger(P.removeLedgerEvent(s.ledger, id), [id]); return ev; },
    restoreLedgerEvent(ev) { if (!ev || s.ledger.some(x => x.id === ev.id)) return; s.tomb = { ...s.tomb, ledger: s.tomb.ledger.filter(x => x !== ev.id) }; saveLedger([...s.ledger, ev]); },   // Undo
    addBalance: (id, amt) => saveLedger(P.addBalance(s.ledger, s.accounts, id, amt, { now: new Date(now()) })),
    addTransfer: (from, to, amt) => saveLedger(P.addTransfer(s.ledger, s.accounts, from, to, amt, { now: new Date(now()) })),
    addDebt: d => saveDebts(P.addDebt(s.debts, s.accounts, d, { today: today() })),
    updateDebt: (id, patch) => saveDebts(P.updateDebt(s.debts, s.accounts, id, patch)),
    addDebtPayment: (id, pay) => saveDebts(P.addDebtPayment(s.debts, s.accounts, id, pay, { today: today() })),
    setDebtSettled: (id, v) => saveDebts(P.setDebtSettled(s.debts, id, v, today())),
    removeDebt: id => saveDebts(P.removeDebt(s.debts, id), [id])
  };

  // Categories (expense) and sources (income). Day documents are never touched. A category with data is archived (hidden from Add, still counted), not deleted.
  const lists = { expense: 'expense', income: 'income' };
  const cats = {
    addCategory(type, o) { const list = C.addCategory(s[lists[type]], type, o); saveSettings({ [type]: list }); return list[list.length - 1]; },
    updateCategory(type, id, patch) { saveSettings({ [type]: C.updateCategory(s[lists[type]], id, patch, s.accounts.map(a => a.id)) }); },
    moveCategory(type, id, dir) { saveSettings({ [type]: C.moveCategory(s[lists[type]], id, dir) }); },
    deleteCategory(type, id) {                                   // a category that still has saved data is archived, never deleted: totals, balances, reports and CSV must always agree
      const u = C.categoryUsage(listDays(), id), f = s[lists[type]].find(x => x.id === id);
      if (f && u.days) throw new Error(`"${f.label}" has data on ${u.days} day${u.days > 1 ? 's' : ''}. Archive it instead of deleting it.`);
      saveSettings({ [type]: C.deleteCategory(s[lists[type]], type, id), templates: s.templates.filter(t => t.cat !== id) });   // its templates would point at nothing
    },
    orphanCategories: () => C.orphanCategories(listDays(), catIds(), formerCategoryIds()),
    restoreCategory(type, id, label) { const list = C.restoreCategory(s[lists[type]], type, id, label); saveSettings({ [type]: list }); return list[list.length - 1]; },
    categoryUsage: id => C.categoryUsage(listDays(), id),
    categoryUseCount: id => C.categoryUseCount(listDays(), id),
    categoryUseCounts: () => C.categoryUseCounts(listDays(), catIds())
  };

  function applyImport(plan, payload) {
    const snap = takeSnapshot(), idsOf = l => l.map(x => x.id), gone = (before, after) => { const keep = new Set(idsOf(after)); return idsOf(before).filter(id => !keep.has(id)); };
    try {
      saveSettings({ expense: plan.settings.expense, income: plan.settings.income, accounts: plan.settings.accounts, goal: plan.settings.goal, lastAccounts: plan.settings.lastAccounts, templates: plan.settings.templates });
      saveLedger(plan.settings.ledger, gone(s.ledger, plan.settings.ledger)); saveDebts(plan.settings.debts, gone(s.debts, plan.settings.debts));
      for (const k of plan.deleteLocalDays) { const p = parseDayKey(k); store.drop(k, dayPath(p.y, p.m, p.d)); }
      for (const id of plan.deleteCloudDayIds) store.pushDelete(`moneytracker/${id}`);
      for (const k of plan.writeDays) { const p = parseDayKey(k); saveDay(k, payload.days[k], dayPath(p.y, p.m, p.d)); }
      recordDeletedDays([...plan.deleteLocalDays.map(k => { const p = parseDayKey(k); return `${p.y}_${p.m + 1}_${p.d}`; }), ...plan.deleteCloudDayIds].filter(id => !plan.writeDays.some(k => { const p = parseDayKey(k); return `${p.y}_${p.m + 1}_${p.d}` === id; })));
      load();                                                      // normalise what was imported (pinned flags, opening balances) exactly like a restart would
    } catch (e) { rollback(snap); throw e; }
  }
  function wipeAll(cloudIds = []) {                              // caller must have downloaded + verified a backup first
    const keys = listDays().map(x => x.key); const done = new Set();
    for (const k of keys) { const p = parseDayKey(k); store.drop(k, dayPath(p.y, p.m, p.d)); done.add(`${p.y}_${p.m + 1}_${p.d}`); }
    for (const id of cloudIds) if (!done.has(id)) store.pushDelete(`moneytracker/${id}`);
    [META.settings, META.ledger, META.debts].forEach(p => store.pushDelete(p));
    [K.categories, K.accounts, K.ledger, K.debts, K.goal, NEW_KEYS.lastAccounts, NEW_KEYS.templates, NEW_KEYS.tomb, NEW_KEYS.settingsMeta, SETTINGS_EXTRA].forEach(k => store.remove(k));
    recordDeletedDays([...done, ...cloudIds.filter(id => !done.has(id))]);
    load(); return { localDays: keys.length, cloudDays: cloudIds.length };
  }
  // Remote → local (no re-upload). Same acceptance rules as legacy loadSettingsRemote/Ledger/Debts.
  const remote = {
    settings(data) {
      const deleted = { ...s.smeta.deleted }; for (const [k, v] of Object.entries(plainMap(data.deleted))) deleted[k] = Math.max(Number(v) || 0, Number(deleted[k]) || 0);
      const alive = (list, x) => { const t = deleted[`${list}:${x?.id}`]; return t == null || (Number(x.updatedAt) || 0) >= t; };
      const pick = list => (Array.isArray(data[list]) ? data[list].filter(x => x && x.id != null && alive(list, x)) : null);
      const ex = pick('expense'), inc = pick('income'), ac = pick('accounts'), tp = pick('templates'), remoteAt = Number(data.goalAt) || 0;
      let goalAt = s.smeta.goalAt;
      if (ex?.length || inc?.length || ac?.length || typeof data.goal === 'number') {
        const cur = { expense: s.expense, income: s.income, accounts: s.accounts, goal: s.goal };
        if (ex?.length) cur.expense = ex;
        if (inc?.length) cur.income = inc;
        if (ac?.length) cur.accounts = ac;
        if (typeof data.goal === 'number' && remoteAt >= goalAt) { cur.goal = data.goal; goalAt = remoteAt; }
        store.set(K.categories, { expense: cur.expense, income: cur.income }); store.set(K.accounts, cur.accounts); store.set(K.goal, cur.goal);
      }
      store.set(NEW_KEYS.settingsMeta, { deleted: capMap(deleted, TOMB_CAP), goalAt });
      if (data.lastAccounts && typeof data.lastAccounts === 'object') store.set(NEW_KEYS.lastAccounts, data.lastAccounts);
      if (tp) store.set(NEW_KEYS.templates, tp);
      const { expense, income, goal, goalAt: _g, accounts, lastAccounts, templates, deleted: _d, ...extra } = data; store.set(SETTINGS_EXTRA, extra); load();
    },
    ledger(data) { if (Array.isArray(data.events)) { const dead = new Set(arr(data.deleted)); store.set(K.ledger, data.events.filter(x => !dead.has(x?.id))); store.set(NEW_KEYS.tomb, { ...s.tomb, ledger: [...new Set([...s.tomb.ledger, ...dead])].slice(-TOMB_CAP) }); load(); } },
    debts(data) { if (Array.isArray(data.items)) { const dead = new Set(arr(data.deleted)); store.set(K.debts, data.items.filter(x => !dead.has(x?.id))); store.set(NEW_KEYS.tomb, { ...s.tomb, debts: [...new Set([...s.tomb.debts, ...dead])].slice(-TOMB_CAP) }); load(); } },
    deletedDays(data) {                                          // another device removed these days (Replace / Remove all): drop them here unless this device changed them later
      const m = data && typeof data.days === 'object' && data.days ? data.days : {}; let n = 0;
      for (const [id, ts] of Object.entries(m)) {
        const p = parseDayKey('mt_' + id); if (!p) continue; const key = dayLocalKey(p.y, p.m, p.d), path = dayPath(p.y, p.m, p.d), doc = store.get(key);
        if (doc && !store.isPending(path) && Number(doc.updatedAt || 0) <= Number(ts)) { store.remove(key); n++; }
      }
      s.deletedDays = { ...m, ...s.deletedDays }; for (const [id, ts] of Object.entries(m)) s.deletedDays[id] = Math.max(Number(ts) || 0, Number(s.deletedDays[id]) || 0);
      store.set(NEW_KEYS.deletedDays, s.deletedDays); return n;
    },
    day(id, data) { const p = parseDayKey('mt_' + id); if (p) store.set(dayLocalKey(p.y, p.m, p.d), data); }
  };
  return { settings: s, load, catIds, defaultAcct, resolveAccount, getDay, listDays, saveSettings, saveLedger, saveDebts, snapshot, ...ops, setManualLock, setAccountArchived, applyImport, wipeAll, applyRemote: remote, ensureBackup, ...plan, ...cats, ...templates, recordDeletedDays };
}
