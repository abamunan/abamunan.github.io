// Timeline = every entry, newest first, pinned on top, grouped by month. All entries live on this device,
// so search and tag filters are instant and cover the whole diary.
import { h } from '../../shared/dom.js';
import { groupByMonth } from '../domain/entries.js';
import { filterEntries } from '../domain/search.js';
import { allTags } from '../domain/tags.js';
import { entryRow } from '../components/entry-row.js';
import { openEntry } from '../components/entry-sheet.js';
import { icon } from '../icons.js';

export function timelineView(main, app) {
  const { repo, state } = app;
  const all = repo.list();
  const tags = allTags(all);
  if (state.tag && !tags.some(t => t.tag === state.tag)) state.tag = '';
  const input = h('input', { class: 'ui-input dt-search', type: 'search', placeholder: 'Search your diary…', 'aria-label': 'Search diary', value: state.search || '' });
  const summary = h('p', { class: 'dt-summary', role: 'status' });
  const list = h('div', { class: 'dt-list' });
  const chips = h('div', { class: 'dt-tagbar', role: 'group', 'aria-label': 'Filter by tag' });
  const open = e => openEntry(e, app);

  function paintChips() {
    chips.hidden = !tags.length;
    chips.replaceChildren(...tags.slice(0, 24).map(({ tag, count }) => h('button',
      { class: 'dt-chip' + (state.tag === tag ? ' is-on' : ''), type: 'button', 'aria-pressed': String(state.tag === tag),
        onclick: () => { state.tag = state.tag === tag ? '' : tag; paintChips(); paint(); } }, '#' + tag, h('i', {}, count))));
  }
  function paint() {
    let items = filterEntries(all, state.search);
    if (state.tag) items = items.filter(e => (e.tags || []).includes(state.tag));
    const filtering = !!(state.search || '').trim() || !!state.tag;
    summary.textContent = filtering ? `${items.length} of ${all.length} ${all.length === 1 ? 'entry' : 'entries'} match` : `${all.length} ${all.length === 1 ? 'entry' : 'entries'}`;
    if (!all.length) {
      list.replaceChildren(h('div', { class: 'dy-empty' }, h('p', {}, 'Your diary is empty.'),
        h('button', { class: 'ui-btn ui-btn--primary', type: 'button', onclick: () => app.newEntry() }, 'Write your first entry')));
      return;
    }
    if (!items.length) { list.replaceChildren(h('p', { class: 'dy-empty' }, 'No entries match.')); return; }
    const pinned = items.filter(e => e.pinned), rest = items.filter(e => !e.pinned);
    list.replaceChildren(
      ...(pinned.length ? [h('h2', { class: 'dt-month' }, 'Pinned'), ...pinned.map(e => entryRow(e, open))] : []),
      ...groupByMonth(rest).flatMap(g => [h('h2', { class: 'dt-month' }, g.label), ...g.entries.map(e => entryRow(e, open))]));
  }
  input.addEventListener('input', () => { state.search = input.value; paint(); });

  paintChips(); paint();
  main.replaceChildren(
    h('section', { class: 'dt' }, h('div', { class: 'dt-bar' }, h('span', { class: 'dt-search-icon', html: icon('search', 18), 'aria-hidden': 'true' }), input), chips, summary, list),
    h('button', { class: 'dy-fab', type: 'button', 'aria-label': 'New entry', html: icon('plus', 28), onclick: () => app.newEntry() }));
}
