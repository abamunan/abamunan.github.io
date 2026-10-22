// Floating calculator. Lives on <body> (outside #app) so it stays usable while a sheet is open (z-index --z-calc).
//  • Icon: tap = open, drag = move. Hold or drag → a ✕ target appears; drop the icon on it to hide it for 10 minutes.
//  • Window: drag by its header, ✕ closes. Last 25 results are kept. More → "Show calculator" brings the icon back.
// Saved in localStorage (this browser only): mt2_calc_icon_v1, mt2_calc_win_v1, mt2_calc_hidden_until_v1, mt2_calc_history_v1.
import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { icon } from '../icons.js';
import { initial, press, preview, normalizeKey, fmtNum, show } from '../domain/calc.js';

const K = { icon: 'mt2_calc_icon_v1', win: 'mt2_calc_win_v1', hide: 'mt2_calc_hidden_until_v1', hist: 'mt2_calc_history_v1' };
const FAB = 54, EDGE = 6, HOLD_MS = 380, MOVE_PX = 6, SNAP_PX = 64, HIDE_MS = 10 * 60 * 1000, MAX_HISTORY = 25;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  json: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } } };
const frac = f => f && Number.isFinite(f.fx) && Number.isFinite(f.fy) && f.fx >= 0 && f.fx <= 1 && f.fy >= 0 && f.fy <= 1 ? f : null;
const KEYS = [['C', 'Clear'], ['(', 'Open bracket'], [')', 'Close bracket'], ['\u232B', 'Backspace'], ['7'], ['8'], ['9'], ['\u00F7', 'Divide'], ['4'], ['5'], ['6'], ['\u00D7', 'Multiply'],
  ['1'], ['2'], ['3'], ['\u2212', 'Minus'], ['0'], ['.', 'Decimal point'], ['=', 'Equals'], ['+', 'Plus']];

