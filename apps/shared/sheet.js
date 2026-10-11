import { h, lockApp, unlockApp, trapFocus } from './dom.js';
// Bottom sheet (default) or full-screen form ({full:true}). Returns {el, body, close, closed}.
// Closes on Esc, backdrop tap, ✕, or dragging the handle down. Focus is trapped and restored.
export function openSheet({ title = '', content, full = false, onClose } = {}) {
  const prev = document.activeElement;
  const tid = 'sh' + Math.random().toString(36).slice(2, 7);
  const body = h('div', { class: 'ui-sheet__body' });
  if (content) body.append(content.nodeType ? content : document.createTextNode(content));
  const closeBtn = h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Close' }, '\u2715');
  const handle = h('div', { class: 'ui-sheet__handle', 'aria-hidden': 'true' });
  const heading = h('h2', { id: tid }, title);
  const panel = h('section', { class: 'ui-sheet' + (full ? ' ui-sheet--full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid, tabindex: '-1' },
    handle, h('header', { class: 'ui-sheet__head' }, heading, closeBtn), body);
  const backdrop = h('div', { class: 'ui-backdrop' });
  const root = h('div', { class: 'ui-layer' }, backdrop, panel);
  document.body.append(root); lockApp();
  const untrap = trapFocus(panel);
  let closed = false, done; const result = new Promise(r => { done = r; });
  function close(value) {
    if (closed) return; closed = true;
    untrap(); root.remove(); unlockApp(); prev?.focus?.(); onClose?.(value); done(value);
  }
  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  let y0 = null;
  handle.addEventListener('pointerdown', e => { y0 = e.clientY; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e => { if (y0 != null) panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  handle.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; panel.style.transform = ''; if (dy > 90) close(); });
  handle.addEventListener('pointercancel', () => { y0 = null; panel.style.transform = ''; });
  (body.querySelector('[data-autofocus]') || panel).focus();
  return { el: panel, body, close, closed: result, setTitle: t => { heading.textContent = t; } };
}
export const openForm = opts => openSheet({ ...opts, full: true });
