import { h } from '../../shared/dom.js';
import { titleOf, snippetOf } from '../domain/entries.js';
import { dayNum, monthShort, timeLabel } from '../domain/dates.js';
import { moodOf } from '../domain/moods.js';
import { icon } from '../icons.js';

/** One entry as a tappable row (Timeline, Calendar day panel, On this day). */
export function entryRow(e, onOpen, { showYear = false } = {}) {
  const mood = moodOf(e.mood), snip = snippetOf(e);
  return h('button', { class: 'dt-row', type: 'button', onclick: () => onOpen(e) },
    h('span', { class: 'dt-date', 'aria-hidden': 'true' }, h('b', {}, dayNum(e.datetime)), h('i', {}, showYear ? e.datetime.slice(0, 4) : monthShort(e.datetime))),
    h('span', { class: 'dt-main' },
      h('span', { class: 'dt-title' }, e.pinned ? h('span', { class: 'dt-pin', html: icon('pin', 14), role: 'img', 'aria-label': 'Pinned' }) : null,
        e.starred ? h('span', { class: 'dt-star', html: icon('star', 14, 'currentColor'), role: 'img', 'aria-label': 'Starred' }) : null, titleOf(e)),
      snip ? h('span', { class: 'dt-snip' }, snip) : null,
      e.tags?.length ? h('span', { class: 'dt-tags' }, ...e.tags.slice(0, 4).map(t => h('span', { class: 'dt-tag' }, '#' + t))) : null),
    h('span', { class: 'dt-meta' },
      mood ? h('span', { class: 'dt-mood', role: 'img', 'aria-label': `Mood: ${mood.label}` }, mood.emoji) : null,
      timeLabel(e.datetime) + (e.sections.length > 1 ? ` · ${e.sections.length}` : '')));
}
