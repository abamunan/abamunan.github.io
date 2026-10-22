// Flat fields are the source of truth for totals; `entries` is a layer on top (decision A).
// reconcile(): never drops anything. If entries don't add up to the flat total (e.g. an older
// app version edited the day), the gap becomes ONE "legacy adjustment" entry per category.
import { round2 } from '../../shared/fmt.js';
const EPS = 0.005;
const byTs = (a, b) => (a.ts || 0) - (b.ts || 0);
const clone = o => JSON.parse(JSON.stringify(o ?? {}));

export function joinNotes(list) { return list.filter(e => e.note).slice().sort(byTs).map(e => e.note).join(' \u00B7 '); }

// Rewrite the flat fields of ONE category from its entries (amount, note, account, ts). Mutates doc.
export function regenFlat(doc, cat) {
  const list = (doc.entries || []).filter(e => e.cat === cat).sort(byTs);
  doc[cat] = round2(list.reduce((s, e) => s + e.amt, 0));
  const note = joinNotes(list), ts = Math.max(0, ...list.map(e => e.ts || 0));
  note ? (doc['note_' + cat] = note) : delete doc['note_' + cat];
  list[0]?.acct ? (doc['acct_' + cat] = list[0].acct) : delete doc['acct_' + cat];   // first entry's account
  ts ? (doc['ts_' + cat] = ts) : delete doc['ts_' + cat];
}

export function reconcile(src, catIds, { defaultAcct = null, now = Date.now() } = {}) {
  const doc = clone(src);
  let entries = Array.isArray(doc.entries) ? doc.entries.filter(e => e && e.cat && typeof e.amt === 'number') : [];
  const adjusted = [];
  for (const cat of catIds) {
    const flat = round2(Number(doc[cat]) || 0);
    const list = entries.filter(e => e.cat === cat);
    const gap = round2(flat - round2(list.reduce((s, e) => s + e.amt, 0)));
    if (Math.abs(gap) >= EPS) {
      const adj = list.find(e => e.adj);
      if (adj) { adj.amt = round2(adj.amt + gap); if (Math.abs(adj.amt) < EPS) entries = entries.filter(e => e !== adj); }
      else entries.push({ id: 'adj_' + cat, cat, amt: gap, acct: doc['acct_' + cat] || defaultAcct, note: list.length ? '' : (doc['note_' + cat] || ''), ts: doc['ts_' + cat] || now, adj: true });
      adjusted.push({ cat, amt: gap });
    } else if (list.length) {                      // totals agree; pick up account/note edits made by an older version
      const fa = doc['acct_' + cat];
      if (fa && list.every(e => e.acct === list[0].acct) && list[0].acct !== fa) list.forEach(e => { e.acct = fa; });
      if (list.length === 1 && !list[0].adj) list[0].note = doc['note_' + cat] || '';
    }
  }
  entries.sort(byTs);
  if (entries.length || Array.isArray(src?.entries)) doc.entries = entries; else delete doc.entries;
  return { doc, adjusted, changed: JSON.stringify(doc) !== JSON.stringify(src ?? {}) };
}
