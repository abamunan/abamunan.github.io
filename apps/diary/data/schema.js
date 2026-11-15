// Entry shape + conversions. Pure functions, no DOM, no Firebase (Timestamp class is passed in where needed).
//
// LOCAL entry (what lives in localStorage / memory):
//   { id, datetime:'YYYY-MM-DDTHH:MM:SS' (local time, same as the classic diary),
//     sections:[{title,content}], createdAtMs, updatedAtMs, syncedMs|null }
//   syncedMs = the remote updatedAt (ms) this device last saw/wrote. It is how conflicts are detected.
//
// REMOTE doc (diaryEntries/{id}) stays EXACTLY the classic diary's v1 shape so both apps can run
// side by side:  { userId, datetime, sections, createdAt:Timestamp, updatedAt:Timestamp }.
// Derived values (dateKey, month, word count) are never stored.
import { normalizeTags } from '../domain/tags.js';
import { normalizeMood } from '../domain/moods.js';

export const MAX_SECTIONS = 10, MAX_TITLE = 200, MAX_CONTENT = 30000;
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
export const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const pad = n => String(n).padStart(2, '0');

export const newEntryId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Firestore Timestamp | {seconds,nanoseconds} | number -> ms (or null). */
export function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return isFinite(t) ? t : null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  return null;
}

export const formatLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Accepts the canonical string, any parseable date string, a Timestamp or a number; returns canonical or null. */
export function coerceDatetime(v) {
  if (typeof v === 'string' && DATETIME_RE.test(v)) return v;
  const ms = typeof v === 'string' ? Date.parse(v) : toMs(v);
  return ms != null && !isNaN(ms) ? formatLocal(new Date(ms)) : null;
}

export function normalizeSections(list) {
  const src = Array.isArray(list) ? list : [];
  const out = src.slice(0, MAX_SECTIONS).map(s => ({ title: String(s?.title ?? ''), content: String(s?.content ?? '') }));
  return out.length ? out : [{ title: '', content: '' }];
}

const guessMs = datetime => { const t = Date.parse(datetime); return isNaN(t) ? Date.now() : t; };

/** Remote doc -> local entry. Returns null when the doc is unusable (no readable date). */
export function fromRemote(id, data) {
  if (!ID_RE.test(id) || !data || typeof data !== 'object') return null;
  const datetime = coerceDatetime(data.datetime);
  if (!datetime) return null;
  const updatedAtMs = toMs(data.updatedAt) ?? toMs(data.createdAt) ?? guessMs(datetime);
  const createdAtMs = toMs(data.createdAt) ?? updatedAtMs;
  return { id, datetime, sections: normalizeSections(data.sections), mood: normalizeMood(data.mood), tags: normalizeTags(data.tags), pinned: data.pinned === true, starred: data.starred === true,
    createdAtMs, updatedAtMs, syncedMs: updatedAtMs };
}

/** What goes into the outbox (no syncedMs: the live value is read from the repo at flush time). */
export const wire = e => ({
  datetime: e.datetime,
  sections: e.sections.map(s => ({ title: s.title, content: s.content })),
  mood: e.mood ?? null,
  tags: e.tags || [],
  pinned: !!e.pinned,
  starred: !!e.starred,
  createdAtMs: e.createdAtMs,
  updatedAtMs: e.updatedAtMs
});

/** Outbox item -> Firestore document (v1 shape). `Timestamp` is firebase-firestore's class. */
export function toRemote(w, uid, Timestamp) {
  const doc = {
    userId: uid,
    datetime: w.datetime,
    sections: w.sections.map(s => ({ title: s.title, content: s.content })),
    createdAt: Timestamp.fromMillis(w.createdAtMs),
    updatedAt: Timestamp.fromMillis(w.updatedAtMs)
  };
  // Optional fields are written ONLY when set, so a plain entry stays byte-for-byte the classic v1 shape
  // (and keeps working even against rules that predate mood/tags/pinned).
  const mood = normalizeMood(w.mood); if (mood) doc.mood = mood;
  const tags = normalizeTags(w.tags); if (tags.length) doc.tags = tags;
  if (w.pinned) doc.pinned = true;
  if (w.starred) doc.starred = true;                 // a star-marked day: shown in the Memories tab
  return doc;
}

/** Parsed localStorage JSON -> local entry (or null if corrupt). */
export function normalizeLocal(raw) {
  if (!raw || typeof raw !== 'object' || !ID_RE.test(String(raw.id))) return null;
  const datetime = coerceDatetime(raw.datetime);
  if (!datetime) return null;
  const updatedAtMs = toMs(raw.updatedAtMs) ?? guessMs(datetime);
  return {
    id: raw.id, datetime, sections: normalizeSections(raw.sections),
    mood: normalizeMood(raw.mood), tags: normalizeTags(raw.tags), pinned: raw.pinned === true, starred: raw.starred === true,
    createdAtMs: toMs(raw.createdAtMs) ?? updatedAtMs, updatedAtMs,
    syncedMs: raw.syncedMs == null ? null : toMs(raw.syncedMs)
  };
}

/** Decides what a remote write should do (pure, so it is unit-tested). */
export function decideWrite({ exists, remoteMs, base }) {
  if (!exists) return 'create';             // missing remotely (new, or deleted elsewhere): write it
  if (remoteMs == null) return 'write';     // unreadable remote doc: overwrite with the good local copy
  if (base == null) return 'write';         // never synced from this device: nothing to compare against
  return remoteMs === base ? 'write' : 'conflict';   // remote changed since we last saw it
}

export const derive = e => ({
  dateKey: e.datetime.slice(0, 10),
  monthKey: e.datetime.slice(0, 7),
  wordCount: e.sections.reduce((n, s) => { const t = (s.content || '').trim(); return n + (t ? t.split(/\s+/).length : 0); }, 0)
});
