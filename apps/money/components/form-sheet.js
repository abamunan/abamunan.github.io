import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { openSheet } from '../../shared/sheet.js';
import { evalExpr } from '../domain/expr.js';

// Small form helper. fields: {name, label, kind:'text'|'amount'|'date'|'chips', value, options:[{value,label}], placeholder, max}
// onSubmit(values) may throw an Error: its message is shown and the sheet stays open. Amount fields accept "100+50".
export function formSheet({ title, fields, submit = 'Save', onSubmit, full = false }) {
  const vals = {}, inputs = {};
  const repaint = [];
  const nodes = fields.map(f => {
    vals[f.name] = f.value ?? '';
    let control;
    if (f.kind === 'chips') {
      control = h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': f.label });
      const paint = () => control.replaceChildren(...f.options.map(o => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(vals[f.name] === o.value), onclick: () => { vals[f.name] = o.value; paint(); } }, o.label)));
      paint();
    } else {
      control = inputs[f.name] = h('input', { class: 'ui-input' + (f.kind === 'amount' ? ' num' : ''), type: f.kind === 'date' ? 'date' : 'text', inputmode: f.kind === 'amount' ? 'decimal' : null, autocomplete: 'off',
        maxlength: f.max || null, placeholder: f.placeholder || '', value: String(vals[f.name]), 'aria-label': f.label, 'data-autofocus': f.autofocus ? true : null });
      control.addEventListener('input', () => { vals[f.name] = control.value; });
    }
    return h('div', { class: 'add-field' }, h('div', { class: 'add-label' }, f.label), control);
  });
  const btn = h('button', { type: 'button', class: 'ui-btn ui-btn--primary add-save' }, submit);
  const body = h('div', { class: 'form' }, ...nodes, h('div', { class: 'add-actions form__actions' }, btn));
  const sheet = openSheet({ title, content: body, full });
  const num = t => (String(t).trim() === '' ? null : (evalExpr(t) ?? NaN));          // blank → null, not a number → NaN
  const out = () => Object.fromEntries(fields.map(f => [f.name, f.kind === 'amount' ? num(vals[f.name]) : vals[f.name]]));
  let busy = false;
  const go = async () => {
    if (busy) return; busy = true;
    try { await onSubmit(out()); sheet.close(true); } catch (e) { toast(e?.message || 'Could not save', { error: true }); } finally { busy = false; }
  };
  btn.addEventListener('click', go);
  body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); go(); } });
  return sheet;
}
