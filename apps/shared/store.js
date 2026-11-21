// Local-first store with a persisted outbox. Pattern shared by Money and Health trackers.
//   remote adapter: { set(path,data), del(path), get(path), list(collection)->[{id,data}] }  (see firestore.js)
// Rule: a path that is still waiting in the outbox is NEVER overwritten by a cloud pull
// (the old app let the cloud overwrite unsent local edits).
export class StorageFullError extends Error { constructor() { super('Storage is full. Free some space or download a backup, then try again.'); this.name = 'StorageFullError'; } }
const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
// Errors that retrying can never fix. Such an item is parked in the "failed" list instead of blocking everything queued behind it.
const PERMANENT = new Set(['permission-denied', 'invalid-argument', 'resource-exhausted', 'failed-precondition', 'out-of-range', 'data-loss']);
const isPermanent = e => !!e && PERMANENT.has(String(e.code || '').replace(/^firestore\//, ''));

export function createStore({ outboxKey, remote = null, onState } = {}) {
  const LS = () => window.localStorage;
  const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };
  const get = (k, fb = null) => safe(() => { const v = LS().getItem(k); return v == null ? fb : JSON.parse(v); }, fb);
  const set = (k, v) => { try { LS().setItem(k, JSON.stringify(v)); } catch (e) { throw isQuota(e) ? new StorageFullError() : e; } };
  const getRaw = k => safe(() => LS().getItem(k), null);
  const setRaw = (k, v) => { try { LS().setItem(k, v); } catch (e) { throw isQuota(e) ? new StorageFullError() : e; } };
  const remove = k => safe(() => LS().removeItem(k));
  const keys = re => { const o = []; for (let i = 0; i < LS().length; i++) { const k = LS().key(i); if (k && re.test(k)) o.push(k); } return o; };

  let outbox = get(outboxKey, {}) || {};
  const failedKey = outboxKey + '_failed';
  let failed = get(failedKey, {}) || {};                  // path -> { op, data, t, error }: writes the cloud refused for good
  let timer = null, fails = 0, flushing = false;
  const persist = () => { try { set(outboxKey, outbox); } catch (e) { console.warn('Could not persist the outbox', e); } };   // never lose the in-memory queue because storage is full
  const persistFailed = () => { try { set(failedKey, failed); } catch (e) { console.warn('Could not persist failed writes', e); } };
  const emit = () => onState?.({ pending: Object.keys(outbox).length, failed: Object.keys(failed).length, failing: fails > 0, online: navigator.onLine });

  // One bad item must never block the rest: a permanent refusal parks it in `failed`, a temporary one is retried with back-off while the others go through.
  async function flush() {
    if (!remote || flushing) return;
    flushing = true; clearTimeout(timer);
    let hadTransient = false;
    try {
      for (const path of Object.keys(outbox)) {
        const it = outbox[path];
        try { it.op === 'set' ? await remote.set(path, it.data) : await remote.del(path); }
        catch (e) {
          if (isPermanent(e)) { if (outbox[path] === it) { failed[path] = { ...it, error: String(e?.code || e?.message || e) }; delete outbox[path]; persistFailed(); persist(); } }
          else hadTransient = true;
          continue;
        }
        if (outbox[path] === it) { delete outbox[path]; persist(); }   // newer write to same path stays queued
      }
      fails = hadTransient ? fails + 1 : 0;
      if (hadTransient) timer = setTimeout(flush, Math.min(60000, 1000 * 2 ** Math.min(fails, 6)));
      else if (Object.keys(outbox).length) setTimeout(flush, 0);
    } finally { flushing = false; emit(); }
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
    failedCount: () => Object.keys(failed).length,
    failedPaths: () => Object.keys(failed),
    retryFailed() { for (const [p, it] of Object.entries(failed)) if (!outbox[p]) outbox[p] = { op: it.op, data: it.data, t: it.t }; failed = {}; persistFailed(); persist(); emit(); return flush(); },
    clearFailed() { failed = {}; persistFailed(); emit(); },
    flush,
    setRemote(r) { remote = r; return flush(); },     // attach the cloud adapter after sign-in; queued writes are sent
    async pullCollection(coll, apply, options = {}) {
      if (!remote) return 0; let n = 0;
      let docs;
      try { docs = await remote.list(coll, options); }
      catch (e) { if (!options.since) throw e; docs = await remote.list(coll); }
      for (const { id, data } of docs) { if (outbox[`${coll}/${id}`]) continue; apply(id, data); n++; }
      return n;
    },
    async pullDoc(path, apply) {
      if (!remote || outbox[path]) return false;
      const d = await remote.get(path); if (d == null) return false; apply(d); return true;
    }
  };
}
