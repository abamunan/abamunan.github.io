// JSON backup (format version 1, identical to the legacy exportAllDataJSON) + import planning.
import { DAY_RE, parseDayKey } from './keys.js';
export function buildBackup({ expense, income, goal, accounts, ledger, debts, days, lastAccounts }, now = new Date()) {
  return { version: 1, exportedAt: now.toISOString(), categories: { expense, income }, goal, accounts, ledger, debts, days,
    ...(lastAccounts && Object.keys(lastAccounts).length ? { lastAccounts } : {}) };      // extra key: old import ignores it
}
export const backupFileName = (kind, date = new Date()) => `money-tracker-${kind}-${date.toISOString().slice(0, 10)}.json`;
// kind: 'backup' | 'auto-before-import' | 'auto-before-delete' | 'auto-before-migration'

export function parseBackup(text) {
  let p; try { p = JSON.parse(text); } catch { return { ok: false, error: 'Not a valid JSON file' }; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'Not a Money Tracker backup' };
  if (!p.categories && !p.days && !p.accounts) return { ok: false, error: 'No Money Tracker data found in this file' };
  const days = {}; let invalid = 0;
  for (const [k, v] of Object.entries(p.days && typeof p.days === 'object' ? p.days : {})) {
    if (DAY_RE.test(k) && v && typeof v === 'object' && !Array.isArray(v)) days[k] = v; else invalid++;
  }
  return { ok: true, payload: { ...p, days }, stats: { days: Object.keys(days).length, invalid } };
}

const nonEmpty = a => Array.isArray(a) && a.length > 0;
const mergeById = (a, b) => { const idx = new Map(a.map((x, i) => [x.id, i])); const out = a.slice();
  for (const y of b) { const i = idx.get(y.id); if (i == null) { idx.set(y.id, out.length); out.push(y); } else out[i] = y; } return out; };

// local = {days:{key:doc}, expense, income, accounts, goal, ledger, debts, lastAccounts}
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
  const keys = Object.keys(payload.days || {}), keySet = new Set(keys), localKeys = Object.keys(local.days || {});
  const idOf = k => { const p = parseDayKey(k); return p ? `${p.y}_${p.m + 1}_${p.d}` : k; };
  const idSet = new Set(keys.map(idOf));
  const plan = { mode, settings, writeDays: keys, deleteLocalDays: [], deleteCloudDayIds: [] };
  if (!merge) { plan.deleteLocalDays = localKeys.filter(k => !keySet.has(k)); plan.deleteCloudDayIds = cloudDayIds.filter(id => !idSet.has(id)); }
  plan.summary = { mode, backupDays: keys.length, overwritten: keys.filter(k => localKeys.includes(k)).length, newFromBackup: keys.filter(k => !localKeys.includes(k)).length,
    localOnly: merge ? localKeys.filter(k => !keySet.has(k)).length : 0, deleteLocal: plan.deleteLocalDays.length, deleteCloud: plan.deleteCloudDayIds.length };
  return plan;
}
