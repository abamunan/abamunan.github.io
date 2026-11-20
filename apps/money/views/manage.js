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
  const activeCount = type => repo.settings[type].filter(f => !f.archived).length;
  async function remove(type, f) {
    if (activeCount(type) <= 1 && !f.archived) return toast(type === 'expense' ? 'At least one expense category is required' : 'At least one income source is required', { error: true });
    const u = repo.categoryUsage(f.id), kind = NAME[type][1];
    if (u.days) return toast(`"${f.label}" has data on ${u.days} day${u.days > 1 ? 's' : ''}. Archive it instead of deleting it.`, { error: true });
    if (!await confirmDialog({ title: `Delete ${f.label}?`, message: `"${f.label}" has no saved amounts, so nothing in your totals changes.`, confirmLabel: `Delete ${kind}`, danger: true })) return;
    guard(() => { repo.deleteCategory(type, f.id); done(`${kind[0].toUpperCase()}${kind.slice(1)} deleted`); });
  }
  const archive = (type, f, on) => guard(() => { repo.updateCategory(type, f.id, { archived: on }); done(on ? `"${f.label}" archived. It still counts everywhere, it is only hidden from the Add screen` : `"${f.label}" is active again`); });
  const row = (type, f, i, n) => {
    const used = repo.categoryUsage(f.id).days > 0;
    return h('div', { class: 'crow' }, h('button', { type: 'button', class: 'mrow', onclick: () => edit(type, f), 'aria-label': `Edit ${f.label}` },
        h('span', { class: 'mrow__m' }, label(f)), h('span', { class: 'card__sub' }, [f.archived ? 'Archived' : f.pinned ? 'Pinned' : 'Only when used', f.defaultAcct ? 'default account' : null].filter(Boolean).join(' · '))),
      h('div', { class: 'row-actions' }, ghost('↑', () => guard(() => { repo.moveCategory(type, f.id, -1); done(); }), `Move ${f.label} up`, i === 0), ghost('↓', () => guard(() => { repo.moveCategory(type, f.id, 1); done(); }), `Move ${f.label} down`, i === n - 1),
        f.archived ? ghost('Unarchive', () => archive(type, f, false), `Unarchive ${f.label}`) : null,
        used && !f.archived ? ghost('Archive', () => archive(type, f, true), `Archive ${f.label}`) : null,
        !used ? ghost('Delete', () => remove(type, f), `Delete ${f.label}`) : null));
  };
  // Data under ids that an older version deleted. Restoring brings them back (archived) so totals, reports and CSV agree again.
  const lostBlock = () => {
    const lost = repo.orphanCategories(); if (!lost.length) return null;
    const restore = o => formSheet({ title: 'Restore deleted category', submit: 'Restore', fields: [
      { name: 'label', label: 'Name', kind: 'text', value: o.id.replace(/^c_?/, '').replace(/[_-]+/g, ' ').trim() || o.id, max: 30, autofocus: true },
      { name: 'type', label: 'Was it an expense or income?', kind: 'chips', value: 'expense', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] }],
      onSubmit: v => { repo.restoreCategory(v.type, o.id, v.label); done('Restored as an archived category'); } });
    return h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'Data from deleted categories'),
      h('p', { class: 'card__sub' }, 'These amounts are saved but a deleted category hides them from totals, reports and Insights. Restore one to count it again.'),
      ...lost.map(o => h('div', { class: 'crow' }, h('div', { class: 'mrow' }, h('span', { class: 'mrow__m' }, o.id), h('span', { class: 'card__sub' }, `${o.days} day${o.days > 1 ? 's' : ''} · ${fmt(o.total)}`)), h('div', { class: 'row-actions' }, ghost('Restore', () => restore(o), `Restore ${o.id}`)))));
  };
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
  function paint() { sh.body.replaceChildren(h('div', { class: 'form' }, block('expense'), block('income'), lostBlock(), tmplBlock(), h('p', { class: 'card__sub' }, 'Tap a row to rename it or change its icon. A category that has saved amounts cannot be deleted: archive it and it stays in your totals but leaves the Add screen. Budgets and accounts are on the Plan tab.'))); }
  paint(); return sh;
}
