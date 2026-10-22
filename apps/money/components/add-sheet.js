import { h } from '../../shared/dom.js';
import { openSheet } from '../../shared/sheet.js';
import { confirmDialog } from '../../shared/confirm.js';
import { toast } from '../../shared/toast.js';
import { fmt } from '../../shared/fmt.js';
import { evalExpr, hasOperator } from '../domain/expr.js';
import { LockedError } from '../../shared/lock.js';
import { confirmUnlock, deleteWithUndo } from './entry-actions.js';
import { searchTagsModel } from '../domain/viewmodels.js';

const pad = n => String(n).padStart(2, '0');
const toInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const KEYS = [['C', '7', '8', '\u232B'], ['4', '5', '6', '\u00F7'], ['1', '2', '3', '\u00D7'], ['0', '.', '+', '\u2212']];
const KEY_LABEL = { '\u232B': 'Backspace', '\u00F7': 'Divide', '\u00D7': 'Multiply', '\u2212': 'Minus', '+': 'Plus', '=': 'Calculate' };

// openAddSheet(repo, {date, kind, entry, onDone}). entry (edit mode) = {id,cat,amt,acct,note,adj,y,m0,d,locked}
export function openAddSheet(repo, { date = new Date(), kind = 'out', entry = null, onDone } = {}) {
  const S = { kind: entry ? (repo.settings.income.some(f => f.id === entry.cat) ? 'in' : 'out') : kind, cat: entry?.cat, acct: entry?.acct, acctTouched: !!entry,
    date: entry ? new Date(entry.y, entry.m0, entry.d) : new Date(date), unlocked: false, note: entry?.note || '' };
  const list = () => { const l = S.kind === 'out' ? repo.settings.expense : repo.settings.income; return [...l.filter(f => f.pinned), ...l.filter(f => !f.pinned)]; };
  if (!S.cat || !list().some(f => f.id === S.cat)) S.cat = list()[0]?.id;
  if (!S.acct) S.acct = repo.resolveAccount(S.cat);

  const amount = h('input', { class: 'ui-input add-amount num', type: 'text', inputmode: 'none', autocomplete: 'off', 'aria-label': 'Amount in taka', placeholder: '0', 'data-autofocus': true, value: entry ? String(entry.amt) : '' });
  const preview = h('div', { class: 'add-preview num', 'aria-live': 'polite' });
  const saveBtn = h('button', { type: 'button', class: 'ui-btn ui-btn--primary add-save' }, 'Save');
  const chips = h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': 'Category' }), accts = h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': 'Account' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Type' });
  const banner = h('div', { class: 'add-lock', hidden: true });

  const sign = () => S.kind === 'in' ? '+' : '\u2212';
  function paintAmount() {
    const v = evalExpr(amount.value), calc = hasOperator(amount.value) && v != null;
    preview.textContent = calc ? `= ${fmt(v)}` : ''; saveBtn.textContent = v ? `Save ${sign()} ${fmt(v)}` : 'Save';
  }
  function paint() {
    seg.replaceChildren(...[['out', 'Expense'], ['in', 'Income']].map(([k, l]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(S.kind === k), onclick: () => { if (S.kind === k) return; S.kind = k; S.cat = list()[0].id; if (!S.acctTouched) S.acct = repo.resolveAccount(S.cat); paint(); } }, l)));
    chips.replaceChildren(...list().map(f => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.cat === f.id), onclick: () => { S.cat = f.id; if (!S.acctTouched) S.acct = repo.resolveAccount(S.cat); paint(); } }, h('span', { 'aria-hidden': 'true' }, f.icon || ''), ' ' + f.label)));
    accts.replaceChildren(...repo.settings.accounts.map(a => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.acct === a.id), onclick: () => { S.acct = a.id; S.acctTouched = true; paint(); } }, h('span', { 'aria-hidden': 'true' }, a.icon || ''), ' ' + a.label)));
    paintAmount();
  }
  amount.addEventListener('input', paintAmount);
  amount.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });   // save() evaluates the expression
  const press = k => { if (k === 'C') amount.value = ''; else if (k === '\u232B') amount.value = amount.value.slice(0, -1); else amount.value += k; paintAmount(); };
  const pad_ = h('div', { class: 'keypad' }, KEYS.flat().map(k => h('button', { type: 'button', class: 'key' + ('+\u2212\u00D7\u00F7='.includes(k) || k === '\u232B' ? ' key--op' : ''), 'aria-label': KEY_LABEL[k] || k, onclick: () => press(k) }, k)));
  const dateIn = h('input', { class: 'ui-input', type: 'date', 'aria-label': 'Date', value: toInput(S.date), onchange: ev => { const [y, m, d] = ev.target.value.split('-').map(Number); if (y) S.date = new Date(y, m - 1, d); } });
  const noteIn = h('input', { class: 'ui-input', type: 'text', maxlength: '200', 'aria-label': 'Note (optional)', placeholder: 'e.g. Biryani #lunch', value: S.note, oninput: ev => { S.note = ev.target.value; } });
  
  const existingTags = searchTagsModel(repo);
  const tagChips = existingTags.length ? h('div', { class: 'chips chips--scroll', style: 'margin-top:4px', role: 'group', 'aria-label': 'Quick tags' },
    existingTags.slice(0, 10).map(tag => h('button', {
      type: 'button',
      class: 'chip',
      onclick: () => {
        if (!S.note.includes(tag)) {
          S.note = (S.note ? `${S.note} ${tag}` : tag).trim();
          noteIn.value = S.note;
          paintSum();
        }
      }
    }, tag))
  ) : null;

  if (entry?.locked) { banner.hidden = false; banner.append(h('span', {}, 'This day is locked.'), h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: async () => { if (await confirmUnlock()) { S.unlocked = true; banner.hidden = true; } } }, 'Unlock to edit')); }

  const label = (t, node) => h('div', { class: 'add-field' }, h('div', { class: 'add-label' }, t), node);
  const sum = h('summary', { class: 'add-sum' });
  const noteWrapper = h('div', {}, noteIn, tagChips);
  const more = h('details', { class: 'add-more' }, sum, h('div', { class: 'add-two' }, label('Date', dateIn), label('Note & Tags', noteWrapper)));
  const paintSum = () => { const t = new Date(), same = S.date.toDateString() === t.toDateString(); sum.textContent = (same ? 'Today' : S.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })) + (S.note ? ' \u00B7 note added' : ' \u00B7 change date or add a note'); };
  dateIn.addEventListener('change', paintSum); noteIn.addEventListener('input', paintSum); paintSum();
  let sheet;
  const fail = e => toast(e?.message || 'Could not save', { error: true });
  async function save() {
    const amt = evalExpr(amount.value);
    if (amt == null || amt === 0 || (amt < 0 && !entry?.adj)) { toast('Enter an amount greater than 0', { error: true }); amount.focus(); return; }
    const y = S.date.getFullYear(), m0 = S.date.getMonth(), d = S.date.getDate(), body = { cat: S.cat, amt, acct: S.acct, note: S.note };
    const same = entry && entry.y === y && entry.m0 === m0 && entry.d === d;
    const run = async unlocked => entry ? (same ? repo.updateEntry(y, m0, d, entry.id, body, { unlocked }) : repo.moveEntry([entry.y, entry.m0, entry.d], [y, m0, d], entry.id, body, { unlocked })) : repo.addEntry(y, m0, d, body, { unlocked });
    let res;
    try { res = await run(S.unlocked); }
    catch (e) { if (e instanceof LockedError) { if (!(await confirmUnlock())) return; S.unlocked = true; try { res = await run(true); } catch (e2) { return fail(e2); } } else return fail(e); }
    sheet.close(true); onDone?.();
    if (!entry && res?.entry) toast('Entry added', { action: 'Undo', onAction: async () => { try { await repo.deleteEntry(y, m0, d, res.entry.id, { unlocked: true }); onDone?.(); } catch (x) { fail(x); } } });
    else toast('Saved');
  }
  // Templates row (Quick templates)
  const tmplList = repo.listTemplates ? repo.listTemplates() : [];
  const tmplChips = !entry && tmplList.length ? h('div', { class: 'chips chips--scroll', style: 'padding:2px 0 6px', role: 'group', 'aria-label': 'Quick templates' },
    tmplList.map(t => h('button', {
      type: 'button',
      class: 'chip',
      onclick: () => {
        S.kind = repo.settings.income.some(f => f.id === t.cat) ? 'in' : 'out';
        S.cat = t.cat;
        if (t.acct) { S.acct = t.acct; S.acctTouched = true; }
        if (t.amt) amount.value = String(t.amt);
        if (t.note) S.note = t.note;
        paint();
        paintSum();
        toast(`Loaded "${t.label}"`);
      }
    }, `⚡ ${t.label}`))
  ) : null;

  async function saveAsTemplate() {
    const amt = evalExpr(amount.value) || 0;
    const catObj = [...repo.settings.expense, ...repo.settings.income].find(x => x.id === S.cat);
    const defaultName = S.note ? S.note.split(' ')[0] : (catObj?.label || 'Template');
    const name = window.prompt('Name this template:', defaultName);
    if (!name || !name.trim()) return;
    try {
      repo.addTemplate({ label: name.trim(), cat: S.cat, amt, acct: S.acct, note: S.note });
      toast('Template saved!');
      paint();
    } catch (e) {
      toast(e.message, { error: true });
    }
  }

  saveBtn.addEventListener('click', save);
  const saveTmplBtn = !entry ? h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', title: 'Save current entry as a template shortcut', onclick: saveAsTemplate }, '⭐ Template') : null;
  const actions = h('div', { class: 'add-actions' }, entry && h('button', { type: 'button', class: 'ui-btn ui-btn--ghost add-del', onclick: async () => { if (await deleteWithUndo(repo, entry, onDone)) sheet.close(false); } }, 'Delete'), saveTmplBtn, saveBtn);
  const amountBlock = h('div', { class: 'add-amount-block' }, h('div', { class: 'add-amount-head' }, h('div', { class: 'add-label' }, 'Amount'), h('span', { class: 'add-amount-hint' }, 'Use the keypad or type a calculation')), h('div', { class: 'add-amtwrap' }, amount, preview));
  const body = h('div', { class: 'add' }, banner, h('div', { class: 'add-top' }, seg, tmplChips, amountBlock), label('Category', chips), label('Account', accts), more, pad_, actions);
  sheet = openSheet({ title: entry ? 'Edit entry' : 'Add entry', content: body });
  paint(); return sheet;
}
