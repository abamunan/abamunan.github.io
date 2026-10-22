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
  return {
    async set(p, data) { const { doc, setDoc } = await fs(); await setDoc(doc(db, ...seg(p)), data); },   // whole-doc write, as today
    async del(p) { const { doc, deleteDoc } = await fs(); await deleteDoc(doc(db, ...seg(p))); },
    async get(p) { const { doc, getDoc } = await fs(); const s = await getDoc(doc(db, ...seg(p))); return s.exists() ? s.data() : null; },
    async list(c) { const { collection, getDocs } = await fs(); return (await getDocs(collection(db, ...seg(c)))).docs.map(d => ({ id: d.id, data: d.data() })); }
  };
}
