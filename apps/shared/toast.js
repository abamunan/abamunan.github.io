import { h } from './dom.js';
let host, timer;
// toast('Deleted', {action:'Undo', onAction:fn}). One toast at a time.
export function toast(message, { action, onAction, timeout, error = false } = {}) {
  if (!host) { host = h('div', { class: 'ui-toast-host', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.append(host); }
  clearTimeout(timer); host.replaceChildren();
  const ms = timeout ?? (action ? 6000 : 3000);
  const el = h('div', { class: 'ui-toast' + (error ? ' ui-toast--err' : ''), role: error ? 'alert' : null }, h('span', {}, (error ? '\u26A0 ' : '') + message));
  const dismiss = () => { clearTimeout(timer); el.remove(); };
  if (action) el.append(h('button', { class: 'ui-toast__btn', type: 'button', onclick: () => { dismiss(); onAction?.(); } }, action));
  host.append(el);
  if (ms > 0) {
    const start = () => { timer = setTimeout(dismiss, ms); };
    start();
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', start);
    el.addEventListener('focusin', () => clearTimeout(timer));
  }
  return { dismiss };
}
