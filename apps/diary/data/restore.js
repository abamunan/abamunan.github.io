// Restore from a JSON backup. Pure: parse + validate + plan. Applying the plan is repo.importEntry / removeMany.
// Reads every backup flavour: classic "Backup JSON (all)" (v2), this app's backup, and old v1 files with {seconds,nanoseconds}.
import { coerceDatetime, normalizeSections, toMs, ID_RE, newEntryId, MAX_SECTIONS, MAX_TITLE, MAX_CONTENT } from './schema.js';
import { normalizeTags } from '../domain/tags.js';
import { normalizeMood } from '../domain/moods.js';

function entryFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const datetime = typeof raw.datetime === 'string' ? coerceDatetime(raw.datetime) : null;
  if (!datetime) return null;
  if (!Array.isArray(raw.sections) || raw.sections.length < 1 || raw.sections.length > MAX_SECTIONS) return null;
  for (const s of raw.sections) {
    if (!s || typeof s.title !== 'string' || typeof s.content !== 'string') return null;
    if (s.title.length > MAX_TITLE || s.content.length > MAX_CONTENT) return null;
  }
  const t = Date.parse(datetime);
  const updatedAtMs = toMs(raw.updatedAtMs) ?? toMs(raw.updatedAt) ?? toMs(raw.createdAtMs) ?? toMs(raw.createdAt) ?? (isNaN(t) ? Date.now() : t);
  const createdAtMs = toMs(raw.createdAtMs) ?? toMs(raw.createdAt) ?? updatedAtMs;
  return {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newEntryId(),
    datetime, sections: normalizeSections(raw.sections),
    mood: normalizeMood(raw.mood), tags: normalizeTags(raw.tags), pinned: raw.pinned === true, starred: raw.starred === true,
    createdAtMs, updatedAtMs
  };
}

/** -> { ok:false, error } | { ok:true, entries, skipped } */
export function parseBackup(text, { uid = null } = {}) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  if (!data || data.app !== 'munan-diary' || !Array.isArray(data.entries)) return { ok: false, error: 'That is not a Diary backup file.' };
  if (uid && data.entries.some(e => e && e.userId && e.userId !== uid)) return { ok: false, error: 'This backup belongs to a different account, so nothing was restored.' };
  const byId = new Map();
  let skipped = 0;
  for (const raw of data.entries) {
    const e = entryFrom(raw);
    if (!e) { skipped++; continue; }
    const prev = byId.get(e.id);
    if (!prev || e.updatedAtMs > prev.updatedAtMs) byId.set(e.id, e);     // duplicate ids inside one file: newest wins
  }
  return { ok: true, entries: [...byId.values()], skipped };
}

/**
 * merge   : add what is missing, and take the backup's copy only where it is NEWER. Never deletes. (safe)
 * replace : make the diary exactly the backup: differing entries are overwritten, entries not in the backup are removed.
 */
export function planRestore(local, incoming, mode = 'merge') {
  const byId = new Map(local.map(e => [e.id, e]));
  const add = [], update = [];
  let same = 0;
  for (const inc of incoming) {
    const l = byId.get(inc.id);
    if (!l) add.push(inc);
    else if (mode === 'replace' ? inc.updatedAtMs !== l.updatedAtMs : inc.updatedAtMs > l.updatedAtMs) update.push(inc);
    else same++;
  }
  const keep = new Set(incoming.map(e => e.id));
  const remove = mode === 'replace' ? local.filter(l => !keep.has(l.id)).map(l => l.id) : [];
  return { mode, add, update, same, remove };
}

export function applyPlan(repo, plan) {
  for (const e of plan.add) repo.importEntry(e);
  for (const e of plan.update) repo.importEntry(e);
  const removed = repo.removeMany(plan.remove);
  repo.notify({ type: 'restore-batch' });
  return { added: plan.add.length, updated: plan.update.length, removed };
}
