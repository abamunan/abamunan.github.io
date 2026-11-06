import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
import { toast } from '../../shared/toast.js';
import { formSheet } from '../components/form-sheet.js';
import { planModel } from '../domain/viewmodels.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const today = () => new Date().toISOString().slice(0, 10);
let debtTab = 'borrowed';                                   // remembered while the app is open

const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', { class: 'card__h' }, title), ...kids);
const btn = (label, onclick, cls = 'ui-btn ui-btn--ghost') => h('button', { type: 'button', class: cls, onclick }, label);

// ── Savings goal ──
function goalCard(m, app) {
  const g = m.goal, edit = () => formSheet({ title: 'Savings goal', submit: 'Save goal', fields: [{ name: 'goal', label: 'Monthly target (৳). 0 removes the goal.', kind: 'amount', value: g.target || '', placeholder: '0', autofocus: true }],
    onSubmit: v => { if (v.goal == null || !(v.goal >= 0)) throw new Error('Enter an amount of 0 or more'); app.repo.setGoal(v.goal); app.refresh(); toast(v.goal ? 'Goal saved' : 'Goal removed'); } });
  if (!g.hasGoal) return card('Savings goal', h('p', { class: 'card__p' }, 'No savings goal yet. Set a monthly target to see if your budgets leave enough.'), btn('Set a goal', edit));
  return card(`Savings goal \u2014 ${MONTHS[m.m0]}`,
    h('p', { class: 'big num' + (g.saved < 0 ? ' money-out' : '') }, fmt(g.saved)), h('p', { class: 'card__sub' }, `projected for this month, of ${fmt(g.target)} target`),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(g.pct)), 'aria-label': 'Savings goal reached' }, h('span', { class: 'bar__fill', style: `width:${g.pct}%` })),
    h('p', { class: 'card__p' }, `${Math.round(g.pct)}% reached`), h('p', { class: 'card__sub' }, 'Projected from how your spending compares with your budgets so far. It needs budgets to work.'), btn('Edit goal', edit));
}

// ── Budgets ──
function budgetsCard(m, app) {
  const edit = () => formSheet({ title: 'Monthly budgets', full: true, submit: 'Save budgets',
    fields: m.expenseCats.map(f => ({ name: f.id, label: `${f.icon || ''} ${f.label}`.trim(), kind: 'amount', value: f.budget || '', placeholder: 'No budget' })),
    onSubmit: v => { const changes = {}; for (const f of m.expenseCats) { const n = v[f.id] ?? 0; if (!(n >= 0)) throw new Error(`${f.label}: enter a number of 0 or more`); if ((f.budget || 0) !== n) changes[f.id] = n; } 
      if (!Object.keys(changes).length) return; app.repo.setBudgets(changes); app.refresh(); toast('Budgets saved'); } });
  const rows = m.budgets.map(b => {
    const left = b.budget - b.used, note = b.state === 'over' ? `Over by ${fmt(-left)}` : `${fmt(left)} left${b.onPace ? '' : ' \u00B7 spending faster than the month so far'}`;
    return h('div', { class: 'brow' }, h('div', { class: 'brow__top' }, h('span', {}, `${b.icon || ''} ${b.label}`), h('span', { class: 'num' }, `${fmt(b.used)} / ${fmt(b.budget)}`)),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(b.pct)), 'aria-label': `${b.label} budget used` }, h('span', { class: 'bar__fill bar__fill--' + b.state, style: `width:${b.pct}%` })),
      h('div', { class: 'card__sub' }, note));
  });
  return card(`Budgets \u2014 ${MONTHS[m.m0]}`, m.budgets.length ? h('p', { class: 'card__sub' }, `${fmt(m.budgetUsed)} spent of ${fmt(m.budgetTotal)} budgeted`) : h('p', { class: 'card__p' }, 'No budgets yet. Give a category a monthly limit to track it here and on Today.'),
    ...rows, btn(m.budgets.length ? 'Edit budgets' : 'Set budgets', edit));
}

// ── Debts ──
function debtRow(d, app) {
  const borrowed = d.type === 'borrowed', sub = [d.date && new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), d.acctLabel && `${d.acctIcon || ''} ${d.acctLabel}`.trim(), d.note].filter(Boolean).join(' \u00B7 ');
  const toggle = () => { try { app.repo.setDebtSettled(d.id, !d.settled); app.refresh(); } catch (e) { toast(e.message, { error: true }); } };
  const del = async () => { if (!await confirmDialog({ title: 'Delete this entry?', message: `${d.person} \u00B7 ${fmt(d.amount)}`, confirmLabel: 'Delete', danger: true })) return; try { app.repo.removeDebt(d.id); app.refresh(); toast('Deleted'); } catch (e) { toast(e.message, { error: true }); } };
  return h('div', { class: 'drow' + (d.settled ? ' drow--done' : '') }, h('div', { class: 'drow__top' }, h('span', { class: 'drow__who' }, d.person), h('span', { class: 'num' }, fmt(d.amount))), sub && h('div', { class: 'card__sub' }, sub),
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'chip', 'aria-pressed': String(d.settled), onclick: toggle }, d.settled ? (borrowed ? '\u2713 Repaid' : '\u2713 Received') : (borrowed ? 'Mark repaid' : 'Mark received')), btn('Delete', del)));
}
function debtsCard(m, app) {
  const D = m.debts, accts = m.accounts;
  const add = () => formSheet({ title: 'Add debt or loan', submit: 'Add', fields: [
    { name: 'type', label: 'Type', kind: 'chips', value: debtTab, options: [{ value: 'borrowed', label: 'I borrowed (I owe)' }, { value: 'lent', label: 'I lent (they owe me)' }] },
    { name: 'person', label: 'Person', kind: 'text', max: 40, placeholder: 'Name', autofocus: true }, { name: 'amount', label: 'Amount (৳)', kind: 'amount', placeholder: '0' },
    { name: 'accountId', label: 'Account', kind: 'chips', value: accts[0]?.id, options: acctOptions(accts) }, { name: 'date', label: 'Date', kind: 'date', value: today() }, { name: 'note', label: 'Note (optional)', kind: 'text', max: 120 }],
    onSubmit: v => { app.repo.addDebt({ type: v.type, person: v.person, amount: v.amount, accountId: v.accountId, date: v.date, note: v.note }); debtTab = v.type; app.refresh(); toast(v.type === 'borrowed' ? 'Added \u2014 you owe this' : 'Added \u2014 they owe you'); } });
  const list = D[debtTab];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Debt type' }, [['borrowed', `I owe (${D.borrowed.length})`], ['lent', `Owed to me (${D.lent.length})`]].map(([k, l]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(debtTab === k), onclick: () => { debtTab = k; app.refresh(); } }, l)));
  return card('Debts & loans', h('div', { class: 'card--row card__sums' }, h('div', {}, h('div', { class: 'card__sub' }, 'You owe'), h('div', { class: 'num money-out' }, fmt(D.owe))), h('div', {}, h('div', { class: 'card__sub' }, "You'll receive"), h('div', { class: 'num money-in' }, fmt(D.receive)))),
    seg, list.length ? h('div', { class: 'elist' }, list.map(d => debtRow(d, app))) : h('p', { class: 'empty' }, debtTab === 'borrowed' ? 'Nothing borrowed.' : 'Nothing lent.'), btn('Add debt or loan', add));
}

export function planView(el, app) {
  const m = planModel(app.repo, new Date());
  el.replaceChildren(goalCard(m, app), budgetsCard(m, app), debtsCard(m, app));
}
