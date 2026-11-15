// One starred DAY as a decorated card. Read-only: tapping opens the reader.
import { h } from '../../shared/dom.js';
import { icon } from '../icons.js';
import { moodOf } from '../domain/moods.js';
import { dayInfo, entryText, readMinutes } from '../domain/memories.js';

export function memoryCard(day, onOpen) {
  const info = dayInfo(day.key);
  const shown = day.entries.slice(0, 2), more = day.entries.length - shown.length;
  const moods = [...new Set(day.entries.map(e => moodOf(e.mood)).filter(Boolean).map(m => m.emoji))];
  const tags = [...new Set(day.entries.flatMap(e => e.tags || []))].slice(0, 5);
  const card = h('article', { class: 'mm-card', tabindex: '0', role: 'button', 'aria-label': `Open memory from ${info.full}` },
    h('span', { class: 'mm-star', html: icon('star', 20, 'currentColor'), 'aria-hidden': 'true' }),
    h('div', { class: 'mm-date', 'aria-hidden': 'true' }, h('i', {}, info.weekday), h('b', {}, info.day), h('em', {}, info.month)),
    h('div', { class: 'mm-body' },
      ...shown.map(e => {
        const title = e.sections.find(s => s.title.trim())?.title.trim();
        const text = e.sections.map(s => s.content.trim()).filter(Boolean).join('\n\n') || entryText(e);
        return h('div', { class: 'mm-entry' }, title ? h('h4', {}, title) : null, h('p', { class: 'mm-text' }, text));
      }),
      more > 0 ? h('p', { class: 'mm-more' }, `+ ${more} more ${more === 1 ? 'entry' : 'entries'} that day`) : null,
      h('div', { class: 'mm-meta' },
        ...moods.map(m => h('span', { class: 'mm-mood', 'aria-hidden': 'true' }, m)),
        ...tags.map(t => h('span', { class: 'dt-tag' }, '#' + t)),
        h('span', { class: 'mm-read' }, `${readMinutes(day)} min read →`))));
  card.addEventListener('click', onOpen);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } });
  return card;
}
