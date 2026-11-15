// PIN entry: dots + on-screen keypad (phone) + hardware keyboard (desktop). Used by the lock screen and by PIN setup.
import { h } from '../../shared/dom.js';

export function pinPad({ title, subtitle = '', onSubmit, minLen = 4, maxLen = 8 }) {
  let value = '', busy = false;
  const heading = h('h2', { class: 'dl-title' }, title);
  const sub = h('p', { class: 'dl-sub' }, subtitle);
  const dots = h('div', { class: 'dl-dots', 'aria-hidden': 'true' });
  const msg = h('p', { class: 'dl-msg', role: 'status', 'aria-live': 'polite' });
  const paint = () => dots.replaceChildren(...Array.from({ length: Math.max(minLen, value.length) }, (_, i) => h('i', { class: i < value.length ? 'on' : '' })));
  const press = d => { if (busy || value.length >= maxLen) return; value += d; msg.textContent = ''; paint(); };
  const back = () => { if (!busy) { value = value.slice(0, -1); paint(); } };
  const submit = async () => {
    if (busy) return;
    if (value.length < minLen) { msg.textContent = `Enter at least ${minLen} digits.`; return; }
    busy = true; const v = value;
    try { await onSubmit(v); } finally { busy = false; }
  };
  const key = (label, aria, fn, cls = '') => h('button', { class: 'dl-key ' + cls, type: 'button', 'aria-label': aria, onclick: fn }, label);
  const keys = [...'123456789'].map(d => key(d, d, () => press(d))).concat(
    [key('⌫', 'Delete', back, 'dl-key--fn'), key('0', '0', () => press('0')), key('✓', 'Confirm', submit, 'dl-key--ok')]);
  const el = h('div', { class: 'dl-pad', tabindex: '-1' }, heading, sub, dots, msg, h('div', { class: 'dl-keys' }, ...keys));
  el.addEventListener('keydown', e => {
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); submit(); }
  });
  paint();
  return { el, focus: () => el.focus(), reset(message = '') { value = ''; paint(); msg.textContent = message; }, setTitle(t, s = '') { heading.textContent = t; sub.textContent = s; } };
}
