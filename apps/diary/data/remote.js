// Firestore adapter for store.js, bound to the classic diary's collection (diaryEntries, filtered by userId).
// Import this DYNAMICALLY from main.js: firebase-config.js has static CDN imports, so an offline
// first load must not break the app shell.
import { auth, db } from '../../../firebase-config.js';
import { COLLECTION } from './keys.js';
import { fromRemote, toRemote, decideWrite } from './schema.js';

const BASE = 'https://www.gstatic.com/firebasejs/10.12.0/';
let fsP;
const fs = () => fsP || (fsP = import(BASE + 'firebase-firestore.js'));
const idOf = path => path.split('/')[1];
const uid = () => { const u = auth.currentUser; if (!u) throw new Error('not signed in'); return u.uid; };

/** hooks = { base(id), onWritten(id, ms), onConflict(id, remoteEntry) } — all provided by the repo. */
export function diaryRemote(hooks) {
  return {
    async set(path, w) {
      const id = idOf(path);
      const { doc, getDoc, setDoc, Timestamp } = await fs();
      const ref = doc(db, COLLECTION, id);
      let snap = null;
      // Rules that predate the "missing doc" fix answer permission-denied for a doc that does not exist yet.
      try { snap = await getDoc(ref); } catch (e) { if (e?.code !== 'permission-denied') throw e; }
      const exists = !!(snap && snap.exists());
      const remoteEntry = exists ? fromRemote(id, snap.data()) : null;
      const verdict = decideWrite({ exists, remoteMs: remoteEntry ? remoteEntry.updatedAtMs : null, base: hooks.base(id) });
      if (verdict === 'conflict') { hooks.onConflict(id, remoteEntry); return; }   // nothing is overwritten
      await setDoc(ref, toRemote(w, uid(), Timestamp));
      hooks.onWritten(id, w.updatedAtMs);
    },
    async del(path) { const { doc, deleteDoc } = await fs(); await deleteDoc(doc(db, COLLECTION, idOf(path))); },
    async get(path) { const { doc, getDoc } = await fs(); const s = await getDoc(doc(db, COLLECTION, idOf(path))); return s.exists() ? s.data() : null; },
    async list() {
      const { collection, query, where, getDocs } = await fs();
      const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', uid())));   // single-field filter: no composite index
      return snap.docs.map(d => ({ id: d.id, data: d.data() }));
    }
  };
}
