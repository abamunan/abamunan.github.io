// Pulls the cloud diary into the local repo. Additive + safe:
//  - an entry that is still waiting in the outbox is never overwritten (same rule as store.js)
//  - an entry the cloud no longer has, that we had synced before, was deleted elsewhere -> removed here too
import { entryPath, COLLECTION } from './keys.js';
import { fromRemote } from './schema.js';

export async function pull({ repo, store, remote }) {
  const docs = await remote.list(COLLECTION);           // throws on failure -> nothing below runs, nothing is deleted
  const seen = new Set();
  let added = 0, updated = 0, removed = 0;
  for (const { id, data } of docs) {
    seen.add(id);
    if (store.isPending(entryPath(id))) continue;
    const r = fromRemote(id, data);
    if (!r) continue;
    const l = repo.get(id);
    if (!l) { repo.applyRemote(r); added++; }
    else if (l.syncedMs !== r.updatedAtMs) { repo.applyRemote(r); updated++; }
  }
  for (const l of repo.list()) {
    if (l.syncedMs != null && !seen.has(l.id) && !store.isPending(entryPath(l.id))) { repo.dropLocal(l.id); removed++; }
  }
  if (added || updated || removed) repo.notify({ type: 'pull', added, updated, removed });
  return { added, updated, removed };
}
