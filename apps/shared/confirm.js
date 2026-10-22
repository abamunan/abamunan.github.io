import { h, lockApp, unlockApp, trapFocus } from './dom.js';
// Resolves true/false. typeToConfirm:'REPLACE' makes the confirm button wait for that exact word.
export function confirmDialog({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, typeToConfirm = null, extra = null } = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement, id = 'cf' + Math.random().toString(36).slice(2, 7);
    const ok = h('button', { class: 'ui-btn ' + (danger ? 'ui-btn--danger' : 'ui-btn--primary'), type: 'button' }, confirmLabel);
    const cancel = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button' }, cancelLabel);
    const kids = [h('h2', { id: id + 't' }, title), h('p', { id: id + 'd', class: 'ui-confirm__msg' }, message)];
    if (extra) kids.push(extra);
    let input = null;
    if (typeToConfirm) {
      input = h('input', { class: 'ui-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      ok.disabled = true;
      input.addEventListener('input', () => { ok.disabled = input.value.trim() !== typeToConfirm; });
      kids.push(h('label', { class: 'ui-confirm__type' }, `Type ${typeToConfirm} to confirm`, input));
    }
    const box = h('div', { class: 'ui-confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id + 't', 'aria-describedby': id + 'd' },
      ...kids, h('div', { class: 'ui-confirm__row' }, cancel, ok));
    const backdrop = h('div', { class: 'ui-backdrop' });
    const root = h('div', { class: 'ui-layer ui-layer--confirm' }, backdrop, box);
    document.body.append(root); lockApp();
    const untrap = trapFocus(box);
    const finish = v => { untrap(); root.remove(); unlockApp(); prev?.focus?.(); resolve(v); };
    ok.addEventListener('click', () => { if (!ok.disabled) finish(true); });
    cancel.addEventListener('click', () => finish(false));
    backdrop.addEventListener('click', () => finish(false));
    box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
    (input || (danger ? cancel : ok)).focus();
  });
}
