import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
import { todayModel } from '../domain/viewmodels.js';
import { entryRow } from '../components/entry-row.js';
import { openAddSheet } from '../components/add-sheet.js';
import { deleteWithUndo } from '../components/entry-actions.js';
import { icon } from '../icons.js';

export function todayView(el, app) {
  const now = new Date(), m = todayModel(app.repo, now), y = now.getFullYear(), m0 = now.getMonth(), d = now.getDate();
  const where = { y, m0, d, locked: m.today.locked };
  const b = m.worstBudget;
  const budget = b
    ? h('section', { class: 'card', 'aria-labelledby': 'bud-h' }, h('h2', { id: 'bud-h', class: 'card__h' }, 'Budget this month'),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(b.pct)), 'aria-label': `${b.label} budget used` }, h('span', { class: 'bar__fill bar__fill--' + b.state, style: `width:${b.pct}%` })),
        h('p', { class: 'card__p' }, b.state !== 'ok' && h('span', { html: icon('warn', 16) }), ` ${b.icon || ''} ${b.label}: ${Math.round(b.pct)}% used (${fmt(b.used)} of ${fmt(b.budget)})`, b.state === 'over' ? ' \u2014 over budget' : b.state === 'warn' ? ' \u2014 close to the limit' : ''),
        m.budgets.length > 1 && h('p', { class: 'card__sub' }, `${m.budgets.filter(x => x.state !== 'ok').length} of ${m.budgets.length} budgets need attention`))
    : h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'Budget this month'), h('p', { class: 'card__p' }, 'No budgets set yet. Add them in the Plan tab.'));
  const list = m.today.entries.length
    ? h('div', { class: 'elist' }, m.today.entries.map(e => entryRow(e, { onEdit: () => openAddSheet(app.repo, { entry: { ...e, ...where }, onDone: app.refresh }), onDelete: () => deleteWithUndo(app.repo, { ...e, ...where }, app.refresh) })))
    : h('p', { class: 'empty' }, 'Nothing recorded today. Tap + to add an expense or income.');
  el.replaceChildren(
    h('section', { class: 'card card--hero', 'aria-labelledby': 'net-h' }, h('h2', { id: 'net-h', class: 'card__h' }, 'Net balance'),
      h('p', { class: 'big num' }, fmt(m.net)),
      h('ul', { class: 'accts' }, m.accounts.map(a => h('li', {}, h('span', { 'aria-hidden': 'true' }, a.icon || ''), ` ${a.label} `, h('span', { class: 'num' }, fmt(a.balance)))))),
    h('section', { class: 'card card--row', 'aria-label': 'This month' }, h('div', {}, h('div', { class: 'card__sub' }, 'Income this month'), h('div', { class: 'num money-in' }, fmt(m.month.totalInc, { sign: true }))),
      h('div', {}, h('div', { class: 'card__sub' }, 'Expense this month'), h('div', { class: 'num money-out' }, fmt(-m.month.totalExp, { sign: true })))),
    budget,
    h('section', { 'aria-labelledby': 'td-h' }, h('div', { class: 'sechead' }, h('h2', { id: 'td-h' }, 'Today', m.today.locked && h('span', { class: 'lockico', title: 'Locked', 'aria-label': 'Locked', html: icon('lock', 16) })),
      h('span', { class: 'num sechead__t' }, m.today.exp ? h('span', { class: 'money-out' }, fmt(-m.today.exp, { sign: true })) : '', ' ', m.today.inc ? h('span', { class: 'money-in' }, fmt(m.today.inc, { sign: true })) : '')), list));
}
