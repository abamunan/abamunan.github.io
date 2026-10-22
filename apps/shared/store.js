// Local-first store with a persisted outbox. Pattern shared by Money and Health trackers.
//   remote adapter: { set(path,data), del(path), get(path), list(collection)->[{id,data}] }  (see firestore.js)
// Rule: a path that is still waiting in the outbox is NEVER overwritten by a cloud pull
// (the old app let the cloud overwrite unsent local edits).
export function createStore({ outboxKey, remote = null, onState } = {}) {
  const LS = () => window.localStorage;
  const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };
  const get = (k, fb = null) => safe(() => { const v = LS().getItem(k); return v == null ? fb : JSON.parse(v); }, fb);
  const set = (k, v) => LS().setItem(k, JSON.stringify(v));
  const getRaw = k => safe(() => LS().getItem(k), null);
  const setRaw = (k, v) => LS().setItem(k, v);
  const remove = k => safe(() => LS().removeItem(k));
  const keys = re => { const o = []; for (let i = 0; i < LS().length; i++) { const k = LS().key(i); if (k && re.test(k)) o.push(k); } return o; };

  let outbox = get(outboxKey, {}) || {};
  let timer = null, fails = 0, flushing = false;
  const persist = () => set(outboxKey, outbox);
  const emit = () => onState?.({ pending: Object.keys(outbox).length, failing: fails > 0, online: navigator.onLine });

  async function flush() {
    if (!remote || flushing) return;
    flushing = true; clearTimeout(timer);
    try {
      for (const path of Object.keys(outbox)) {
        const it = outbox[path];
        try { it.op === 'set' ? await remote.set(path, it.data) : await remote.del(path); }
        catch (e) { fails++; throw e; }
        fails = 0;
        if (outbox[path] === it) { delete outbox[path]; persist(); }   // newer write to same path stays queued
      }
      if (Object.keys(outbox).length) setTimeout(flush, 0);
    } catch { timer = setTimeout(flush, Math.min(60000, 1000 * 2 ** Math.min(fails, 6))); }
    finally { flushing = false; emit(); }
  }
  const enqueue = (path, op, data) => { outbox[path] = { op, data: op === 'set' ? data : null, t: Date.now() }; persist(); emit(); flush(); };
  if (typeof window !== 'undefined') window.addEventListener('online', flush);

  return {
    get, set, getRaw, setRaw, remove, keys,
    save(localKey, value, remotePath) { set(localKey, value); if (remotePath) enqueue(remotePath, 'set', value); },
    drop(localKey, remotePath) { remove(localKey); if (remotePath) enqueue(remotePath, 'del'); },
    push: (path, data) => enqueue(path, 'set', data),       // remote-only write (meta docs built from several local keys)
    pushDelete: path => enqueue(path, 'del'),
    isPending: path => !!outbox[path],
    pendingCount: () => Object.keys(outbox).length,
    flush,
    setRemote(r) { remote = r; return flush(); },     // attach the cloud adapter after sign-in; queued writes are sent
    async pullCollection(coll, apply) {
      if (!remote) return 0; let n = 0;
      for (const { id, data } of await remote.list(coll)) { if (outbox[`${coll}/${id}`]) continue; apply(id, data); n++; }
      return n;
    },
    async pullDoc(path, apply) {
      if (!remote || outbox[path]) return false;
      const d = await remote.get(path); if (d == null) return false; apply(d); return true;
    }
  };
}
