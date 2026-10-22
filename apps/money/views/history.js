import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
import { monthModel, yearModel, searchModel, searchTagsModel } from '../domain/viewmodels.js';
import { entryRow } from '../components/entry-row.js';
import { openAddSheet } from '../components/add-sheet.js';
import { deleteWithUndo } from '../components/entry-actions.js';
import { icon } from '../icons.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function historyView(el, app) {
  const st = app.state.history ||= { y: new Date().getFullYear(), m0: new Date().getMonth(), mode: 'month', kind: 'all', cat: null, q: '' };
  const rerender = () => historyView(el, app);
  const step = n => { if (st.mode === 'year') st.y += n; else { st.m0 += n; if (st.m0 < 0) { st.m0 = 11; st.y--; } if (st.m0 > 11) { st.m0 = 0; st.y++; } } rerender(); };
  const title = st.mode === 'year' ? String(st.y) : `${MONTHS[st.m0]} ${st.y}`;
  const searching = st.mode === 'search';
  const nav = h('div', { class: 'hnav' }, h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': st.mode === 'year' ? 'Previous year' : 'Previous month', html: icon('left'), onclick: () => step(-1) }),
    h('h2', { class: 'hnav__t', 'aria-live': 'polite' }, title), h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': st.mode === 'year' ? 'Next year' : 'Next month', html: icon('right'), onclick: () => step(1) }));
  const seg = (items, cur, set, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label }, items.map(([k, l]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(cur === k), onclick: () => { set(k); rerender(); } }, l)));
  const modeSeg = seg([['month', 'Month'], ['year', 'Year'], ['search', 'Search']], st.mode, k => { st.mode = k; }, 'View');
  let body;
  if (searching) {
    const results = h('div', { class: 'sres', 'aria-live': 'polite' });
    const draw = () => {
      const r = searchModel(app.repo, st.q, st.kind);
      if (!r.tokens.length) return results.replaceChildren(h('p', { class: 'empty' }, 'Type a word, a category, a note, an amount or a month (like "rice", "500" or "oct 2026").'));
      if (!r.total) return results.replaceChildren(h('p', { class: 'empty' }, `Nothing found for \u201C${st.q.trim()}\u201D.`));
      const groups = r.groups.map(g => {
        const where = { y: g.y, m0: g.m0, d: g.d, locked: g.locked }, date = new Date(g.y, g.m0, g.d);
        return h('section', { class: 'dgroup', 'aria-label': date.toDateString() },
          h('div', { class: 'sechead' }, h('h3', {}, date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), g.locked && h('span', { class: 'lockico', title: 'Locked', 'aria-label': 'Locked', html: icon('lock', 16) }))),
          h('div', { class: 'elist' }, g.entries.map(e => entryRow(e, { onEdit: () => openAddSheet(app.repo, { entry: { ...e, ...where }, onDone: app.refresh }), onDelete: () => deleteWithUndo(app.repo, { ...e, ...where }, app.refresh) }))));
      });
      results.replaceChildren(h('section', { class: 'card card--row', 'aria-label': 'Search totals' }, h('div', {}, h('div', { class: 'card__sub' }, `${r.total} ${r.total === 1 ? 'entry' : 'entries'}`), h('div', { class: 'num' }, `${r.shown < r.total ? `showing ${r.shown}` : 'all shown'}`)),
        h('div', {}, h('div', { class: 'card__sub' }, 'Income'), h('div', { class: 'num money-in' }, fmt(r.sumIn, { sign: true }))), h('div', {}, h('div', { class: 'card__sub' }, 'Expense'), h('div', { class: 'num money-out' }, fmt(-r.sumOut, { sign: true })))),
        ...groups, ...(r.shown < r.total ? [h('p', { class: 'card__sub' }, `Only the newest ${r.shown} are listed. Add another word to narrow it down.`)] : []));
    };
    const allTags = searchTagsModel(app.repo);
    const tagChips = allTags.length ? h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': 'Tags' },
      allTags.map(tag => h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(st.q.includes(tag)),
        onclick: () => {
          st.q = st.q.includes(tag) ? st.q.replace(tag, '').replace(/\s+/g, ' ').trim() : (st.q ? `${st.q} ${tag}` : tag);
          input.value = st.q;
          draw();
        }
      }, tag))
    ) : null;

    body = h('div', { class: 'filters' }, input, tagChips, seg([['all', 'All'], ['out', 'Expense'], ['in', 'Income']], st.kind, k => { st.kind = k; }, 'Type filter'), results); draw();
  } else if (st.mode === 'year') {
    const ym = yearModel(app.repo, st.y);
    body = h('div', { class: 'elist' }, ym.months.map(r => h('button', { type: 'button', class: 'mrow', onclick: () => { st.m0 = r.m0; st.mode = 'month'; rerender(); }, 'aria-label': `${MONTHS[r.m0]}: income ${fmt(r.inc)}, expense ${fmt(r.exp)}. Open month.` },
      h('span', { class: 'mrow__m' }, MONTHS[r.m0], h('span', { class: 'erow__sub' }, r.days ? `${r.days} days recorded` : 'No entries')),
      h('span', { class: 'num' }, h('span', { class: 'money-in' }, fmt(r.inc, { sign: true })), h('br'), h('span', { class: 'money-out' }, fmt(-r.exp, { sign: true }))))));
  } else {
    const mm = monthModel(app.repo, st.y, st.m0, { kind: st.kind, cat: st.cat });
    const cats = [...app.repo.settings.expense, ...app.repo.settings.income];
    const catSel = h('select', { class: 'ui-input', 'aria-label': 'Filter by category', onchange: ev => { st.cat = ev.target.value || null; rerender(); } }, h('option', { value: '' }, 'All categories'), cats.map(f => h('option', { value: f.id, selected: st.cat === f.id }, `${f.icon || ''} ${f.label}`)));
    const groups = mm.days.map(g => {
      const where = { y: g.y, m0: g.m0, d: g.d, locked: g.locked }, date = new Date(g.y, g.m0, g.d);
      return h('section', { class: 'dgroup', 'aria-label': date.toDateString() },
        h('div', { class: 'sechead' }, h('h3', {}, date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), g.locked && h('span', { class: 'lockico', title: 'Locked', 'aria-label': 'Locked', html: icon('lock', 16) })),
          h('span', { class: 'num sechead__t' }, g.totals.exp ? h('span', { class: 'money-out' }, fmt(-g.totals.exp, { sign: true })) : '', ' ', g.totals.inc ? h('span', { class: 'money-in' }, fmt(g.totals.inc, { sign: true })) : '')),
        h('div', { class: 'elist' }, g.entries.map(e => entryRow(e, { onEdit: () => openAddSheet(app.repo, { entry: { ...e, ...where }, onDone: app.refresh }), onDelete: () => deleteWithUndo(app.repo, { ...e, ...where }, app.refresh) }))));
    });
    body = h('div', {}, h('section', { class: 'card card--row', 'aria-label': 'Month totals' }, h('div', {}, h('div', { class: 'card__sub' }, 'Income'), h('div', { class: 'num money-in' }, fmt(mm.totals.totalInc, { sign: true }))),
      h('div', {}, h('div', { class: 'card__sub' }, 'Expense'), h('div', { class: 'num money-out' }, fmt(-mm.totals.totalExp, { sign: true }))), h('div', {}, h('div', { class: 'card__sub' }, 'Net'), h('div', { class: 'num' }, fmt(mm.totals.net, { sign: true })))),
      h('div', { class: 'filters' }, seg([['all', 'All'], ['out', 'Expense'], ['in', 'Income']], st.kind, k => { st.kind = k; }, 'Type filter'), catSel),
      groups.length ? groups : h('p', { class: 'empty' }, 'No entries for this filter.'));
  }
  el.replaceChildren(h('div', { class: 'hhead' }, searching ? h('h2', { class: 'hnav__t' }, 'Search') : nav, modeSeg), body);
}
