// Firestore adapter for store.js. Re-uses the existing /firebase-config.js (not modified).
// Import this file DYNAMICALLY (import('./firestore.js').catch(()=>null)): firebase-config.js has
// static CDN imports, so offline first-load must not break the app shell.
import { auth, db } from '../../firebase-config.js';
const BASE = 'https://www.gstatic.com/firebasejs/10.12.0/';
let fsP, auP;
const fs = () => fsP || (fsP = import(BASE + 'firebase-firestore.js'));
const au = () => auP || (auP = import(BASE + 'firebase-auth.js'));

// Required auth flow for pages that must be signed in.
export async function requireUser({ redirect = '../../login.html' } = {}) {
  try {
    const { onAuthStateChanged } = await au();
    return await new Promise(res => { const un = onAuthStateChanged(auth, u => { un(); if (!u) { location.href = redirect; return; } res(u); }); });
  } catch (e) { console.warn('Auth unavailable (offline?)', e); return null; }
}

// Optional auth flow for local-first apps. Never redirects: null means local-only mode.
export async function optionalUser() {
  try {
    const { onAuthStateChanged } = await au();
    return await new Promise(res => { const un = onAuthStateChanged(auth, u => { un(); res(u || null); }); });
  } catch (e) { console.warn('Optional auth unavailable (offline?)', e); return null; }
}

// Paths are relative to users/{uid}/, e.g. 'moneytracker/2026_10_7' or 'moneytracker_meta/debts'.
export function firestoreRemote() {
  const seg = p => { const u = auth.currentUser; if (!u) throw new Error('not signed in'); return ['users', u.uid, ...p.split('/')]; };
  const merge = (local, remote) => {
    if (!local || !remote || typeof local !== 'object' || typeof remote !== 'object') return local;
    if (Array.isArray(local) && Array.isArray(remote)) {
      if (!local.every(x => x && typeof x === 'object' && x.id != null)) return local;
      const byId = new Map(remote.map(x => [x.id, x]));
      for (const item of local) {
        const old = byId.get(item.id);
        byId.set(item.id, old && Number(old.updatedAt || 0) > Number(item.updatedAt || 0) ? old : item);
      }
      return [...byId.values()];
    }
    const out = { ...remote };
    for (const [key, value] of Object.entries(local)) out[key] = key in remote ? merge(value, remote[key]) : value;
    return out;
  };
  return {
    async set(p, data) {
      const { doc, getDoc, setDoc } = await fs();
      const ref = doc(db, ...seg(p));
      const snap = await getDoc(ref);
      await setDoc(ref, snap.exists() ? merge(data, snap.data()) : data);
    },
    async del(p) { const { doc, deleteDoc } = await fs(); await deleteDoc(doc(db, ...seg(p))); },
    async get(p) { const { doc, getDoc } = await fs(); const s = await getDoc(doc(db, ...seg(p))); return s.exists() ? s.data() : null; },
    async list(c) { const { collection, getDocs } = await fs(); return (await getDocs(collection(db, ...seg(c)))).docs.map(d => ({ id: d.id, data: d.data() })); }
  };
}
