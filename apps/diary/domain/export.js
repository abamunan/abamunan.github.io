import { dateLabel, timeLabel } from './dates.js';
import { moodOf } from './moods.js';

/** Entries whose date is within [from, to] (inclusive 'YYYY-MM-DD'; empty = open-ended), oldest or newest first. */
export function inRange(entries, from, to, oldestFirst = true) {
  const list = entries.filter(e => { const d = e.datetime.slice(0, 10); return (!from || d >= from) && (!to || d <= to); });
  return list.sort((a, b) => (oldestFirst ? 1 : -1) * (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : a.createdAtMs - b.createdAtMs));
}

export function toMarkdown(entries, now = new Date()) {
  const out = [`# Munan's Diary`, '', `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · exported ${now.toISOString().slice(0, 10)}`, ''];
  for (const e of entries) {
    const mood = moodOf(e.mood);
    out.push(`## ${dateLabel(e.datetime)} · ${timeLabel(e.datetime)}${mood ? ` · ${mood.emoji} ${mood.label}` : ''}`);
    if (e.tags?.length) out.push('', e.tags.map(t => `#${t.replace(/\s+/g, '-')}`).join(' '));
    for (const s of e.sections) {
      out.push('');
      if (s.title.trim()) out.push(`### ${s.title.trim()}`, '');
      out.push(s.content.trim());
    }
    out.push('', '---', '');
  }
  return out.join('\n');
}
