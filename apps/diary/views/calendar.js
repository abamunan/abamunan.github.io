// Calendar = month grid with a dot on every day you wrote, streaks, and "On this day".
import { h } from '../../shared/dom.js';
import { todayStr, monthLabel, dateLabel } from '../domain/dates.js';
import { entriesByDay, monthGrid, streaks, onThisDay, monthStats, WEEK_START } from '../domain/calendar.js';
import { sortEntries } from '../domain/entries.js';
import { entryRow } from '../components/entry-row.js';
import { openEntry } from '../components/entry-sheet.js';
import { icon } from '../icons.js';

const SUN_FIRST = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEK = Array.from({ length: 7 }, (_, i) => SUN_FIRST[(WEEK_START + i) % 7]);   // Sat Sun Mon Tue Wed Thu Fri
const pad = n => String(n).padStart(2, '0');

export function calendarView(main, app) {
  const { repo, state } = app;
  const all = repo.list(), byDay = entriesByDay(all), today = todayStr();
  const cal = state.cal || (state.cal = { y: +today.slice(0, 4), m0: +today.slice(5, 7) - 1, sel: today });
  const open = e => openEntry(e, app);
  const st = streaks(byDay.keys(), today);
  const otd = onThisDay(all, today).slice(0, 3);

  const shift = n => { const d = new Date(cal.y, cal.m0 + n, 1); cal.y = d.getFullYear(); cal.m0 = d.getMonth(); paint(); };
  const select = (key, inMonth) => { cal.sel = key; if (!inMonth) { cal.y = +key.slice(0, 4); cal.m0 = +key.slice(5, 7) - 1; } paint(); };

  function paint() {
    const mk = `${cal.y}-${pad(cal.m0 + 1)}`, ms = monthStats(all, mk);
    const nav = h('div', { class: 'dc-nav' },
      h('button', { class: 'dy-icon', type: 'button', 'aria-label': 'Previous month', html: icon('left', 18), onclick: () => shift(-1) }),
      h('h2', { class: 'dc-month', 'aria-live': 'polite' }, monthLabel(mk)),
      h('button', { class: 'dy-icon', type: 'button', 'aria-label': 'Next month', html: icon('right', 18), onclick: () => shift(1) }),
      h('button', { class: 'ui-btn ui-btn--ghost dc-today', type: 'button', onclick: () => { cal.y = +today.slice(0, 4); cal.m0 = +today.slice(5, 7) - 1; cal.sel = today; paint(); } }, 'Today'));
    const stat = (n, label) => h('div', { class: 'dc-stat' }, h('b', {}, String(n)), h('span', {}, label));
    const stats = h('div', { class: 'dc-stats' }, stat(st.current, st.current === 1 ? 'day streak' : 'day streak'), stat(st.longest, 'best streak'), stat(ms.entries, 'this month'), stat(ms.words.toLocaleString('en-US'), 'words'));
    const head = h('div', { class: 'dc-week', 'aria-hidden': 'true' }, ...WEEK.map(s => h('span', {}, s)));
    const grid = h('div', { class: 'dc-grid', role: 'grid', 'aria-label': monthLabel(mk) },
      ...monthGrid(cal.y, cal.m0, byDay, today).flat().map(c => h('button', {
        class: 'dc-day' + (c.inMonth ? '' : ' is-out') + (c.today ? ' is-today' : '') + (c.key === cal.sel ? ' is-sel' : '') + (c.count ? ' has' : ''),
        type: 'button', 'aria-pressed': String(c.key === cal.sel),
        'aria-label': `${dateLabel(c.key + 'T00:00:00')}, ${c.count ? c.count + (c.count === 1 ? ' entry' : ' entries') : 'no entries'}`,
        onclick: () => select(c.key, c.inMonth) }, h('span', {}, String(c.day)), c.starred ? h('b', { class: 'dc-star', 'aria-hidden': 'true' }, '★') : null, c.count ? h('i', { class: 'dc-dot' }) : null)));
    const dayEntries = sortEntries(byDay.get(cal.sel) || []);
    const panel = h('section', { class: 'dy-card dm-card' }, h('h2', { class: 'dm-h' }, dateLabel(cal.sel + 'T00:00:00')),
      dayEntries.length ? h('div', { class: 'dt-list' }, ...dayEntries.map(e => entryRow(e, open))) : h('p', { class: 'dm-note' }, 'No entry on this day.'),
      h('button', { class: 'ui-btn ui-btn--primary', type: 'button', html: `${icon('plus', 18)}<span>${dayEntries.length ? 'Add another entry' : 'Write for this day'}</span>`, onclick: () => app.newEntry(cal.sel) }));
    main.replaceChildren(
      h('section', { class: 'dy-card dc' }, nav, stats, head, grid), panel,
      otd.length ? h('section', { class: 'dy-card dm-card' }, h('h2', { class: 'dm-h' }, 'On this day'), h('div', { class: 'dt-list' }, ...otd.map(e => entryRow(e, open, { showYear: true })))) : null);
  }
  paint();
}
