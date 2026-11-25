// JSON backup (format version 1, identical to the legacy exportAllDataJSON) + import planning.
import { DAY_RE, parseDayKey } from './keys.js';
import { isoLocal } from '../../shared/fmt.js';
export function buildBackup({ expense, income, goal, accounts, ledger, debts, days, lastAccounts, templates }, now = new Date()) {
  return { version: 1, exportedAt: now.toISOString(), categories: { expense, income }, goal, accounts, ledger, debts, days,
    ...(lastAccounts && Object.keys(lastAccounts).length ? { lastAccounts } : {}),        // extra keys: an old import ignores them
    ...(Array.isArray(templates) && templates.length ? { templates } : {}) };
}
export const backupFileName = (kind, date = new Date()) => `money-tracker-${kind}-${isoLocal(date)}.json`;   // local date: toISOString() would name a 02:00 Dhaka backup after yesterday
// kind: 'backup' | 'auto-before-import' | 'auto-before-delete' | 'auto-before-migration'

const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const uniq = (list, fix) => { const seen = new Set(), out = []; let bad = 0; for (const x of Array.isArray(list) ? list : []) { const y = x && typeof x === 'object' && !Array.isArray(x) ? fix(x) : null; if (!y) { bad++; continue; } if (seen.has(y.id)) { bad++; continue; } seen.add(y.id); out.push(y); } return { out, bad }; };
const mkId = (p, i) => `${p}imp${i}_${Math.random().toString(36).slice(2, 6)}`;
// Repairs what can be repaired (numbers stored as text, missing ids) and drops what cannot (non-numeric amounts, duplicates), so a damaged or hand-edited
// file can never put NaN, text or duplicate ids into the app. Returns how many items were repaired or dropped.
export function sanitizePayload(p) {
  let repaired = 0; const out = { ...p };
  const days = {};
  for (const [k, doc] of Object.entries(p.days || {})) {
    const d = { ...doc };
    if (Array.isArray(d.entries)) {
      const seen = new Set(), list = [];
      for (const e of d.entries) {
        const amt = e && typeof e === 'object' ? num(e.amt) : NaN;
        if (!e || !e.cat || !Number.isFinite(amt) || amt === 0 && !e.adj) { repaired++; continue; }
        if (amt !== e.amt) repaired++;
        let id = e.id; if (id == null || seen.has(id)) { id = mkId('e', list.length); repaired++; } seen.add(id);
        list.push({ ...e, id, amt });
      }
      d.entries = list;
    }
    days[k] = d;
  }
  out.days = days;
  const cats = p.categories && typeof p.categories === 'object' ? { ...p.categories } : null;
  if (cats) for (const t of ['expense', 'income']) if (Array.isArray(cats[t])) { const r = uniq(cats[t], f => (typeof f.id === 'string' && f.id && typeof f.label === 'string' ? f : null)); cats[t] = r.out; repaired += r.bad; }
  if (cats) out.categories = cats;
  if (Array.isArray(p.accounts)) { const r = uniq(p.accounts, a => (typeof a.id === 'string' && a.id && typeof a.label === 'string' ? { ...a, opening: Number.isFinite(num(a.opening)) ? num(a.opening) : (Number.isFinite(num(a.balance)) ? num(a.balance) : 0) } : null)); out.accounts = r.out; repaired += r.bad; }
  if (Array.isArray(p.ledger)) {
    let i = 0; const r = uniq(p.ledger.map(ev => (ev && typeof ev === 'object' && ev.id == null ? { ...ev, id: mkId('lg', i++) } : ev)), ev => {
      const amount = num(ev.amount); if (!Number.isFinite(amount) || amount <= 0) return null;
      if (ev.type === 'add') return typeof ev.accountId === 'string' ? { ...ev, amount } : null;
      if (ev.type === 'transfer') return typeof ev.fromId === 'string' && typeof ev.toId === 'string' && ev.fromId !== ev.toId ? { ...ev, amount } : null; return null; });
    out.ledger = r.out; repaired += r.bad;
  }
  if (Array.isArray(p.debts)) {
    let i = 0; const r = uniq(p.debts.map(d => (d && typeof d === 'object' && d.id == null ? { ...d, id: mkId('dt', i++) } : d)), d => {
      const amount = num(d.amount); if (!Number.isFinite(amount) || amount <= 0 || (d.type !== 'lent' && d.type !== 'borrowed') || typeof d.person !== 'string') return null;
      const n = { ...d, amount }; if (Array.isArray(d.payments)) n.payments = d.payments.map(x => ({ ...x, amount: num(x?.amount) })).filter(x => Number.isFinite(x.amount) && x.amount > 0); return n; });
    out.debts = r.out; repaired += r.bad;
  }
  if (p.goal !== undefined && typeof p.goal !== 'number') { const g = num(p.goal); if (Number.isFinite(g)) out.goal = g; else delete out.goal; repaired++; }
  return { payload: out, repaired };
}

