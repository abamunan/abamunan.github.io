// The ONLY module that reads/writes diary data. Views call this, never localStorage.
// Local-first: every change is written to this device immediately; commit() queues it for the cloud
// (store.js outbox, retried with backoff, survives reloads) and never blocks the UI.
import { entryKey, entryPath, ENTRY_RE } from './keys.js';
import { normalizeLocal, normalizeSections, wire, newEntryId } from './schema.js';
import { sortEntries } from '../domain/entries.js';
import { normalizeTags } from '../domain/tags.js';
import { normalizeMood } from '../domain/moods.js';

const cloneSections = s => normalizeSections(s).map(x => ({ title: x.title, content: x.content }));

export async function createRepo({ store, backend, now = () => Date.now(), onError = e => console.error(e) }) {
  const map = new Map();
  const subs = new Set();
  const emit = info => subs.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });

  for (const raw of await backend.load()) { const e = normalizeLocal(raw); if (e) map.set(e.id, e); }

  // Reads are served from memory; writes go to the backend one at a time, in order (so the last edit always wins).
  let queue = Promise.resolve();
  const later = fn => { queue = queue.then(fn).catch(err => onError(err)); return queue; };
  const put = e => { map.set(e.id, e); later(() => backend.put(e)); return e; };

  const repo = {
    list: () => sortEntries([...map.values()]),
    get: id => map.get(id) || null,
    count: () => map.size,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    notify: emit,

    // ---- writes made by the person (never emit: the editor already knows) ----
    create({ datetime, sections, mood = null, tags = [], pinned = false, starred = false }) {
      const t = now();
      return put({ id: newEntryId(), datetime, sections: cloneSections(sections), mood: normalizeMood(mood), tags: normalizeTags(tags), pinned: !!pinned, starred: !!starred,
        createdAtMs: t, updatedAtMs: t, syncedMs: null });
    },
    update(id, patch) {
      const e = map.get(id); if (!e) throw new Error('Entry not found');
      const next = { ...e, updatedAtMs: Math.max(now(), e.updatedAtMs + 1) };
      if (patch.datetime) next.datetime = patch.datetime;
      if (patch.sections) next.sections = cloneSections(patch.sections);
      if (patch.mood !== undefined) next.mood = normalizeMood(patch.mood);
      if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
      if (patch.pinned !== undefined) next.pinned = !!patch.pinned;
      if (patch.starred !== undefined) next.starred = !!patch.starred;
      return put(next);
    },
    commit(id) { const e = map.get(id); if (e) store.push(entryPath(id), wire(e)); },   // queue for the cloud
    remove(id) {
      const e = map.get(id); if (!e) return null;
      map.delete(id); later(() => backend.del(id)); store.drop(entryKey(id), entryPath(id));
      emit({ type: 'remove', id }); return e;
    },
    restore(entry) {                                                 // Undo of remove()
      const e = put({ ...entry, updatedAtMs: Math.max(now(), entry.updatedAtMs + 1) });
      store.push(entryPath(e.id), wire(e)); emit({ type: 'restore', id: e.id }); return e;
    },

    // ---- hooks used by the cloud adapter / sync ----
    base: id => map.get(id)?.syncedMs ?? null,                        // remote updatedAt we last saw (conflict base)
    markSynced(id, ms) { const e = map.get(id); if (e && e.syncedMs !== ms) put({ ...e, syncedMs: ms }); },
    applyRemote(entry) { put(entry); },
    dropLocal(id) { map.delete(id); later(() => backend.del(id)); },
    /** Someone else changed this entry while we had unsent edits: keep OUR text as a new entry, show THEIRS here. */
    forkConflict(id, remoteEntry) {
      const local = map.get(id);
      if (!remoteEntry) return null;
      let copy = null;
      if (local) {
        const t = now();
        copy = put({ id: newEntryId(), datetime: local.datetime, sections: cloneSections(local.sections), mood: local.mood ?? null, tags: [...(local.tags || [])],
          pinned: !!local.pinned, starred: !!local.starred, createdAtMs: t, updatedAtMs: t, syncedMs: null });
        store.push(entryPath(copy.id), wire(copy));
      }
      put({ ...remoteEntry, syncedMs: remoteEntry.updatedAtMs });
      emit({ type: 'conflict', id, copyId: copy ? copy.id : null });
      return copy;
    },

    exportAll: () => repo.list().map(e => ({ id: e.id, datetime: e.datetime, sections: e.sections, mood: e.mood ?? null, tags: e.tags || [], pinned: !!e.pinned, starred: !!e.starred,
      createdAtMs: e.createdAtMs, updatedAtMs: e.updatedAtMs })),
    /** Bring an entry in from a backup file. Keeps our sync base so the cloud write is a normal update, never a conflict. */
    importEntry(inc) {
      const l = map.get(inc.id);
      const e = put({ ...inc, syncedMs: l ? l.syncedMs : null, updatedAtMs: Math.max(inc.updatedAtMs, (l ? l.updatedAtMs : 0) + 1) });
      store.push(entryPath(e.id), wire(e)); return e;
    },
    removeMany(ids) {
      let n = 0;
      for (const id of ids) if (map.delete(id)) { later(() => backend.del(id)); store.drop(entryKey(id), entryPath(id)); n++; }
      if (n) emit({ type: 'restore-batch' });
      return n;
    },
    flushStorage: () => queue,                                       // resolves when every write so far is on disk
    clearAll() { map.clear(); for (const k of store.keys(ENTRY_RE)) store.remove(k); return later(() => backend.clear()); }
  };
  return repo;
}
