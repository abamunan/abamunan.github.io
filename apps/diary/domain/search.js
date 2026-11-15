// Multi-word search over every loaded entry (the new diary keeps ALL entries locally, so this is a full search).
import { moodOf } from './moods.js';
const humanDate = dt => {
  const d = new Date(dt);
  return isNaN(d) ? '' : [
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  ].join(' ');
};
export const searchableText = e =>
  [e.datetime, humanDate(e.datetime), ...(e.tags || []).map(t => '#' + t + ' ' + t), moodOf(e.mood)?.label || '', ...e.sections.flatMap(s => [s.title, s.content])].join(' ').toLocaleLowerCase();

export function filterEntries(entries, term) {
  const terms = String(term || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter(e => { const t = searchableText(e); return terms.every(x => t.includes(x)); });
}
