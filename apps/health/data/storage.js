// The ONLY module that reads/writes storage. Views call this (and domain/), never localStorage.
// Same keys and document shapes as the legacy Health Tracker: no schema change, so old and new app can run side by side.
import { K, META, DAY_RE, dayLocalKey, dayPath, parseDayKey, parseDayId, DAY_COLLECTION } from './keys.js';
import { DEFAULT_METRICS, DEFAULT_PROFILE } from './defaults.js';
import { buildBackup } from './backup.js';
import { isDayLocked, LockedError } from '../../shared/lock.js';
import * as M from '../domain/metrics.js';

const cp = o => JSON.parse(JSON.stringify(o));
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);

export function createRepo({ store, today = () => new Date(), now = () => Date.now(), rand = Math.random }) {
  const s = { metrics: [], goals: {}, profile: { ...DEFAULT_PROFILE } };

  function load() {                                   // mirrors legacy loadMetricsLocal / loadGoalsLocal / loadProfileLocal
    const m = store.get(K.metrics), g = store.get(K.goals), p = store.get(K.profile);
    s.metrics = M.migratePinned(Array.isArray(m) && m.length ? m : cp(DEFAULT_METRICS));
    s.goals = isObj(g) ? g : {};
    s.profile = isObj(p) ? M.mergeProfile(p) : { ...DEFAULT_PROFILE };
  }
  load();

  const getDay = (y, m0, d) => store.get(dayLocalKey(y, m0, d), {}) || {};
  const listDays = () => store.keys(DAY_RE).map(k => { const doc = store.get(k); return doc && typeof doc === 'object' ? { key: k, ...parseDayKey(k), data: doc, doc } : null; })
    .filter(Boolean).sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);

  // Settings are one combined cloud doc { metrics, goals, profile } (as before) and three local keys.
  function saveSettings(patch = {}) {
    Object.assign(s, patch);
    store.set(K.metrics, s.metrics); store.set(K.goals, s.goals); store.set(K.profile, s.profile);
    store.push(META.settings, { metrics: s.metrics, goals: s.goals, profile: s.profile });
  }

  function saveDay(y, m0, d, doc, { unlocked = false } = {}) {
    if (!unlocked && isDayLocked(y, m0, d, getDay(y, m0, d), today())) throw new LockedError();
    store.save(dayLocalKey(y, m0, d), doc, dayPath(y, m0, d)); return doc;
  }
  const setManualLock = (y, m0, d, locked) => store.save(dayLocalKey(y, m0, d), { ...getDay(y, m0, d), locked: !!locked }, dayPath(y, m0, d));
  const isLocked = (y, m0, d) => isDayLocked(y, m0, d, getDay(y, m0, d), today());

  const metrics = {
    add: o => { const list = M.addMetric(s.metrics, o, { now: now(), rand: rand() }); saveSettings({ metrics: list }); return list[list.length - 1]; },
    update: (id, patch) => saveSettings({ metrics: M.updateMetric(s.metrics, id, patch) }),
    togglePin: id => saveSettings({ metrics: M.togglePin(s.metrics, id) }),
    remove: id => saveSettings({ metrics: M.deleteMetric(s.metrics, id) })
  };
  const goals = { set: (id, v) => saveSettings({ goals: M.setGoal(s.goals, id, v) }), remove: id => saveSettings({ goals: M.removeGoal(s.goals, id) }) };
  const setProfile = input => saveSettings({ profile: M.normProfile(input) });

  const snapshot = () => buildBackup({ metrics: s.metrics, goals: s.goals, profile: s.profile, days: Object.fromEntries(listDays().map(x => [x.key, x.data])) }, new Date(now()));

  function applyImport(plan, payload) {
    saveSettings({ metrics: plan.settings.metrics, goals: plan.settings.goals, profile: plan.settings.profile });
    for (const k of plan.deleteLocalDays) { const p = parseDayKey(k); store.drop(k, dayPath(p.y, p.m, p.d)); }
    for (const id of plan.deleteCloudDayIds) store.pushDelete(`${DAY_COLLECTION}/${id}`);
    for (const k of plan.writeDays) { const p = parseDayKey(k); store.save(k, payload.days[k], dayPath(p.y, p.m, p.d)); }
  }
  function wipeAll(cloudIds = []) {                   // caller must have downloaded + verified a backup first
    const keys = listDays().map(x => x.key); const done = new Set();
    for (const k of keys) { const p = parseDayKey(k); store.drop(k, dayPath(p.y, p.m, p.d)); done.add(`${p.y}_${p.m + 1}_${p.d}`); }
    for (const id of cloudIds) if (!done.has(id)) store.pushDelete(`${DAY_COLLECTION}/${id}`);
    store.pushDelete(META.settings);
    store.set(K.metrics, cp(DEFAULT_METRICS)); store.set(K.goals, {}); store.set(K.profile, { ...DEFAULT_PROFILE });
    load(); return { localDays: keys.length, cloudDays: cloudIds.length };
  }

  // Remote -> local only (no re-upload). Same acceptance rules as legacy loadDayFromFirestore / loadSettingsRemote.
  const applyRemote = {
    day(id, data) { const p = parseDayId(id); if (p && isObj(data)) store.set(dayLocalKey(p.y, p.m, p.d), data); },
    settings(data) {
      if (Array.isArray(data.metrics) && data.metrics.length) store.set(K.metrics, M.migratePinned(data.metrics));
      if (isObj(data.goals)) store.set(K.goals, data.goals);
      if (isObj(data.profile)) store.set(K.profile, M.mergeProfile(data.profile));
      load();
    }
  };

  return { load, getDay, listDays, saveDay, setManualLock, isLocked, saveSettings, metrics, goals, setProfile, snapshot, applyImport, wipeAll, applyRemote,
    get state() { return s; } };
}
