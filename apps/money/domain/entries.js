// Pure entry operations. Every write updates BOTH `entries` and the flat fields together.
import { round2 } from '../../shared/fmt.js';
import { newId } from '../../shared/dom.js';
import { reconcile, regenFlat } from './reconcile.js';
// ctx = { catIds, defaultAcct, now?, idGen? }
const prep = (src, ctx) => reconcile(src, ctx.catIds, ctx).doc;
const check = (amt, adj) => { if (!(adj ? amt !== 0 : amt > 0)) throw new Error('Amount must be greater than 0'); };

export function addEntry(src, e, ctx) {
  const doc = prep(src, ctx);
  const entry = { id: e.id || newId('e'), cat: e.cat, amt: round2(e.amt), acct: e.acct || ctx.defaultAcct, note: String(e.note || '').trim(), ts: e.ts || ctx.now || Date.now() };
  if (e.adj) entry.adj = true;
  if (!ctx.catIds.includes(entry.cat)) throw new Error('Unknown category');
  check(entry.amt, entry.adj);
  (doc.entries ||= []).push(entry); regenFlat(doc, entry.cat);
  return { doc, entry };
}
export function updateEntry(src, id, patch, ctx) {
  const doc = prep(src, ctx), e = (doc.entries || []).find(x => x.id === id);
  if (!e) throw new Error('Entry not found');
  const before = { ...e }, oldCat = e.cat;
  if (patch.cat !== undefined) { if (!ctx.catIds.includes(patch.cat)) throw new Error('Unknown category'); e.cat = patch.cat; }
  if (patch.amt !== undefined) e.amt = round2(patch.amt);
  if (patch.acct !== undefined) e.acct = patch.acct || ctx.defaultAcct;
  if (patch.note !== undefined) e.note = String(patch.note).trim();
  check(e.amt, e.adj);
  regenFlat(doc, e.cat); if (oldCat !== e.cat) regenFlat(doc, oldCat);
  return { doc, entry: e, before };
}
export function deleteEntry(src, id, ctx) {
  const doc = prep(src, ctx), i = (doc.entries || []).findIndex(x => x.id === id);
  if (i < 0) throw new Error('Entry not found');
  const [removed] = doc.entries.splice(i, 1); regenFlat(doc, removed.cat);
  return { doc, removed };                                  // pass `removed` to restoreEntry() for Undo
}
export const restoreEntry = (src, removed, ctx) => addEntry(src, removed, ctx);   // same id + ts → same position
