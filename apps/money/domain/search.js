// Search across every recorded entry (pure). Words must ALL match (AND); a number matches an amount exactly, appears in the text, or is the day number / year ("3 oct", "oct 2026").
// Words also match the date text, e.g. "oct", "october 2026", "2026-10-03". Nothing is written anywhere.
const MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const norm = s => String(s ?? '').normalize('NFC').toLowerCase();
const NUM = /^\d[\d,]*(\.\d+)?$/;
export const parseQuery = q => norm(q).split(/\s+/).filter(Boolean);
export const dateText = (y, m0, d) => `${d} ${MON[m0]} ${MON[m0].slice(0, 3)} ${y} ${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function extractTags(text) {
  const matches = String(text ?? '').match(/#([a-zA-Z0-9_\u0980-\u09FF-]+)/g);
  return matches ? [...new Set(matches.map(m => m.toLowerCase()))] : [];
}

export function matchEntry(e, dText, tokens) {
  const tags = extractTags(e.note);
  const text = norm([e.label, e.note, e.acctLabel, tags.join(' ')].join(' '));
  const words = dText.split(' ');
  return tokens.every(t => {
    // If searching for #tag or plain word, match directly against text or tags
    if (NUM.test(t)) {
      return Number(t.replace(/,/g, '')) === e.amt || text.includes(t) || words.includes(t);
    }
    return text.includes(t) || dText.includes(t);
  });
}

// Collect all unique tags across all recorded days
export function collectTags(days, entriesOf) {
  const set = new Set();
  for (const x of days) {
    for (const e of entriesOf(x.doc)) {
      if (e.note) extractTags(e.note).forEach(tag => set.add(tag));
    }
  }
  return [...set].sort();
}

// days: [{y, m (0-based), d, doc}], entriesOf(doc) → rows {kind:'in'|'out', amt, label, note, acctLabel}. kind: 'all' | 'in' | 'out'.
export function searchEntries({ days, query, kind = 'all', entriesOf, limit = 100 }) {
  const tokens = parseQuery(query);
  if (!tokens.length) return { tokens, groups: [], total: 0, shown: 0, sumOut: 0, sumIn: 0 };
  const groups = []; let total = 0, shown = 0, sumOut = 0, sumIn = 0;
  for (const x of [...days].sort((a, b) => b.y - a.y || b.m - a.m || b.d - a.d)) {
    const dText = dateText(x.y, x.m, x.d), hits = entriesOf(x.doc).filter(e => (kind === 'all' || e.kind === kind) && matchEntry(e, dText, tokens));
    if (!hits.length) continue;
    for (const e of hits) { total++; if (e.kind === 'out') sumOut += e.amt; else sumIn += e.amt; }
    const room = limit - shown; if (room <= 0) continue;
    const entries = hits.slice(0, room); shown += entries.length; groups.push({ y: x.y, m0: x.m, d: x.d, doc: x.doc, entries });
  }
  return { tokens, groups, total, shown, sumOut: Math.round(sumOut * 100) / 100, sumIn: Math.round(sumIn * 100) / 100 };
}
