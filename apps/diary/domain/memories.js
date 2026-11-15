// Memories = the days you star-marked. One memory per DAY (all starred entries of that day together).
// Pure helpers: no DOM, no storage.
import { sortEntries } from './entries.js';

export const memoriesOf = entries => sortEntries(entries.filter(e => e.starred));

/** [{ key:'2026-10-27', entries:[oldest → newest] }] — newest day first, or oldest first. */
export function memoryDays(starred, oldestFirst = false) {
  const m = new Map();
  for (const e of starred) { const k = e.datetime.slice(0, 10); (m.get(k) || m.set(k, []).get(k)).push(e); }
  const days = [...m].map(([key, es]) => ({ key, entries: es.sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : a.createdAtMs - b.createdAtMs)) }));
  days.sort((a, b) => (oldestFirst ? 1 : -1) * (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return days;
}

/** [{ year:'2026', days:[…] }] keeping the order of `days`. */
export function groupByYear(days) {
  const out = [];
  for (const d of days) {
    const y = d.key.slice(0, 4);
    let g = out[out.length - 1];
    if (!g || g.year !== y) { g = { year: y, days: [] }; out.push(g); }
    g.days.push(d);
  }
  return out;
}

export const memoryYears = days => [...new Set(days.map(d => d.key.slice(0, 4)))].sort((a, b) => (a < b ? 1 : -1));

export function memoryStats(days) {
  if (!days.length) return { days: 0, entries: 0, years: 0, first: null, last: null };
  const keys = days.map(d => d.key).sort();
  return { days: days.length, entries: days.reduce((n, d) => n + d.entries.length, 0), years: memoryYears(days).length, first: keys[0], last: keys[keys.length - 1] };
}

export const entryText = e => e.sections.map(s => [s.title.trim(), s.content.trim()].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
export const dayText = day => day.entries.map(entryText).filter(Boolean).join('\n\n');
export const wordCount = day => { const t = day.entries.map(e => e.sections.map(s => s.content).join(' ')).join(' ').trim(); return t ? t.split(/\s+/).length : 0; };
export const readMinutes = day => Math.max(1, Math.round(wordCount(day) / 200));

/** A random day, never the one in `avoidKey` (when there is another to pick). */
export function pickRandom(days, rand = Math.random, avoidKey = null) {
  if (!days.length) return null;
  const pool = avoidKey && days.length > 1 ? days.filter(d => d.key !== avoidKey) : days;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

export function dayInfo(key) {
  const d = new Date(`${key}T00:00:00`);
  const f = o => d.toLocaleDateString('en-US', o);
  return { weekday: f({ weekday: 'short' }), day: String(d.getDate()), month: f({ month: 'short' }), year: String(d.getFullYear()),
    full: f({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
}
