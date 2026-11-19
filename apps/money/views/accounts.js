import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
import { toast } from '../../shared/toast.js';
import { openSheet } from '../../shared/sheet.js';
import { formSheet } from '../components/form-sheet.js';
import { accountModel } from '../domain/viewmodels.js';
import { entryRow } from '../components/entry-row.js';
import { openAddSheet } from '../components/add-sheet.js';
import { deleteWithUndo } from '../components/entry-actions.js';

const dateLabel = (y, m0, d) => new Date(y, m0, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const acctOptions = (accounts, skip) => accounts.filter(a => a.id !== skip).map(a => ({ value: a.id, label: `${a.icon || ''} ${a.label}`.trim() }));
const btn = (label, onclick, cls = 'ui-btn ui-btn--ghost') => h('button', { type: 'button', class: cls, onclick }, label);

function accountSheet(a, m, app) {
  const { repo } = app, others = m.accounts.filter(x => x.id !== a.id && !x.archived), sh = openSheet({ title: `${a.icon || ''} ${a.label}`.trim(), content: null });
  const then = fn => () => { sh.close(); fn(); };
  const addMoney = () => formSheet({ title: `Add money to ${a.label}`, submit: 'Add', fields: [{ name: 'amt', label: 'Amount (৳)', kind: 'amount', placeholder: '0', autofocus: true }],
    onSubmit: v => { repo.addBalance(a.id, v.amt); app.refresh(); toast('Balance added'); } });
  const transfer = () => formSheet({ title: `Transfer from ${a.label}`, submit: 'Send', fields: [{ name: 'to', label: 'To', kind: 'chips', value: others[0]?.id, options: acctOptions(others, a.id) }, { name: 'amt', label: 'Amount (৳)', kind: 'amount', placeholder: '0', autofocus: true }],
    onSubmit: v => { repo.addTransfer(a.id, v.to, v.amt); app.refresh(); toast('Transferred'); } });
  const editAcct = () => formSheet({ title: 'Edit account', fields: [{ name: 'icon', label: 'Icon', kind: 'text', value: a.icon, max: 4 }, { name: 'label', label: 'Name', kind: 'text', value: a.label, max: 30, autofocus: true },
    { name: 'opening', label: 'Opening balance (৳). Entries and transfers add to this.', kind: 'amount', value: a.opening || '', placeholder: '0' }],
    onSubmit: v => { if (Number.isNaN(v.opening)) throw new Error('Opening balance must be a number'); repo.updateAccount(a.id, { icon: v.icon, label: v.label, opening: v.opening ?? 0 }); app.refresh(); toast('Account updated'); } });
  const del = () => {
    if (m.accounts.length <= 1) return toast('At least one account is required', { error: true });
    const debts = repo.settings.debts.filter(d => d.accountId === a.id).length;
    const dest = others.find(x => x.id === repo.defaultAcct()) || others[0];
    formSheet({ title: `Delete ${a.label}?`, submit: 'Move history & delete account', fields: [{ name: 'to', label: `Nothing is lost: its entries, transfers${debts ? ', debts' : ''} and balance move to the account you pick, so your total stays the same.`, kind: 'chips', value: dest.id, options: acctOptions(m.accounts, a.id) }],
      onSubmit: async v => { const r = await repo.deleteAccount(a.id, v.to); app.refresh(); toast(`Account deleted. ${r.entries} entr${r.entries === 1 ? 'y' : 'ies'} moved to ${m.accounts.find(x => x.id === v.to)?.label}${r.dropped ? `; ${r.dropped} self-transfer${r.dropped === 1 ? '' : 's'} dropped` : ''}`); } });
  };
  const archive = () => { try { repo.setAccountArchived(a.id, !a.archived); app.refresh(); toast(a.archived ? 'Account unarchived' : 'Account archived'); } catch (e) { toast(e.message, { error: true }); } };
  sh.body.replaceChildren(h('div', { class: 'form' }, h('p', { class: 'big num' }, fmt(a.balance)), h('div', { class: 'row-actions' },
      !a.archived && btn('Add money', then(addMoney), 'ui-btn ui-btn--primary'), !a.archived && others.length ? btn('Transfer', then(transfer)) : null, btn('Edit', then(editAcct)), btn(a.archived ? 'Unarchive' : 'Archive', then(archive)), btn('Delete', then(del), 'ui-btn ui-btn--ghost add-del'))));
}

function accountsCard(m, app) {
  const add = () => formSheet({ title: 'New account', submit: 'Add account', fields: [{ name: 'icon', label: 'Icon (optional)', kind: 'text', placeholder: '\u{1F4B0}', max: 4 }, { name: 'label', label: 'Name', kind: 'text', placeholder: 'e.g. Bank', max: 30, autofocus: true }],
    onSubmit: v => { app.repo.addAccount({ label: v.label, icon: v.icon }); app.refresh(); toast('Account added'); } });
  return h('section', { class: 'card account-management' }, h('h2', { class: 'card__h' }, 'Manage accounts'),
    ...m.accounts.map(a => h('button', { type: 'button', class: 'mrow', onclick: () => accountSheet(a, m, app), 'aria-label': `${a.label}, balance ${fmt(a.balance)}. Open actions.` },
      h('span', { class: 'mrow__m' }, `${a.icon || ''} ${a.label}${a.archived ? ' (archived)' : ''}`.trim()), h('span', { class: 'num' + (a.balance < 0 ? ' money-out' : '') }, fmt(a.balance)))),
    h('div', { class: 'mrow mrow--total' }, h('span', { class: 'mrow__m' }, 'Total balance'), h('span', { class: 'num' + (m.total < 0 ? ' money-out' : '') }, fmt(m.total))),
    h('p', { class: 'card__sub' }, 'Tap an account to add money, transfer, edit or delete.'), btn('Add account', add));
}

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

  // Add money, transfers and unsettled debts change the balance but are not day entries: shown read-only so the history explains the balance.
  const moveRow = r => h('div', { class: 'erow erow--static', role: 'group', 'aria-label': `${r.label}, ${r.kind === 'in' ? 'money in' : 'money out'} ${fmt(r.amt)}${r.note ? ', ' + r.note : ''}` },
    h('span', { class: 'erow__icon', 'aria-hidden': 'true' }, r.icon), h('span', { class: 'erow__main' }, h('span', { class: 'erow__label' }, r.label), r.note && h('span', { class: 'erow__sub' }, r.note)),
    h('span', { class: 'erow__amt num ' + (r.kind === 'in' ? 'money-in' : 'money-out') }, fmt(r.signed, { sign: true })));
  const list = model.rows.length
    ? h('div', { class: 'account-history-list' }, model.rows.map(entry => entry.move ? h('div', { class: 'account-history-item' }, h('div', { class: 'account-history-date' }, dateLabel(entry.y, entry.m0, entry.d)), moveRow(entry)) : h('div', { class: 'account-history-item' },
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
        h('div', {}, h('span', { class: 'stat-label' }, 'Transactions'), h('strong', { class: 'num' }, String(model.rows.length)))
      ),
      model.opening ? h('p', { class: 'card__sub' }, `Opening balance ${fmt(model.opening)} + Money in \u2212 Money out = ${fmt(model.balance)}`) : null
    ),
    accountsCard(model, app),
    h('section', { class: 'card account-history', 'aria-labelledby': 'account-history-title' },
      h('div', { class: 'account-history__top' }, h('h2', { id: 'account-history-title', class: 'card__h' }, 'Transaction history'), sort),
      h('div', { class: 'account-toolbar' }, select),
      list
    )
  );
}
