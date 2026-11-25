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
// overwrite:false (default, Health) merges with the cloud copy before writing, so a delete never reaches the cloud.
// overwrite:true (Money) writes the local document as-is: store.js already protects unsent local edits from a pull,
// so local is the source of truth and deletions (entries, notes, debts, categories, templates) reach the cloud.
// merge (overwrite mode only): { 'path': { list, deleted } | { map } } = documents that must be UNIONED with the cloud copy instead of replaced,
// so two devices adding ledger events or debts never erase each other's. list/deleted: union by id (this device's copy wins per id, a deleted id
// stays deleted). map: union of { id: timestamp }, newest wins.
// sets (+ tomb, scalars, objects): several id-lists in ONE document (Money settings). Per list: union by id, the copy with the newer `updatedAt` wins
// (a tie keeps this device's copy); `tomb` is a { 'list:id': time } map of removed ids, an item stays removed unless it was saved at or after that time.
// scalars { field: stampField }: the value with the newer stamp wins. objects: plain maps unioned key by key (this device wins).
export function mergeSpecial(local, remote, m) {
  if (!remote || typeof remote !== 'object') return local;
  if (m.sets) {
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}), at = x => Number(x?.updatedAt) || 0;
    const tl = obj(local[m.tomb]), tr = obj(remote[m.tomb]), tomb = { ...tr };
    for (const [k, v] of Object.entries(tl)) tomb[k] = Math.max(Number(v) || 0, Number(tr[k]) || 0);
    const out = { ...remote, ...local, [m.tomb]: tomb };
    for (const list of m.sets) {
      if (!Array.isArray(local[list]) && !Array.isArray(remote[list])) continue;
      const mine = Array.isArray(local[list]) ? local[list] : [], theirs = (Array.isArray(remote[list]) ? remote[list] : []).filter(x => x && x.id != null);
      const byId = new Map(theirs.map(x => [x.id, x])), seen = new Set(), merged = [];
      for (const x of mine) { const o = byId.get(x?.id); merged.push(o && at(o) > at(x) ? o : x); seen.add(x?.id); }
      for (const x of theirs) if (!seen.has(x.id)) merged.push(x);
      out[list] = merged.filter(x => { const t = tomb[`${list}:${x?.id}`]; return t == null || at(x) >= Number(t); });
    }
    for (const [field, stamp] of Object.entries(m.scalars || {})) {
      const lt = Number(local[stamp]) || 0, rt = Number(remote[stamp]) || 0;
      if (rt > lt && field in remote) { out[field] = remote[field]; out[stamp] = rt; } else if (lt || rt) out[stamp] = Math.max(lt, rt);
    }
    for (const k of m.objects || []) if (local[k] || remote[k]) out[k] = { ...obj(remote[k]), ...obj(local[k]) };
    return out;
  }
  if (m.map) { const a = local[m.map] || {}, b = remote[m.map] || {}, out = { ...b }; for (const [k, v] of Object.entries(a)) out[k] = Math.max(Number(v) || 0, Number(b[k]) || 0); return { ...local, [m.map]: out }; }
  const deleted = [...new Set([...(Array.isArray(remote[m.deleted]) ? remote[m.deleted] : []), ...(Array.isArray(local[m.deleted]) ? local[m.deleted] : [])])], gone = new Set(deleted);
  const mine = Array.isArray(local[m.list]) ? local[m.list] : [], ids = new Set(mine.map(x => x?.id));
  const theirs = (Array.isArray(remote[m.list]) ? remote[m.list] : []).filter(x => x && x.id != null && !ids.has(x.id));
  return { ...local, [m.list]: [...mine, ...theirs].filter(x => !gone.has(x?.id)), [m.deleted]: deleted };
}
export function firestoreRemote({ overwrite = false, merge: mergeCfg = {} } = {}) {
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
      if (overwrite) {
        const m = mergeCfg[p]; if (m) { const snap = await getDoc(ref); if (snap.exists()) data = mergeSpecial(data, snap.data(), m); }
        await setDoc(ref, data); return;
      }
      const snap = await getDoc(ref);
      await setDoc(ref, snap.exists() ? merge(data, snap.data()) : data);
    },
    async del(p) { const { doc, deleteDoc } = await fs(); await deleteDoc(doc(db, ...seg(p))); },
    async get(p) { const { doc, getDoc } = await fs(); const s = await getDoc(doc(db, ...seg(p))); return s.exists() ? s.data() : null; },
    async list(c, { since } = {}) {
      const { collection, getDocs, query, where } = await fs();
      const ref = collection(db, ...seg(c));
      const snap = await getDocs(since == null ? ref : query(ref, where('updatedAt', '>', since)));
      return snap.docs.map(d => ({ id: d.id, data: d.data() }));
    }
  };
}
