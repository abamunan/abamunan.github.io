import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { openSheet } from '../../shared/sheet.js';
import { fmt } from '../../shared/fmt.js';
import { formSheet } from '../components/form-sheet.js';

const NAME = { expense: ['Expense categories', 'category'], income: ['Income sources', 'source'] };
const label = f => `${f.icon || ''} ${f.label}`.trim();
const ghost = (text, onclick, aria, disabled) => h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick, 'aria-label': aria || null, disabled: disabled || null }, text);

// One sheet that manages both lists. Every change saves at once; the list repaints in place.
export function openManageSheet(app) {
  const { repo } = app, sh = openSheet({ title: 'Categories & sources', content: null, full: true });
  const accountOpts = () => [{ value: '', label: 'Last used' }, ...repo.settings.accounts.map(a => ({ value: a.id, label: label(a) }))];
  const done = msg => { app.refresh(); paint(); if (msg) toast(msg); };
  const guard = fn => { try { fn(); } catch (e) { toast(e.message, { error: true }); } };

  const edit = (type, f) => formSheet({ title: `Edit ${NAME[type][1]}`, submit: 'Save', fields: [
    { name: 'icon', label: 'Icon', kind: 'text', value: f.icon, max: 4 }, { name: 'label', label: 'Name', kind: 'text', value: f.label, max: 30, autofocus: true },
    { name: 'pinned', label: 'Show on every day\u2019s Add screen first', kind: 'chips', value: f.pinned ? 'y' : 'n', options: [{ value: 'y', label: 'Pinned' }, { value: 'n', label: 'Only when used' }] },
    { name: 'acct', label: 'Default account', kind: 'chips', value: f.defaultAcct || '', options: accountOpts() }],
    onSubmit: v => { repo.updateCategory(type, f.id, { icon: v.icon, label: v.label, pinned: v.pinned === 'y', defaultAcct: v.acct }); done('Saved'); } });
  const add = type => formSheet({ title: `New ${NAME[type][1]}`, submit: 'Add', fields: [
    { name: 'icon', label: 'Icon (optional)', kind: 'text', placeholder: '\u{1F516}', max: 4 }, { name: 'label', label: 'Name', kind: 'text', max: 30, autofocus: true }],
    onSubmit: v => { repo.addCategory(type, { label: v.label, icon: v.icon }); done(`${NAME[type][1][0].toUpperCase()}${NAME[type][1].slice(1)} added`); } });
  async function remove(type, f) {
    if (repo.settings[type].length <= 1) return toast(type === 'expense' ? 'At least one expense category is required' : 'At least one income source is required', { error: true });
    const u = repo.categoryUsage(f.id), kind = NAME[type][1];
    const msg = u.days ? `${u.days} day${u.days > 1 ? 's have' : ' has'} saved amounts under "${f.label}" (${fmt(u.total)} in total). That data stays stored, but it stops counting in totals, History and Insights. Adding a new ${kind} with the same name does not bring it back.` : `"${f.label}" has no saved amounts, so nothing in your history changes.`;
    if (!await confirmDialog({ title: `Delete ${f.label}?`, message: msg, confirmLabel: `Delete ${kind}`, danger: true })) return;
    guard(() => { repo.deleteCategory(type, f.id); done(`${kind[0].toUpperCase()}${kind.slice(1)} deleted`); });
  }
  const row = (type, f, i, n) => h('div', { class: 'crow' }, h('button', { type: 'button', class: 'mrow', onclick: () => edit(type, f), 'aria-label': `Edit ${f.label}` },
      h('span', { class: 'mrow__m' }, label(f)), h('span', { class: 'card__sub' }, [f.pinned ? 'Pinned' : 'Only when used', f.defaultAcct ? 'default account' : null].filter(Boolean).join(' \u00B7 '))),
    h('div', { class: 'row-actions' }, ghost('\u2191', () => guard(() => { repo.moveCategory(type, f.id, -1); done(); }), `Move ${f.label} up`, i === 0), ghost('\u2193', () => guard(() => { repo.moveCategory(type, f.id, 1); done(); }), `Move ${f.label} down`, i === n - 1),
      ghost('Delete', () => remove(type, f), `Delete ${f.label}`)));
  const tmplBlock = () => {
    const list = repo.listTemplates ? repo.listTemplates() : [];
    const rows = list.map(t => {
      const catObj = [...repo.settings.expense, ...repo.settings.income].find(x => x.id === t.cat);
      const sub = [catObj ? `${catObj.icon || ''} ${catObj.label}` : '', t.amt ? fmt(t.amt) : '', t.note].filter(Boolean).join(' \u00B7 ');
      return h('div', { class: 'crow' },
        h('div', { class: 'mrow' },
          h('span', { class: 'mrow__m' }, `⚡ ${t.label}`),
          h('span', { class: 'card__sub' }, sub)
        ),
        h('div', { class: 'row-actions' },
          ghost('Delete', async () => {
            if (!await confirmDialog({ title: `Delete "${t.label}"?`, message: 'This shortcut will be removed.', confirmLabel: 'Delete template', danger: true })) return;
            repo.removeTemplate(t.id);
            done('Template removed');
          }, `Delete ${t.label}`)
        )
      );
    });
    return h('section', { class: 'card' },
      h('h2', { class: 'card__h' }, 'Quick templates'),
      rows.length ? rows : h('p', { class: 'card__sub' }, 'No templates saved yet. While logging an entry, tap "⭐ Template" to create a 1-tap shortcut.')
    );
  };

  const block = type => { const list = repo.settings[type]; return h('section', { class: 'card' }, h('h2', { class: 'card__h' }, NAME[type][0]), ...list.map((f, i) => row(type, f, i, list.length)), ghost(`Add ${NAME[type][1]}`, () => add(type))); };
  function paint() { sh.body.replaceChildren(h('div', { class: 'form' }, block('expense'), block('income'), tmplBlock(), h('p', { class: 'card__sub' }, 'Tap a row to rename it or change its icon. Budgets and accounts are on the Plan tab. Deleting never removes saved days.'))); }
  paint(); return sh;
}
