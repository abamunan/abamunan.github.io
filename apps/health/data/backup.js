// JSON backup (format version 1, identical to the legacy exportAllDataJSON) + import planning.
import { DAY_RE, parseDayKey, dayId } from './keys.js';
import { mergeProfile, migratePinned } from '../domain/metrics.js';

export const buildBackup = ({ metrics, goals, profile, days }, now = new Date()) => ({ version: 1, exportedAt: now.toISOString(), metrics, goals, profile, days });
export const backupFileName = (kind, date = new Date()) => `health-tracker-${kind}-${date.toISOString().slice(0, 10)}.json`;
// kind: 'backup' | 'auto-before-import' | 'auto-before-delete'

export function parseBackup(text) {
  let p; try { p = JSON.parse(text); } catch { return { ok: false, error: 'Not a valid JSON file' }; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'Not a Health Tracker backup' };
  if (!p.metrics && !p.days && !p.profile) return { ok: false, error: 'No Health Tracker data found in this file' };
  const days = {}; let invalid = 0;
  for (const [k, v] of Object.entries(p.days && typeof p.days === 'object' ? p.days : {})) {
    if (DAY_RE.test(k) && v && typeof v === 'object' && !Array.isArray(v)) days[k] = v; else invalid++;
  }
  return { ok: true, payload: { ...p, days }, stats: { days: Object.keys(days).length, invalid } };
}

const nonEmpty = a => Array.isArray(a) && a.length > 0;
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
const mergeById = (a, b) => { const idx = new Map(a.map((x, i) => [x.id, i])); const out = a.slice();
  for (const y of b) { const i = idx.get(y.id); if (i == null) { idx.set(y.id, out.length); out.push(y); } else out[i] = y; } return out; };

// local = { metrics, goals, profile, days: { key: doc } }
// mode 'merge'  : nothing is deleted; backup wins for days/metrics/goals present on both sides.
// mode 'replace': backup replaces everything; local days and CLOUD days not in the backup are deleted.
export function planImport({ mode, local, payload, cloudDayIds = [] }) {
  const merge = mode === 'merge';
  const settings = {
    metrics: !nonEmpty(payload.metrics) ? local.metrics : migratePinned(merge ? mergeById(local.metrics, payload.metrics) : payload.metrics),
    goals: !isObj(payload.goals) ? local.goals : merge ? { ...local.goals, ...payload.goals } : payload.goals,
    profile: !isObj(payload.profile) ? local.profile : merge ? mergeProfile({ ...local.profile, ...payload.profile }) : mergeProfile(payload.profile)
  };
  const keys = Object.keys(payload.days || {}), keySet = new Set(keys), localKeys = Object.keys(local.days || {});
  const idOf = k => { const p = parseDayKey(k); return p ? dayId(p.y, p.m, p.d) : k; };
  const idSet = new Set(keys.map(idOf));
  const plan = { mode, settings, writeDays: keys, deleteLocalDays: [], deleteCloudDayIds: [] };
  if (!merge) { plan.deleteLocalDays = localKeys.filter(k => !keySet.has(k)); plan.deleteCloudDayIds = cloudDayIds.filter(id => !idSet.has(id)); }
  plan.summary = { mode, backupDays: keys.length, overwritten: keys.filter(k => localKeys.includes(k)).length, newFromBackup: keys.filter(k => !localKeys.includes(k)).length,
    localOnly: merge ? localKeys.filter(k => !keySet.has(k)).length : 0, deleteLocal: plan.deleteLocalDays.length, deleteCloud: plan.deleteCloudDayIds.length };
  return plan;
}
