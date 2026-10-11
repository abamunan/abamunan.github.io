import { h } from '../../shared/dom.js';
import { dayForm } from '../components/day-form.js';
import { icon } from '../icons.js';

const pad = n => String(n).padStart(2, '0');
const iso = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
export function todayView(el, app) {
  const now = new Date(), sel = app.state.day ||= { y: now.getFullYear(), m0: now.getMonth(), d: now.getDate() };
  const set = dt => { app.state.unlocked?.clear(); app.state.day = { y: dt.getFullYear(), m0: dt.getMonth(), d: dt.getDate() }; app.refresh(); };
  const at = new Date(sel.y, sel.m0, sel.d), step = n => set(new Date(sel.y, sel.m0, sel.d + n));
  const isToday = iso(sel.y, sel.m0, sel.d) === iso(now.getFullYear(), now.getMonth(), now.getDate());
  const input = h('input', { class: 'ui-input dnav__in', type: 'date', value: iso(sel.y, sel.m0, sel.d), 'aria-label': 'Choose day' });
  input.addEventListener('change', () => { const [yy, mm, dd] = input.value.split('-').map(Number); if (yy && mm && dd) set(new Date(yy, mm - 1, dd)); });
  const nav = h('div', { class: 'dnav' }, h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Previous day', html: icon('left'), onclick: () => step(-1) }), input,
    h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Next day', html: icon('right'), onclick: () => step(1) }));
  app.form = dayForm(app, sel);
  el.replaceChildren(h('div', { class: 'hhead' }, nav, h('div', { class: 'dnav__sub' }, h('span', { class: 'card__sub', 'aria-live': 'polite' }, at.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
    !isToday && h('button', { type: 'button', class: 'chip', onclick: () => set(now) }, 'Back to today'))), app.form.el);
}
