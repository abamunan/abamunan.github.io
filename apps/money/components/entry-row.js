import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
// Tap = edit. Swipe left (>90px), long-press (550ms) or the Delete key = delete (with Undo toast).
export function entryRow(e, { onEdit, onDelete }) {
  const amount = h('span', { class: 'erow__amt num ' + (e.kind === 'in' ? 'money-in' : 'money-out') }, fmt(e.signed, { sign: true }));
  const sub = [e.acctLabel, e.adj ? 'adjustment' : '', e.note].filter(Boolean).join(' \u00B7 ');
  const btn = h('button', { type: 'button', class: 'erow', 'aria-label': `${e.label}, ${e.kind === 'in' ? 'income' : 'expense'} ${fmt(Math.abs(e.signed))}${sub ? ', ' + sub : ''}. Tap to edit. Delete key or long press to delete.` },
    h('span', { class: 'erow__icon', 'aria-hidden': 'true' }, e.icon || '\u2022'), h('span', { class: 'erow__main' }, h('span', { class: 'erow__label' }, e.label), sub && h('span', { class: 'erow__sub' }, sub)), amount);
  let x0 = null, y0 = 0, timer = null, moved = false;
  const reset = () => { clearTimeout(timer); x0 = null; btn.style.transform = ''; };
  btn.addEventListener('pointerdown', ev => { x0 = ev.clientX; y0 = ev.clientY; moved = false; timer = setTimeout(() => { moved = true; reset(); onDelete(); }, 550); });
  btn.addEventListener('pointermove', ev => { if (x0 == null) return; const dx = ev.clientX - x0; if (Math.abs(dx) > 8 || Math.abs(ev.clientY - y0) > 8) clearTimeout(timer); if (dx < -8) { moved = true; btn.style.transform = `translateX(${Math.max(dx, -120)}px)`; } });
  btn.addEventListener('pointerup', ev => { if (x0 != null && ev.clientX - x0 < -90) { reset(); onDelete(); } else reset(); });
  btn.addEventListener('pointercancel', reset);
  btn.addEventListener('click', () => { if (moved) { moved = false; return; } onEdit(); });
  btn.addEventListener('keydown', ev => { if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); onDelete(); } });
  return btn;
}
