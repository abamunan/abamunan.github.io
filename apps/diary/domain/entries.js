// Pure helpers over entries and editor drafts. No DOM, no storage.
import { todayStr, nowTimeStr, splitDatetime, monthKey, monthLabel } from './dates.js';

export const blankDraft = (now = new Date()) =>
  ({ id: null, date: todayStr(now), time: nowTimeStr(now), sections: [{ title: '', content: '' }], mood: null, tags: [], pinned: false, starred: false, knownUpdatedMs: null });

export const draftFromEntry = e =>
  ({ id: e.id, ...splitDatetime(e.datetime), sections: e.sections.map(s => ({ title: s.title, content: s.content })),
    mood: e.mood ?? null, tags: [...(e.tags || [])], pinned: !!e.pinned, starred: !!e.starred, knownUpdatedMs: e.updatedAtMs });

export const isMeaningful = d => d.sections.some(s => s.title.trim() || s.content.trim());

export function stats(d) {
  const text = d.sections.map(s => s.content.trim()).filter(Boolean).join(' ');
  return { words: text ? text.split(/\s+/).length : 0, chars: text.length, sections: d.sections.length };
}

export const sortEntries = list =>
  [...list].sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : b.createdAtMs - a.createdAtMs));

export function titleOf(e) {
  const t = e.sections.find(s => s.title.trim())?.title.trim();
  if (t) return t;
  const line = e.sections.map(s => s.content.trim()).find(Boolean);
  return line ? line.split('\n')[0].slice(0, 70) : 'Untitled';
}

export function snippetOf(e) {
  const first = e.sections.find(s => s.content.trim());
  return first ? first.content.trim().replace(/\s+/g, ' ').slice(0, 110) : '';
}

/** [{key:'2026-10', label:'October 2026', entries:[…]}] newest month first (input must already be sorted). */
export function groupByMonth(entries) {
  const groups = [];
  for (const e of entries) {
    const key = monthKey(e.datetime);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, label: monthLabel(key), entries: [] }; groups.push(g); }
    g.entries.push(e);
  }
  return groups;
}
