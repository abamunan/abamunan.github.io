// Memories (view only): every day you star-marked, with the full written text, organised by year.
import { h } from '../../shared/dom.js';
import { memoriesOf, memoryDays, groupByYear, memoryYears, memoryStats, pickRandom, dayText, dayInfo } from '../domain/memories.js';
import { memoryCard } from '../components/memory-card.js';
import { openMemoryReader } from '../components/memory-reader.js';
import { icon } from '../icons.js';

export function memoriesView(main, app) {
  const st = app.state.mem || (app.state.mem = { year: '', oldest: false });
  const starred = memoriesOf(app.repo.list());
  const everyDay = memoryDays(starred, false);

  if (!everyDay.length) {
    main.replaceChildren(h('section', { class: 'mm-hero mm-empty' },
      h('span', { class: 'mm-empty-star', html: icon('star', 44, 'currentColor'), 'aria-hidden': 'true' }),
      h('h2', {}, 'Memories'),
      h('p', { class: 'mm-sub' }, 'Days you star will live here, with everything you wrote, to read again whenever you like.'),
      h('p', { class: 'mm-sub' }, 'While writing, tap “Star this day”.'),
      h('button', { class: 'ui-btn ui-btn--primary', type: 'button', onclick: () => app.newEntry() }, 'Write today')));
    return;
  }

  const stats = memoryStats(everyDay), years = memoryYears(everyDay);
  if (st.year && !years.includes(st.year)) st.year = '';
  let feature = pickRandom(everyDay);

  const featureHost = h('section', { class: 'mm-feature' });
  const chips = h('div', { class: 'dt-tagbar mm-years', role: 'group', 'aria-label': 'Filter by year' });
  const list = h('div', { class: 'mm-list' });
  const sortBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', onclick: () => { st.oldest = !st.oldest; paintList(); } });

  const visible = () => memoryDays(starred, st.oldest).filter(d => !st.year || d.key.startsWith(st.year));
  const openAt = key => { const v = visible(); const idx = v.findIndex(d => d.key === key); openMemoryReader(v, idx < 0 ? 0 : idx); };

  function paintFeature() {
    const info = dayInfo(feature.key), text = dayText(feature).replace(/\s+/g, ' ').slice(0, 320);
    featureHost.replaceChildren(
      h('q', {}, text),
      h('footer', {}, h('span', {}, `${info.full}`),
        h('span', { class: 'mm-feature-actions' },
          h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', onclick: () => { feature = pickRandom(everyDay, Math.random, feature.key); paintFeature(); } }, 'Shuffle'),
          h('button', { class: 'ui-btn ui-btn--primary', type: 'button', onclick: () => { const v = everyDay; openMemoryReader(v, v.findIndex(d => d.key === feature.key)); } }, 'Read'))));
  }
  function paintChips() {
    chips.hidden = years.length < 2;
    chips.replaceChildren(...['', ...years].map(y => h('button', { class: 'dt-chip' + (st.year === y ? ' is-on' : ''), type: 'button', 'aria-pressed': String(st.year === y),
      onclick: () => { st.year = y; paintChips(); paintList(); } }, y || 'All years')));
  }
  function paintList() {
    sortBtn.textContent = st.oldest ? 'Oldest first' : 'Newest first';
    const groups = groupByYear(visible());
    list.replaceChildren(...groups.flatMap(g => [
      h('div', { class: 'mm-year' }, h('h3', {}, g.year), h('small', {}, `${g.days.length} ${g.days.length === 1 ? 'day' : 'days'}`)),
      ...g.days.map(d => memoryCard(d, () => openAt(d.key)))]));
  }

  paintFeature(); paintChips(); paintList();
  main.replaceChildren(
    h('section', { class: 'mm-hero' },
      h('h2', {}, h('span', { html: icon('star', 30, 'currentColor'), 'aria-hidden': 'true' }), 'Memories'),
      h('p', { class: 'mm-sub' }, `${stats.days} starred ${stats.days === 1 ? 'day' : 'days'} · ${stats.years} ${stats.years === 1 ? 'year' : 'years'} · ${dayInfo(stats.first).year}${stats.first.slice(0, 4) !== stats.last.slice(0, 4) ? '–' + dayInfo(stats.last).year : ''}`),
      h('div', { class: 'mm-hero-actions' }, sortBtn)),
    featureHost, chips, list);
}
