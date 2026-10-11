import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { openSheet } from '../../shared/sheet.js';
import { MOODS } from '../data/defaults.js';
import { buildDayDoc, computeExtraShown, visibleMetrics, dailyScore, metricForcedShown, unownedFields } from '../domain/day.js';
import { LockedError } from '../domain/lock.js';
import { icon } from '../icons.js';

const SAVE_DELAY = 700;
const rid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// The entry form for ONE day. Autosaves (debounced) to the same document the legacy app uses.
// `values` uses the document's own field names, so unsaved typing and the stored day look the same.
export function dayForm(app, { y, m0, d }) {
  const { repo } = app, metrics = repo.state.metrics, dk = `${y}_${m0}_${d}`;
  app.state.unlocked ||= new Set();                                       // "Unlock to edit": cleared when the person changes day or leaves Today; never rewrites the stored lock flag
  const doc0 = repo.getDay(y, m0, d), values = { ...doc0 }, extra = computeExtraShown(metrics, doc0);
  let dirty = false, timer = null;
  const locked = () => !app.state.unlocked.has(dk) && repo.isLocked(y, m0, d);
  const currentDoc = () => { const existing = repo.getDay(y, m0, d);
    return { ...unownedFields(metrics, existing), ...buildDayDoc(metrics, values, { existing, extraShown: extra }) }; };

  const root = h('div', { class: 'dform' });
  const saveNote = h('span', { class: 'hsave', role: 'status' });
  const scoreNum = h('span', { class: 'hscore__n num' }), scoreSub = h('span', { class: 'card__sub' }), scoreFill = h('span', { class: 'bar__fill' });
  const updateScore = () => { const s = dailyScore(metrics, currentDoc());
    if (s.pct == null) { scoreNum.textContent = '\u2013'; scoreSub.textContent = 'Pin some metrics to track a score'; scoreFill.style.width = '0%'; return; }
    scoreNum.textContent = s.pct + '%'; scoreFill.style.width = s.pct + '%';
    scoreSub.textContent = s.pct === 100 ? 'Fully logged \u2014 nice work!' : s.pct === 0 ? 'Start logging to see your score' : `${s.filled} of ${s.total} metrics logged`; };

  function flush() {
    clearTimeout(timer); if (!dirty) return; dirty = false;
    try { repo.saveDay(y, m0, d, currentDoc(), { unlocked: app.state.unlocked.has(dk) }); saveNote.textContent = 'Saved'; }
    catch (e) { saveNote.textContent = ''; toast(e instanceof LockedError ? 'This day is locked' : 'Could not save', { error: true }); }
  }
  function touched() { if (locked()) return; dirty = true; saveNote.textContent = 'Saving\u2026'; updateScore(); clearTimeout(timer); timer = setTimeout(flush, SAVE_DELAY); }
  const saveNow = () => { dirty = true; flush(); };

  const textIn = (key, label, ph, mode = 'decimal') => { const v = values[key];
    const el = h('input', { class: 'ui-input num hin', type: 'text', inputmode: mode, autocomplete: 'off', placeholder: ph, 'aria-label': label, value: v ? String(v) : '' });
    el.addEventListener('input', () => { values[key] = el.value; touched(); }); return el; };
  const pills = (items, isOn, onPick, cls, label) => { const box = h('div', { class: cls, role: 'group', 'aria-label': label });
    const paint = () => box.replaceChildren(...items.map(it => h('button', { type: 'button', class: 'chip hpill', 'aria-pressed': String(isOn(it)), onclick: () => { onPick(it); paint(); touched(); } }, it.label)));
    paint(); return box; };

  function checklist(m) {
    const key = m.id + '_items', list = h('div', { class: 'hmeds' });
    const items = () => Array.isArray(values[key]) ? values[key] : [];
    const paint = () => list.replaceChildren(...items().map(it => h('div', { class: 'hmed' },
      h('button', { type: 'button', class: 'hmed__chk', 'aria-pressed': String(!!it.checked), 'aria-label': `${it.name}: ${it.checked ? 'taken' : 'not taken'}`, html: it.checked ? icon('check', 18) : '', onclick: () => { values[key] = items().map(x => x.id === it.id ? { ...x, checked: !x.checked } : x); paint(); touched(); } }),
      h('span', { class: 'hmed__n' }, it.name),
      h('button', { type: 'button', class: 'ui-icon-btn hmed__x', 'aria-label': `Remove ${it.name}`, html: icon('close', 16), onclick: () => { values[key] = items().filter(x => x.id !== it.id); paint(); touched(); } }))));
    const input = h('input', { class: 'ui-input', type: 'text', maxlength: 40, placeholder: 'Add medication / supplement', 'aria-label': 'New ' + m.label + ' item', autocomplete: 'off' });
    const add = () => { const name = input.value.trim(); if (!name) return; values[key] = [...items(), { id: rid(), name, checked: false }]; input.value = ''; paint(); touched(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paint(); return h('div', { class: 'hrow' }, h('div', { class: 'hrow__top' }, h('span', { class: 'hrow__icon', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'hrow__label' }, m.label)), list,
      h('div', { class: 'hadd' }, input, h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: add }, 'Add')));
  }

  function row(m) {
    if (m.type === 'checklist') return checklist(m);
    if (m.type === 'mood') return h('div', { class: 'hrow' }, h('div', { class: 'hrow__top' }, h('span', { class: 'hrow__icon', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'hrow__label' }, 'Mood')),
      pills(MOODS.map(o => ({ ...o, label: `${o.icon} ${o.label}` })), o => values.mood === o.id, o => { values.mood = values.mood === o.id ? '' : o.id; }, 'chips hmood', 'Mood'));
    let control = null;
    if (m.type === 'number') control = [textIn(m.id, m.label, '0'), h('span', { class: 'hunit' }, m.unit || '')];
    else if (m.type === 'bp') control = h('div', { class: 'hbp' }, textIn(m.id + '_sys', m.label + ' systolic', 'Sys'), h('span', { 'aria-hidden': 'true' }, '/'), textIn(m.id + '_dia', m.label + ' diastolic', 'Dia'), h('span', { class: 'hunit' }, m.unit || ''));
    const noteKey = 'note_' + m.id, noteIn = h('input', { class: 'ui-input', type: 'text', maxlength: 200, placeholder: 'Note (optional)', 'aria-label': m.label + ' note', value: values[noteKey] || '' });
    const noteRow = h('div', { class: 'hnote', hidden: !values[noteKey] }, noteIn);
    noteIn.addEventListener('input', () => { values[noteKey] = noteIn.value; noteBtn.classList.toggle('has-note', !!noteIn.value.trim()); touched(); });
    const noteBtn = h('button', { type: 'button', class: 'ui-icon-btn hnotebtn' + (values[noteKey] ? ' has-note' : ''), 'aria-label': m.label + ' note', 'aria-expanded': String(!!values[noteKey]), html: icon('note', 18),
      onclick: () => { noteRow.hidden = !noteRow.hidden; noteBtn.setAttribute('aria-expanded', String(!noteRow.hidden)); if (!noteRow.hidden) noteIn.focus(); } });
    const scale = m.type === 'scale' ? pills([1, 2, 3, 4, 5].map(n => ({ n, label: String(n) })), o => String(values[m.id]) === String(o.n), o => { values[m.id] = String(values[m.id]) === String(o.n) ? '' : o.n; }, 'chips hscale', m.label + ' (1 to 5)') : null;
    return h('div', { class: 'hrow' }, h('div', { class: 'hrow__top' + (m.type === 'bp' ? ' hrow__top--wrap' : '') }, h('span', { class: 'hrow__icon', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'hrow__label' }, m.label), control, noteBtn), scale, noteRow);
  }

  function build() {
    const isLocked = locked(), s = [];
    s.push(h('section', { class: 'card hscore', 'aria-label': 'Daily log score' }, h('div', { class: 'hscore__top' }, h('h2', { class: 'card__h' }, 'Daily log'), scoreNum),
      h('div', { class: 'bar', role: 'presentation' }, scoreFill), h('div', { class: 'hscore__sub' }, scoreSub, saveNote)));
    if (isLocked) s.push(h('div', { class: 'hlock', role: 'status' }, h('span', { html: icon('lock', 18) }), h('span', { class: 'hlock__t' }, 'This day is locked.'),
      h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: () => { app.state.unlocked.add(dk); rebuild(); } }, 'Unlock to edit')));
    const fs = h('fieldset', { class: 'hform', disabled: isLocked }, h('legend', { class: 'sr-only' }, 'Health metrics for this day'), ...visibleMetrics(metrics, extra).map(row));
    s.push(fs);
    const more = metrics.some(m => !m.pinned);
    s.push(h('div', { class: 'hactions' }, more && h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', disabled: isLocked, onclick: openPicker }, h('span', { html: icon('plus', 18) }), ' Add or remove fields'),
      !isLocked && h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: () => { flush(); repo.setManualLock(y, m0, d, true); app.state.unlocked.delete(dk); rebuild(); toast('Day locked'); } }, h('span', { html: icon('lock', 18) }), ' Lock this day')));
    root.replaceChildren(...s); updateScore();
  }
  const rebuild = () => { flush(); build(); };

  function openPicker() {
    const body = h('div', { class: 'hpick' }); const sh = openSheet({ title: 'Fields for this day', content: body });
    const paint = () => body.replaceChildren(h('p', { class: 'card__sub' }, 'Pinned metrics always show. Pick any other metric to show it for this day.'),
      h('div', { class: 'chips' }, metrics.filter(m => !m.pinned).map(m => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(extra.has(m.id)),
        onclick: () => { if (extra.has(m.id)) { if (metricForcedShown(m, currentDoc())) return toast('Clear its value first to remove it', { error: true }); extra.delete(m.id); } else extra.add(m.id); saveNow(); paint(); build(); } }, `${m.icon} ${m.label}`))),
      h('button', { type: 'button', class: 'ui-btn ui-btn--primary', onclick: () => sh.close() }, 'Done'));
    paint();
  }

  build();
  return { el: root, flush, busy: () => dirty || (root.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) };
}
