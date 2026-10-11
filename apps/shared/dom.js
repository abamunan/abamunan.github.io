// Tiny DOM helpers shared by Money and Health trackers. No dependencies.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;            // only pass trusted/escaped strings
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

// While a sheet/confirm is open the page behind (#app) is made inert.
// Calculator + toast live OUTSIDE #app on purpose, so they stay usable.
let locks = 0;
export function lockApp() { if (locks++ === 0) { document.getElementById('app')?.setAttribute('inert', ''); document.documentElement.classList.add('ui-locked'); } }
export function unlockApp() { if (locks > 0 && --locks === 0) { document.getElementById('app')?.removeAttribute('inert'); document.documentElement.classList.remove('ui-locked'); } }

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function trapFocus(root) {
  const onKey = e => {
    if (e.key !== 'Tab') return;
    const f = [...root.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}
