// Full-screen, read-only reader for starred days. Previous/Next, arrow keys and swipe move between memories.
import { h } from '../../shared/dom.js';
import { openSheet } from '../../shared/sheet.js';
import { icon } from '../icons.js';
import { moodOf } from '../domain/moods.js';
import { timeLabel } from '../domain/dates.js';
import { dayInfo, readMinutes } from '../domain/memories.js';

export function openMemoryReader(days, start = 0) {
  let i = Math.max(0, Math.min(start, days.length - 1));
  const body = h('div', { class: 'mm-reader' });
  const prev = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('left', 18)}<span>Previous</span>` });
  const next = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `<span>Next</span>${icon('right', 18)}` });
  const count = h('span', { class: 'mm-r-count', role: 'status' });
  const sheet = openSheet({ title: 'Memory', full: true, content: h('div', {}, body, h('div', { class: 'mm-r-nav' }, prev, count, next)) });

  function paint() {
    const day = days[i], info = dayInfo(day.key);
    body.replaceChildren(
      h('header', { class: 'mm-r-head' },
        h('div', { class: 'mm-r-orn', 'aria-hidden': 'true' }, '✦ ✦ ✦'),
        h('div', { class: 'mm-r-day' }, `${info.day} ${info.month} ${info.year}`),
        h('div', { class: 'mm-r-full' }, `${info.full.split(',')[0]} · ${readMinutes(day)} min read`)),
      ...day.entries.map(e => {
        const mood = moodOf(e.mood);
        return h('section', { class: 'mm-r-entry' },
          h('div', { class: 'mm-r-time' }, timeLabel(e.datetime), mood ? ` · ${mood.emoji} ${mood.label}` : ''),
          e.tags?.length ? h('div', { class: 'dt-tags' }, ...e.tags.map(t => h('span', { class: 'dt-tag' }, '#' + t))) : null,
          ...e.sections.filter(s => s.title.trim() || s.content.trim()).map(s => h('div', { class: 'mm-r-sec' },
            s.title.trim() ? h('h3', { class: 'mm-r-title' }, s.title) : null,
            s.content.trim() ? h('p', { class: 'mm-r-text' }, s.content) : null)));
      }),
      h('div', { class: 'mm-r-end', 'aria-hidden': 'true' }, '✦'));
    prev.disabled = i <= 0; next.disabled = i >= days.length - 1;
    count.textContent = `${i + 1} / ${days.length}`;
    sheet.body.scrollTop = 0;
  }
  const go = d => { const n = i + d; if (n >= 0 && n < days.length) { i = n; paint(); } };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  sheet.el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } });
  let x0 = null;
  body.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  body.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1); }, { passive: true });
  paint();
  return sheet;
}
