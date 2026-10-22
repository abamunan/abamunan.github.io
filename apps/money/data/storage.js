// The ONLY module that reads/writes storage. Views call this (and domain/), never localStorage.
import { K, NEW_KEYS, META, DAY_RE, dayLocalKey, dayPath, parseDayKey } from './keys.js';
import { DEFAULT_EXPENSE_FIELDS, DEFAULT_INCOME_FIELDS, DEFAULT_ACCOUNTS, DEFAULT_PINNED_EXPENSE_IDS } from './defaults.js';
import { reconcile } from '../domain/reconcile.js';
import * as E from '../domain/entries.js';
import { isDayLocked, LockedError } from '../../shared/lock.js';
import { buildBackup } from './backup.js';
import * as P from '../domain/plan.js';
import * as C from '../domain/categories.js';

const cp = o => JSON.parse(JSON.stringify(o));
const arr = a => Array.isArray(a) ? a : [];
const SETTINGS_EXTRA = 'mt2_settings_extra_v1';
const pad = n => String(n).padStart(2, '0');

// backupGuard({kind, payload}) → Promise<boolean>: the app downloads the file; false/throw = abort the write.
export function createRepo({ store, backupGuard = async () => true, today = () => new Date(), now = () => Date.now() }) {
  const s = { expense: [], income: [], accounts: [], goal: 0, ledger: [], debts: [], lastAccounts: {}, templates: [], extra: {} };

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
  }
  load();

  const catIds = () => [...s.expense, ...s.income].map(f => f.id);
  const defaultAcct = () => s.accounts.some(a => a.id === 'cash') ? 'cash' : (s.accounts[0]?.id ?? null);
  const ctx = () => ({ catIds: catIds(), defaultAcct: defaultAcct(), now: now() });
  const acctOk = id => !!id && s.accounts.some(a => a.id === id);
  // Default account for the Add sheet: the category's own default → last used for it → Cash/first.
  const resolveAccount = cat => { const f = [...s.expense, ...s.income].find(x => x.id === cat);
    return [f?.defaultAcct, s.lastAccounts[cat]].find(acctOk) || defaultAcct(); };

  const getDay = (y, m0, d) => store.get(dayLocalKey(y, m0, d), {}) || {};
  const listDays = () => store.keys(DAY_RE).map(k => { const doc = store.get(k); return doc && typeof doc === 'object' ? { key: k, ...parseDayKey(k), doc, data: doc } : null; })
    .filter(Boolean).sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);

  function settingsDoc() { return { ...s.extra, expense: s.expense, income: s.income, goal: s.goal, accounts: s.accounts, ...(Object.keys(s.lastAccounts).length ? { lastAccounts: s.lastAccounts } : {}), ...(s.templates.length ? { templates: s.templates } : {}) }; }
  function saveSettings(patch = {}) {
    Object.assign(s, patch);
    store.set(K.categories, { expense: s.expense, income: s.income }); store.set(K.goal, s.goal); store.set(K.accounts, s.accounts);
    store.set(NEW_KEYS.lastAccounts, s.lastAccounts); store.set(NEW_KEYS.templates, s.templates); store.push(META.settings, settingsDoc());
  }
  const saveLedger = list => { s.ledger = list; store.set(K.ledger, list); store.push(META.ledger, { events: list }); };
  const saveDebts = list => { s.debts = list; store.set(K.debts, list); store.push(META.debts, { items: list }); };
  const saveTemplates = list => { s.templates = list; store.set(NEW_KEYS.templates, list); store.push(META.settings, settingsDoc()); };

  const templates = {
    listTemplates: () => s.templates || [],
    addTemplate(t) {
      const list = s.templates || [];
      const item = { id: t.id || 'tmpl_' + Date.now(), label: String(t.label || '').trim(), cat: t.cat, amt: Number(t.amt) || 0, acct: t.acct || defaultAcct(), note: String(t.note || '').trim() };
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
    days: Object.fromEntries(listDays().map(x => [x.key, x.doc])), lastAccounts: s.lastAccounts }, new Date(now()));

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
    store.save(dayLocalKey(y, m0, d), res.doc, dayPath(y, m0, d));
    return res;
  }
  const ops = {
    async addEntry(y, m0, d, e, o) { const r = await mutate(y, m0, d, (src, c) => E.addEntry(src, e, c), o);
      if (r.entry.acct !== s.lastAccounts[r.entry.cat] && acctOk(r.entry.acct)) { s.lastAccounts[r.entry.cat] = r.entry.acct; saveSettings(); } return r; },
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
  const setManualLock = (y, m0, d, locked) => store.save(dayLocalKey(y, m0, d), { ...getDay(y, m0, d), locked: !!locked }, dayPath(y, m0, d));

  // Plan tab. None of these touch day documents, so no migration backup is needed.
  const plan = {
    setBudgets: changes => saveSettings({ expense: P.setBudgets(s.expense, changes) }),
    setGoal: v => saveSettings({ goal: P.normGoal(v) }),
    addAccount(o) { const accounts = P.addAccount(s.accounts, o); saveSettings({ accounts }); return accounts[accounts.length - 1]; },
    updateAccount: (id, patch) => saveSettings({ accounts: P.updateAccount(s.accounts, id, patch) }),
    deleteAccount(id) { const r = P.deleteAccount(s.accounts, s.debts, id); saveDebts(r.debts); saveSettings({ accounts: r.accounts }); return r; },
    addBalance: (id, amt) => saveLedger(P.addBalance(s.ledger, s.accounts, id, amt, { now: new Date(now()) })),
    addTransfer: (from, to, amt) => saveLedger(P.addTransfer(s.ledger, s.accounts, from, to, amt, { now: new Date(now()) })),
    addDebt: d => saveDebts(P.addDebt(s.debts, s.accounts, d, { today: today() })),
    setDebtSettled: (id, v) => saveDebts(P.setDebtSettled(s.debts, id, v, today())),
    removeDebt: id => saveDebts(P.removeDebt(s.debts, id))
  };

  // Categories (expense) and sources (income). Day documents are never touched: data saved under a deleted id stays stored but stops counting.
  const lists = { expense: 'expense', income: 'income' };
  const cats = {
    addCategory(type, o) { const list = C.addCategory(s[lists[type]], type, o); saveSettings({ [type]: list }); return list[list.length - 1]; },
    updateCategory(type, id, patch) { saveSettings({ [type]: C.updateCategory(s[lists[type]], id, patch, s.accounts.map(a => a.id)) }); },
    moveCategory(type, id, dir) { saveSettings({ [type]: C.moveCategory(s[lists[type]], id, dir) }); },
    deleteCategory(type, id) { saveSettings({ [type]: C.deleteCategory(s[lists[type]], type, id) }); },
    categoryUsage: id => C.categoryUsage(listDays(), id)
  };

  function applyImport(plan, payload) {
    saveSettings({ expense: plan.settings.expense, income: plan.settings.income, accounts: plan.settings.accounts, goal: plan.settings.goal, lastAccounts: plan.settings.lastAccounts });
    saveLedger(plan.settings.ledger); saveDebts(plan.settings.debts);
    for (const k of plan.deleteLocalDays) { const p = parseDayKey(k); store.drop(k, dayPath(p.y, p.m, p.d)); }
    for (const id of plan.deleteCloudDayIds) store.pushDelete(`moneytracker/${id}`);
    for (const k of plan.writeDays) { const p = parseDayKey(k); store.save(k, payload.days[k], dayPath(p.y, p.m, p.d)); }
  }
  function wipeAll(cloudIds = []) {                              // caller must have downloaded + verified a backup first
    const keys = listDays().map(x => x.key); const done = new Set();
    for (const k of keys) { const p = parseDayKey(k); store.drop(k, dayPath(p.y, p.m, p.d)); done.add(`${p.y}_${p.m + 1}_${p.d}`); }
    for (const id of cloudIds) if (!done.has(id)) store.pushDelete(`moneytracker/${id}`);
    Object.values(META).forEach(p => store.pushDelete(p));
    [K.categories, K.accounts, K.ledger, K.debts, K.goal, NEW_KEYS.lastAccounts, NEW_KEYS.templates, SETTINGS_EXTRA].forEach(k => store.remove(k));
    load(); return { localDays: keys.length, cloudDays: cloudIds.length };
  }
  // Remote → local (no re-upload). Same acceptance rules as legacy loadSettingsRemote/Ledger/Debts.
  const remote = {
    settings(data) {
      if (Array.isArray(data.expense) && data.expense.length || Array.isArray(data.income) && data.income.length || Array.isArray(data.accounts) && data.accounts.length || typeof data.goal === 'number') {
        const cur = { expense: s.expense, income: s.income, accounts: s.accounts, goal: s.goal };
        if (Array.isArray(data.expense) && data.expense.length) cur.expense = data.expense;
        if (Array.isArray(data.income) && data.income.length) cur.income = data.income;
        if (Array.isArray(data.accounts) && data.accounts.length) cur.accounts = data.accounts;
        if (typeof data.goal === 'number') cur.goal = data.goal;
        store.set(K.categories, { expense: cur.expense, income: cur.income }); store.set(K.accounts, cur.accounts); store.set(K.goal, cur.goal);
      }
      if (data.lastAccounts && typeof data.lastAccounts === 'object') store.set(NEW_KEYS.lastAccounts, data.lastAccounts);
      if (Array.isArray(data.templates)) store.set(NEW_KEYS.templates, data.templates);
      const { expense, income, goal, accounts, lastAccounts, templates, ...extra } = data; store.set(SETTINGS_EXTRA, extra); load();
    },
    ledger(data) { if (Array.isArray(data.events)) { store.set(K.ledger, data.events); load(); } },
    debts(data) { if (Array.isArray(data.items)) { store.set(K.debts, data.items); load(); } },
    day(id, data) { const p = parseDayKey('mt_' + id); if (p) store.set(dayLocalKey(p.y, p.m, p.d), data); }
  };
  return { settings: s, load, catIds, defaultAcct, resolveAccount, getDay, listDays, saveSettings, saveLedger, saveDebts, snapshot, ...ops, setManualLock, applyImport, wipeAll, applyRemote: remote, ensureBackup, ...plan, ...cats, ...templates };
}
