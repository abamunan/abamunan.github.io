import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
import { accountModel } from '../domain/viewmodels.js';
import { entryRow } from '../components/entry-row.js';
import { openAddSheet } from '../components/add-sheet.js';
import { deleteWithUndo } from '../components/entry-actions.js';

const dateLabel = (y, m0, d) => new Date(y, m0, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function accountsView(el, app) {
  const st = app.state.accounts ||= { accountId: app.repo.settings.accounts[0]?.id || '', sort: 'newest' };
  const model = accountModel(app.repo, st.accountId, st.sort);
  if (!model.account) return el.replaceChildren(h('p', { class: 'empty' }, 'No accounts yet. Add one from Plan.'));

  const select = h('select', {
    class: 'ui-input account-picker',
    'aria-label': 'Choose account',
    onchange: ev => { st.accountId = ev.target.value; accountsView(el, app); }
  }, model.accounts.map(a => h('option', { value: a.id, selected: a.id === model.account.id }, `${a.icon || ''} ${a.label}`)));
  const sort = h('select', {
    class: 'ui-input account-sort',
    'aria-label': 'Sort account history',
    onchange: ev => { st.sort = ev.target.value; accountsView(el, app); }
  }, [
    ['newest', 'Newest first'], ['oldest', 'Oldest first'],
    ['amount-high', 'Amount: high to low'], ['amount-low', 'Amount: low to high']
  ].map(([value, label]) => h('option', { value, selected: st.sort === value }, label)));

  const list = model.entries.length
    ? h('div', { class: 'account-history-list' }, model.entries.map(entry => h('div', { class: 'account-history-item' },
      h('div', { class: 'account-history-date' }, dateLabel(entry.y, entry.m0, entry.d)),
      entryRow(entry, {
        onEdit: () => openAddSheet(app.repo, { entry: { ...entry, locked: entry.locked }, date: new Date(entry.y, entry.m0, entry.d), onDone: app.refresh }),
        onDelete: () => deleteWithUndo(app.repo, { ...entry, locked: entry.locked, y: entry.y, m0: entry.m0, d: entry.d }, app.refresh)
      })
    ))) : h('p', { class: 'empty' }, `No transactions recorded in ${model.account.label}.`);

  el.replaceChildren(
    h('div', { class: 'view-heading' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Accounts'), h('h2', {}, 'Where your money lives'),
        h('p', { class: 'view-heading__sub' }, 'Review every transaction by account.')),
      h('span', { class: 'account-heading-icon', 'aria-hidden': 'true' }, model.account.icon || '◉')
    ),
    h('section', { class: 'card account-summary', 'aria-label': `${model.account.label} summary` },
      h('div', { class: 'account-summary__head' }, h('div', { class: 'account-name' }, model.account.icon || '◉', ' ', model.account.label), h('div', { class: 'account-balance num' }, fmt(model.balance))),
      h('div', { class: 'account-summary__stats' },
        h('div', {}, h('span', { class: 'stat-label' }, 'Money in'), h('strong', { class: 'num money-in' }, fmt(model.income, { sign: true }))),
        h('div', {}, h('span', { class: 'stat-label' }, 'Money out'), h('strong', { class: 'num money-out' }, fmt(-model.expense, { sign: true }))),
        h('div', {}, h('span', { class: 'stat-label' }, 'Transactions'), h('strong', { class: 'num' }, String(model.entries.length)))
      )
    ),
    h('section', { class: 'card account-history', 'aria-labelledby': 'account-history-title' },
      h('div', { class: 'account-history__top' }, h('h2', { id: 'account-history-title', class: 'card__h' }, 'Transaction history'), sort),
      h('div', { class: 'account-toolbar' }, select),
      list
    )
  );
}
