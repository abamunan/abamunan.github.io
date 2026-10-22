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
  const alerts = m.budgets.filter(x => x.state !== 'ok');
  const overBudgets = m.budgets.filter(x => x.state === 'over');
  const warnBudgets = m.budgets.filter(x => x.state === 'warn');

  let budgetSection;
  if (!b) {
    budgetSection = h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'Budget this month'), h('p', { class: 'card__p' }, 'No budgets set yet. Add them in the Plan tab.'));
  } else {
    const isAlert = alerts.length > 0;
    const alertCardClass = overBudgets.length > 0 ? 'card card--alert' : (warnBudgets.length > 0 ? 'card card--alert-warn' : 'card');
    
    // Banner if there are any over or warning budgets
    const alertBanner = isAlert ? h('div', { class: 'alert-badges' },
      overBudgets.map(x => h('span', { class: 'badge badge--over' }, h('span', { html: icon('warn', 13) }), ` ${x.label} over budget`)),
      warnBudgets.map(x => h('span', { class: 'badge badge--warn' }, h('span', { html: icon('warn', 13) }), ` ${x.label} near limit`))
    ) : null;

    const budgetDetails = m.budgets.map(item => h('div', { class: 'brow' },
      h('div', { class: 'alert-row' },
        h('span', {}, `${item.icon || ''} ${item.label}`),
        h('span', { class: 'num' }, `${fmt(item.used)} / ${fmt(item.budget)} (${Math.round(item.pct)}%)`)
      ),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(item.pct)), 'aria-label': `${item.label} budget used` },
        h('span', { class: 'bar__fill bar__fill--' + item.state, style: `width:${Math.min(100, item.pct)}%` })
      ),
      h('div', { class: 'card__sub' },
        item.state === 'over'
          ? `Over budget by ${fmt(item.used - item.budget)}`
          : `${fmt(item.budget - item.used)} remaining${item.onPace ? '' : ' \u00B7 spending faster than pace'}`
      )
    ));

    const showAll = app.state.showAllBudgets ?? false;
    const toggleBtn = m.budgets.length > 1 ? h('button', {
      type: 'button',
      class: 'bud-expand',
      onclick: () => { app.state.showAllBudgets = !showAll; app.refresh(); }
    }, showAll ? 'Show summary only' : `View all ${m.budgets.length} budgets \u2193`) : null;

    budgetSection = h('section', { class: alertCardClass, 'aria-labelledby': 'bud-h' },
      h('h2', { id: 'bud-h', class: 'card__h' }, 'Budget this month'),
      alertBanner,
      showAll ? h('div', { class: 'elist' }, ...budgetDetails) : h('div', {},
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(b.pct)), 'aria-label': `${b.label} budget used` },
          h('span', { class: 'bar__fill bar__fill--' + b.state, style: `width:${Math.min(100, b.pct)}%` })
        ),
        h('p', { class: 'card__p', style: 'margin-top:6px' },
          b.state !== 'ok' && h('span', { html: icon('warn', 16) }),
          ` ${b.icon || ''} ${b.label}: ${Math.round(b.pct)}% used (${fmt(b.used)} of ${fmt(b.budget)})`,
          b.state === 'over' ? ' \u2014 over budget' : b.state === 'warn' ? ' \u2014 close to the limit' : ''
        ),
        m.budgets.length > 1 && h('p', { class: 'card__sub' }, `${alerts.length} of ${m.budgets.length} budgets need attention`)
      ),
      toggleBtn
    );
  }
  const list = m.today.entries.length
    ? h('div', { class: 'elist' }, m.today.entries.map(e => entryRow(e, { onEdit: () => openAddSheet(app.repo, { entry: { ...e, ...where }, onDone: app.refresh }), onDelete: () => deleteWithUndo(app.repo, { ...e, ...where }, app.refresh) })))
    : h('p', { class: 'empty' }, 'Nothing recorded today. Tap + to add an expense or income.');
  el.replaceChildren(
    h('section', { class: 'card card--hero', 'aria-labelledby': 'net-h' }, h('h2', { id: 'net-h', class: 'card__h' }, 'Net balance'),
      h('p', { class: 'big num' }, fmt(m.net)),
      h('ul', { class: 'accts' }, m.accounts.map(a => h('li', {}, h('span', { 'aria-hidden': 'true' }, a.icon || ''), ` ${a.label} `, h('span', { class: 'num' }, fmt(a.balance)))))),
    h('section', { class: 'card card--row', 'aria-label': 'This month' }, h('div', {}, h('div', { class: 'card__sub' }, 'Income this month'), h('div', { class: 'num money-in' }, fmt(m.month.totalInc, { sign: true }))),
      h('div', {}, h('div', { class: 'card__sub' }, 'Expense this month'), h('div', { class: 'num money-out' }, fmt(-m.month.totalExp, { sign: true })))),
    budgetSection,
    h('section', { 'aria-labelledby': 'td-h' }, h('div', { class: 'sechead' }, h('h2', { id: 'td-h' }, 'Today', m.today.locked && h('span', { class: 'lockico', title: 'Locked', 'aria-label': 'Locked', html: icon('lock', 16) })),
      h('span', { class: 'num sechead__t' }, m.today.exp ? h('span', { class: 'money-out' }, fmt(-m.today.exp, { sign: true })) : '', ' ', m.today.inc ? h('span', { class: 'money-in' }, fmt(m.today.inc, { sign: true })) : '')), list));
}
