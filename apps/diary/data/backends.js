// Where entries physically live on this device. The repo keeps everything in memory and writes through to a backend:
//   idb    IndexedDB — normal choice (hundreds of MB, survives large diaries)
//   ls     localStorage — fallback only (private modes / blocked IndexedDB), ~5 MB limit
//   memory tests
import { entryKey, ENTRY_RE } from './keys.js';

export function memoryBackend(seed = []) {
  const m = new Map(seed.map(e => [e.id, e]));
  return { kind: 'memory', async load() { return [...m.values()]; }, async put(e) { m.set(e.id, e); }, async del(id) { m.delete(id); }, async clear() { m.clear(); } };
}

export function lsBackend(store) {
  return {
    kind: 'ls',
    async load() { return store.keys(ENTRY_RE).map(k => store.get(k)).filter(Boolean); },
    async put(e) { store.set(entryKey(e.id), e); },                  // throws when the 5 MB quota is hit -> repo.onError
    async del(id) { store.remove(entryKey(id)); },
    async clear() { store.keys(ENTRY_RE).forEach(k => store.remove(k)); }
  };
}

export function idbBackend(name = 'diary2', idb = globalThis.indexedDB) {
  let dbP;
  const open = () => dbP || (dbP = new Promise((resolve, reject) => {
    const r = idb.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('entries', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB blocked'));
  }));
  const run = (mode, fn) => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('entries', mode);
    const req = fn(t.objectStore('entries'));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
  }));
  return { kind: 'idb', load: () => run('readonly', s => s.getAll()), put: e => run('readwrite', s => s.put(e)),
    del: id => run('readwrite', s => s.delete(id)), clear: () => run('readwrite', s => s.clear()) };
}

/** IndexedDB when it works, otherwise localStorage. */
export async function pickBackend(store) {
  try {
    if (!globalThis.indexedDB) throw new Error('IndexedDB not available');
    const b = idbBackend(); await b.load(); return b;
  } catch (e) { console.warn('IndexedDB unavailable, falling back to localStorage:', e); return lsBackend(store); }
}

/** One-time move of Phase 1/2 entries from localStorage into IndexedDB. Copy -> verify -> only then delete the originals. */
export async function migrateLegacy({ store, backend }) {
  if (backend.kind === 'ls') return 0;
  const keys = store.keys(ENTRY_RE);
  if (!keys.length) return 0;
  const entries = keys.map(k => store.get(k)).filter(e => e && e.id);
  for (const e of entries) await backend.put(e);
  const have = new Set((await backend.load()).map(e => e.id));
  if (!entries.every(e => have.has(e.id))) throw new Error('Migration verification failed; originals kept');
  keys.forEach(k => store.remove(k));
  return entries.length;
}
