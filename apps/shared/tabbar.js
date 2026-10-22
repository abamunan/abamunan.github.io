import { h } from './dom.js';
// mountTabbar(el, [{id,label,icon:'<svg…>'}], {active, onSelect}) → {select(id)}
// Active tab = colour + top bar + bold + aria-current (never colour alone).
export function mountTabbar(host, tabs, { active, onSelect, label = 'Main' } = {}) {
  host.classList.add('ui-tabbar'); host.setAttribute('role', 'navigation'); host.setAttribute('aria-label', label);
  const btns = new Map();
  const paint = id => btns.forEach((b, k) => { b.classList.toggle('is-active', k === id); k === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  for (const t of tabs) {
    const b = h('button', { type: 'button', class: 'ui-tab', 'data-tab': t.id, onclick: () => { paint(t.id); onSelect?.(t.id); } },
      h('span', { class: 'ui-tab__icon', 'aria-hidden': 'true', html: t.icon || '' }), h('span', { class: 'ui-tab__label' }, t.label));
    btns.set(t.id, b); host.append(b);
  }
  paint(active);
  return { select: paint, el: host };
}
