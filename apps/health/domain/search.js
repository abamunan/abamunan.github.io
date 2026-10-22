import { summaryLine } from './day.js';
// days = [{ y, m (0-based), d, data }]. Same matching and ordering as legacy searchAllDays (max 150 results).
export function searchDays(days, metrics, query, moods = []) {
  const q = String(query ?? '').trim().toLowerCase(); if (!q) return [];
  const results = [];
  days.forEach(({ y, m: mo, d, data }) => metrics.forEach(met => {
    const note = data['note_' + met.id] || ''; const line = summaryLine(met, data, moods); if (!line) return;
    if ((met.label + ' ' + note).toLowerCase().includes(q)) results.push({ y, mo, d, metric: met, line, note });
  }));
  results.sort((a, b) => (b.y - a.y) || (b.mo - a.mo) || (b.d - a.d));
  return results.slice(0, 150);
}
