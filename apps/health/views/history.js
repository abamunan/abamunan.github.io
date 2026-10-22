import { h } from '../../shared/dom.js';
import { MOODS, MONTHS } from '../data/defaults.js';
import { dayHasData, summaryLine } from '../domain/day.js';
import { daysInMonth } from '../domain/calendar.js';
import { searchDays } from '../domain/search.js';
import { icon } from '../icons.js';

export function historyView(el, app) {
  const { repo } = app, now = new Date(), st = app.state.history ||= { y: now.getFullYear(), m0: now.getMonth(), mode: 'month', q: '' };
  const rerender = () => historyView(el, app), metrics = repo.state.metrics;
  const step = n => { st.m0 += n; if (st.m0 < 0) { st.m0 = 11; st.y--; } if (st.m0 > 11) { st.m0 = 0; st.y++; } rerender(); };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, [['month', 'Month'], ['search', 'Search']].map(([k, l]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(st.mode === k), onclick: () => { st.mode = k; rerender(); } }, l)));
  const dateLabel = (y, m0, d, long) => new Date(y, m0, d).toLocaleDateString('en-GB', long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
  const open = (y, m0, d) => app.openDay(y, m0, d);
  let body, head;
  if (st.mode === 'search') {
    head = h('h2', { class: 'hnav__t' }, 'Search'); const results = h('div', { class: 'sres', 'aria-live': 'polite' });
    const days = repo.listDays();
    const draw = () => { const q = st.q.trim(); if (!q) return results.replaceChildren(h('p', { class: 'empty' }, 'Type a metric name or a word from a note (like "weight" or "after run").'));
      const r = searchDays(days, metrics, q, MOODS); if (!r.length) return results.replaceChildren(h('p', { class: 'empty' }, `Nothing found for \u201C${q}\u201D.`));
      results.replaceChildren(h('p', { class: 'card__sub' }, `${r.length}${r.length === 150 ? '+' : ''} ${r.length === 1 ? 'result' : 'results'}`), h('div', { class: 'elist' }, r.map(x => h('button', { type: 'button', class: 'mrow', onclick: () => open(x.y, x.mo, x.d) },
        h('span', { class: 'mrow__m' }, `${x.line.icon} ${x.line.label}: ${x.line.val}`, h('span', { class: 'mrow__sub' }, dateLabel(x.y, x.mo, x.d, true) + (x.note ? ` \u00B7 ${x.note}` : ''))))))); };
    const input = h('input', { class: 'ui-input', type: 'search', value: st.q, placeholder: 'Search metrics and notes\u2026', 'aria-label': 'Search days', autocomplete: 'off', enterkeyhint: 'search' });
    let timer; input.addEventListener('input', () => { st.q = input.value; clearTimeout(timer); timer = setTimeout(draw, 150); });
    body = h('div', { class: 'filters' }, input, results); draw();
  } else {
    head = h('div', { class: 'hnav' }, h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Previous month', html: icon('left'), onclick: () => step(-1) }),
      h('h2', { class: 'hnav__t', 'aria-live': 'polite' }, `${MONTHS[st.m0]} ${st.y}`), h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Next month', html: icon('right'), onclick: () => step(1) }));
    const rows = []; let logged = 0;
    for (let d = daysInMonth(st.y, st.m0); d >= 1; d--) {
      const doc = repo.getDay(st.y, st.m0, d); if (!dayHasData(metrics, doc) && !Object.keys(doc).some(k => k.startsWith('note_'))) continue;
      if (dayHasData(metrics, doc)) logged++;
      const lines = metrics.map(m => summaryLine(m, doc, MOODS)).filter(Boolean), locked = repo.isLocked(st.y, st.m0, d);
      rows.push(h('button', { type: 'button', class: 'mrow hday', onclick: () => open(st.y, st.m0, d), 'aria-label': `${dateLabel(st.y, st.m0, d)}: ${lines.length} metrics logged. Open day.` },
        h('span', { class: 'mrow__m' }, h('span', {}, dateLabel(st.y, st.m0, d), locked && h('span', { class: 'lockico', title: 'Locked', html: icon('lock', 14) })),
          h('span', { class: 'mrow__sub' }, lines.slice(0, 4).map(l => `${l.icon} ${l.val}`).join('  ') + (lines.length > 4 ? `  +${lines.length - 4}` : '')))));
    }
    body = h('div', { class: 'filters' }, h('section', { class: 'card card--row', 'aria-label': 'Month summary' }, h('div', {}, h('div', { class: 'card__sub' }, 'Days logged'), h('div', { class: 'num hbig' }, `${logged} / ${daysInMonth(st.y, st.m0)}`))),
      rows.length ? h('div', { class: 'elist' }, rows) : h('p', { class: 'empty' }, 'Nothing logged this month yet.'));
  }
  el.replaceChildren(h('div', { class: 'hhead' }, head, seg), body);
}