export function parseBackup(text) {
  let p; try { p = JSON.parse(text); } catch { return { ok: false, error: 'Not a valid JSON file' }; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'Not a Money Tracker backup' };
  if (!p.categories && !p.days && !p.accounts) return { ok: false, error: 'No Money Tracker data found in this file' };
  const days = {}; let invalid = 0;
  for (const [k, v] of Object.entries(p.days && typeof p.days === 'object' ? p.days : {})) {
    if (DAY_RE.test(k) && v && typeof v === 'object' && !Array.isArray(v)) days[k] = v; else invalid++;
  }
  if (p.version != null && Number(p.version) > 1) return { ok: false, error: 'This backup was made by a newer version of the app. Update the app first.' };
  const { payload, repaired } = sanitizePayload({ ...p, days });
  return { ok: true, payload, stats: { days: Object.keys(days).length, invalid, repaired } };
}

const nonEmpty = a => Array.isArray(a) && a.length > 0;
const mergeById = (a, b) => { const idx = new Map(a.map((x, i) => [x.id, i])); const out = a.slice();
  for (const y of b) { const i = idx.get(y.id); if (i == null) { idx.set(y.id, out.length); out.push(y); } else out[i] = y; } return out; };

// local = {days:{key:doc}, expense, income, accounts, goal, ledger, debts, lastAccounts, templates}
// mode 'merge'  : nothing is deleted; backup wins for days present on both sides; one-sided days untouched.
// mode 'replace': backup replaces everything; local days and CLOUD days not in the backup are deleted.
export function planImport({ mode, local, payload, cloudDayIds = [] }) {
  const pc = payload.categories || {}, merge = mode === 'merge';
  const pick = (mine, theirs, valid) => !valid(theirs) ? mine : merge ? mergeById(mine, theirs) : theirs;
  const settings = {
    expense: pick(local.expense, pc.expense, nonEmpty), income: pick(local.income, pc.income, nonEmpty),
    accounts: pick(local.accounts, payload.accounts, nonEmpty),
    ledger: pick(local.ledger, payload.ledger, Array.isArray), debts: pick(local.debts, payload.debts, Array.isArray),
    goal: typeof payload.goal === 'number' ? payload.goal : local.goal,
    lastAccounts: merge ? { ...(local.lastAccounts || {}), ...(payload.lastAccounts || {}) } : (payload.lastAccounts || local.lastAccounts || {})
  };
  const accIds = new Set(settings.accounts.map(a => a.id)), fallback = (settings.accounts.find(a => !a.archived) || settings.accounts[0])?.id; let redirected = 0;
  const fix = id => (accIds.has(id) || !fallback ? id : (redirected++, fallback));     // money for an account that does not exist would silently drop out of every balance
  settings.ledger = settings.ledger.map(ev => (ev.type === 'add' ? { ...ev, accountId: fix(ev.accountId) } : ev.type === 'transfer' ? { ...ev, fromId: fix(ev.fromId), toId: fix(ev.toId) } : ev)).filter(ev => !(ev.type === 'transfer' && ev.fromId === ev.toId));
  settings.debts = settings.debts.map(d => ({ ...d, accountId: fix(d.accountId), ...(Array.isArray(d.payments) ? { payments: d.payments.map(x => ({ ...x, accountId: fix(x.accountId ?? d.accountId) })) } : {}) }));
  const goodT = a => (Array.isArray(a) ? a.filter(t => t && typeof t === 'object' && t.id != null && t.cat) : null);
  const theirT = goodT(payload.templates), mineT = local.templates || [];
  const allCats = new Set([...settings.expense, ...settings.income].map(f => f.id));
  // merge: add/overwrite by id. replace: the file's templates (an old file without the key keeps this device's). A template whose category no longer exists is dropped.
  settings.templates = (merge ? mergeById(mineT, theirT || []) : (theirT || mineT)).filter(t => allCats.has(t.cat));
  const keys = Object.keys(payload.days || {}), keySet = new Set(keys), localKeys = Object.keys(local.days || {});
  const idOf = k => { const p = parseDayKey(k); return p ? `${p.y}_${p.m + 1}_${p.d}` : k; };
  const idSet = new Set(keys.map(idOf));
  const plan = { mode, settings, writeDays: keys, deleteLocalDays: [], deleteCloudDayIds: [] };
  if (!merge) { plan.deleteLocalDays = localKeys.filter(k => !keySet.has(k)); plan.deleteCloudDayIds = cloudDayIds.filter(id => !idSet.has(id)); }
  plan.summary = { mode, backupDays: keys.length, overwritten: keys.filter(k => localKeys.includes(k)).length, newFromBackup: keys.filter(k => !localKeys.includes(k)).length,
    redirected, localOnly: merge ? localKeys.filter(k => !keySet.has(k)).length : 0, deleteLocal: plan.deleteLocalDays.length, deleteCloud: plan.deleteCloudDayIds.length };
  return plan;
}