export function mountCalculator({ now = () => Date.now() } = {}) {
  let st = initial(), hist = (Array.isArray(ls.json(K.hist)) ? ls.json(K.hist) : []).filter(x => x && typeof x.e === 'string' && typeof x.r === 'string').slice(0, MAX_HISTORY);
  let iconFrac = frac(ls.json(K.icon)) || { fx: 1, fy: 0.45 }, winFrac = frac(ls.json(K.win)) || { fx: 0.5, fy: 0.12 }, hideTimer = null, suppressClick = false, histOpen = false;

  const exprEl = h('div', { class: 'calc__expr num', 'aria-label': 'Expression' }), resEl = h('div', { class: 'calc__res num', 'aria-live': 'polite' });
  const histEl = h('div', { class: 'calc__hist', hidden: true });
  const closeBtn = h('button', { type: 'button', class: 'ui-icon-btn calc__x', 'aria-label': 'Close calculator' }, '\u2715');
  const histBtn = h('button', { type: 'button', class: 'ui-icon-btn calc__x', 'aria-label': 'History', 'aria-pressed': 'false' }, '\u29D6');
  const head = h('div', { class: 'calc__head' }, h('span', { class: 'calc__title' }, 'Calculator'), histBtn, closeBtn);
  const keys = h('div', { class: 'calc__keys' }, KEYS.map(([k, label]) => h('button', { type: 'button', class: 'calc__key' + (k === '=' ? ' calc__key--eq' : /[C()\u232B\u00F7\u00D7\u2212+]/.test(k) ? ' calc__key--op' : ''), 'data-key': k, 'aria-label': label || k }, k)));
  const win = h('section', { class: 'calc', role: 'dialog', 'aria-label': 'Calculator', tabindex: '-1', hidden: true }, head, exprEl, resEl, histEl, keys);
  const fab = h('button', { type: 'button', class: 'calc-fab', 'aria-label': 'Open calculator', 'aria-expanded': 'false', html: icon('calc', 26), hidden: true });
  const dropX = h('button', { type: 'button', class: 'calc-drop__x', 'aria-label': 'Hide calculator for 10 minutes', html: icon('close', 24) }), drop = h('div', { class: 'calc-drop', 'aria-hidden': 'true' }, h('div', { class: 'calc-drop__l' }, 'Drop here to hide for 10 min'), dropX);
  const root = h('div', { class: 'calc-root' }, drop, win, fab); document.body.append(root);

  // ── positions: a fraction (0..1) of the free space, so it survives rotation and resizing ──
  const vw = () => document.documentElement.clientWidth, vh = () => window.innerHeight;
  const setDropVisible = visible => {
    drop.classList.toggle('calc-drop--on', visible);
    drop.setAttribute('aria-hidden', String(!visible));
  };
  function put(el, f) { const w = el.offsetWidth || FAB, hh = el.offsetHeight || FAB, mx = Math.max(EDGE, vw() - w - EDGE), my = Math.max(EDGE, vh() - hh - EDGE);
    el.style.left = Math.round(EDGE + f.fx * (mx - EDGE)) + 'px'; el.style.top = Math.round(EDGE + f.fy * (my - EDGE)) + 'px'; }
  function dragTo(el, left, top) { const w = el.offsetWidth, hh = el.offsetHeight, mx = Math.max(EDGE, vw() - w - EDGE), my = Math.max(EDGE, vh() - hh - EDGE);
    const l = Math.min(Math.max(left, EDGE), mx), t = Math.min(Math.max(top, EDGE), my); el.style.left = l + 'px'; el.style.top = t + 'px';
    return { fx: mx > EDGE ? (l - EDGE) / (mx - EDGE) : 0, fy: my > EDGE ? (t - EDGE) / (my - EDGE) : 0 }; }
  const layout = () => { put(fab, iconFrac); if (!win.hidden) put(win, winFrac); };
  window.addEventListener('resize', layout);

  // ── display ──
  function render() {
    exprEl.textContent = st.expr ? show(st.expr) : '0'; exprEl.scrollLeft = exprEl.scrollWidth;
    const p = preview(st); resEl.textContent = st.error ? 'Check the expression' : st.done ? '' : p == null ? '\u00A0' : '= ' + fmtNum(p); resEl.classList.toggle('calc__res--err', st.error);
    histBtn.setAttribute('aria-pressed', String(histOpen)); histEl.hidden = !histOpen; keys.hidden = histOpen;
    if (histOpen) histEl.replaceChildren(...(hist.length ? [...hist.map(x => h('button', { type: 'button', class: 'calc__h', 'data-r': x.r }, h('span', { class: 'num' }, x.e), h('b', { class: 'num' }, '= ' + fmtNum(Number(x.r.replace('\u2212', '-')))))),
      h('button', { type: 'button', class: 'ui-btn ui-btn--ghost calc__hclear' }, 'Clear history')] : [h('p', { class: 'card__sub' }, 'No results yet.')]));
  }
  function apply(key) {
    st = press(st, key);
    if (st.entry) { hist = [st.entry, ...hist.filter(x => !(x.e === st.entry.e && x.r === st.entry.r))].slice(0, MAX_HISTORY); ls.set(K.hist, JSON.stringify(hist)); }
    render();
  }
  keys.addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (!b) return; apply(b.dataset.key); if (e.detail > 0) win.focus({ preventScroll: true }); });
  histBtn.addEventListener('click', () => { histOpen = !histOpen; render(); });
  histEl.addEventListener('click', e => {
    if (e.target.closest('.calc__hclear')) { hist = []; ls.set(K.hist, '[]'); return render(); }
    const b = e.target.closest('[data-r]'); if (b) { st = { expr: b.dataset.r, done: true, error: false, entry: null }; histOpen = false; render(); win.focus({ preventScroll: true }); }
  });
  win.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.stopPropagation(); return close(); }
    if (e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;          // a focused button keeps its normal keyboard behaviour
    const k = normalizeKey(e.key); if (k.length === 1 && /[0-9.+\u2212\u00D7\u00F7()=C]/.test(k) || k === '\u232B') { e.preventDefault(); apply(k); }
  });

  // ── open / close ──
  function openWin() { if (!win.hidden) return; win.hidden = false; fab.setAttribute('aria-expanded', 'true'); put(win, winFrac); render(); win.focus({ preventScroll: true }); }
  function close() { if (win.hidden) return; win.hidden = true; fab.setAttribute('aria-expanded', 'false'); if (!fab.hidden) fab.focus({ preventScroll: true }); }
  closeBtn.addEventListener('click', close);
  fab.addEventListener('click', () => { if (suppressClick) return; win.hidden ? openWin() : close(); });

  // ── drag helpers (pointer events: mouse, touch and pen) ──
  const hot = ev => { const r = dropX.getBoundingClientRect(); return Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)) <= SNAP_PX; };
  function drag(el, e, { onMove, onEnd, hold = false }) {
    if (e.button > 0) return; const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, sx = e.clientX, sy = e.clientY; let moved = false, held = false, timer = null;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (hold) timer = setTimeout(() => { held = true; setDropVisible(true); try { navigator.vibrate?.(12); } catch { /* ignore */ } }, HOLD_MS);
    const move = ev => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > MOVE_PX) { moved = true; clearTimeout(timer); if (hold) setDropVisible(true); } if (moved) onMove(ev.clientX - dx, ev.clientY - dy, ev); };
    const up = ev => { clearTimeout(timer); const over = hot(ev);                                  // measured before the ✕ target is hidden again
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      setDropVisible(false); drop.classList.remove('calc-drop--hot'); if (moved || held) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); } onEnd(over, moved); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  fab.addEventListener('pointerdown', e => drag(fab, e, { hold: true,
    onMove: (l, t, ev) => { iconFrac = dragTo(fab, l, t); drop.classList.toggle('calc-drop--hot', hot(ev)); },
    onEnd: (over, moved) => { if (moved && over) hideIcon(); else if (moved) ls.set(K.icon, JSON.stringify(iconFrac)); } }));
  head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag(head, e, { onMove: (l, t) => { winFrac = dragTo(win, l, t); }, onEnd: (over, moved) => { if (moved) ls.set(K.win, JSON.stringify(winFrac)); } }); });
  head.style.touchAction = 'none'; fab.style.touchAction = 'none';

  // ── hide for 10 minutes / bring back ──
  function schedule() { clearTimeout(hideTimer); const left = (Number(ls.get(K.hide)) || 0) - now();
    if (left > 0) { fab.hidden = true; hideTimer = setTimeout(schedule, Math.min(left, 2147483000)); } else { fab.hidden = false; layout(); } }
  function hideIcon() { close(); ls.set(K.hide, String(now() + HIDE_MS)); schedule(); toast('Calculator hidden for 10 minutes. Bring it back from More.'); }
  dropX.addEventListener('click', hideIcon);
  function restore() { ls.set(K.hide, '0'); schedule(); layout(); openWin(); }
  schedule(); layout(); render();
  return { open: openWin, close, restore, isHidden: () => fab.hidden, destroy: () => { clearTimeout(hideTimer); window.removeEventListener('resize', layout); root.remove(); } };
}
