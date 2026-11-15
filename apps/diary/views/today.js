// Today = the editor. Writes are local-first: saved to this device 0.4s after you stop typing,
// queued for the cloud 3s after that (and immediately when you leave the screen / tab).
import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { isMeaningful, stats, draftFromEntry } from '../domain/entries.js';
import { toDatetime, dateLabel } from '../domain/dates.js';
import { entryPath } from '../data/keys.js';
import { MAX_SECTIONS, MAX_TITLE, MAX_CONTENT } from '../data/schema.js';
import { icon } from '../icons.js';
import { MOODS } from '../domain/moods.js';
import { normalizeTag, allTags, MAX_TAGS, MAX_TAG } from '../domain/tags.js';
import { onThisDay } from '../domain/calendar.js';
import { todayStr } from '../domain/dates.js';
import { entryRow } from '../components/entry-row.js';
import { openEntry } from '../components/entry-sheet.js';

export function todayView(main, app) {
  const { repo, store } = app;
  const d = app.state.today;                 // working draft; lives in app.state so tab switches never lose it
  let localDirty = false, commitDirty = false, saveT = null, commitT = null;

  const heading = h('h2', { class: 'dy-h' });
  const statusEl = h('span', { class: 'dy-status', role: 'status', 'aria-live': 'polite' });
  const bannerHost = h('div', { class: 'dy-banner-host' });
  const sectionsHost = h('div', { class: 'dy-sections' });
  const statsEl = h('p', { class: 'dy-stats' });
  const dateIn = h('input', { class: 'ui-input', type: 'date', value: d.date, 'aria-label': 'Entry date' });
  const timeIn = h('input', { class: 'ui-input', type: 'time', value: d.time, 'aria-label': 'Entry time' });
  const addBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('plus', 18)}<span>Add section</span>` });
  const doneBtn = h('button', { class: 'ui-btn ui-btn--primary dy-done', type: 'button' }, 'Done');
  const newBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button' }, 'New entry');

  // ---------- mood / tags / pin ----------
  const moodRow = h('div', { class: 'dy-mood', role: 'group', 'aria-label': 'Mood' }, ...MOODS.map(m =>
    h('button', { class: 'dy-mood-btn', type: 'button', 'data-v': m.v, 'aria-label': m.label, title: m.label, 'aria-pressed': 'false',
      onclick: () => { d.mood = d.mood === m.v ? null : m.v; touch(); } }, m.emoji)));
  const pinBtn = h('button', { class: 'ui-btn ui-btn--ghost dy-pin', type: 'button', 'aria-pressed': 'false',
    html: `${icon('pin', 16)}<span>Pin</span>`, onclick: () => { d.pinned = !d.pinned; touch(); } });
  const starBtn = h('button', { class: 'ui-btn ui-btn--ghost dy-pin dy-star', type: 'button', 'aria-pressed': 'false',
    html: `${icon('star', 16)}<span>Star this day</span>`, onclick: () => { d.starred = !d.starred; touch(); } });
  const tagList = h('div', { class: 'dy-tags' });
  const tagIn = h('input', { class: 'dy-tag-input', type: 'text', placeholder: 'Add tag…', maxlength: MAX_TAG + 1, list: 'dyTagList', 'aria-label': 'Add tag', autocomplete: 'off', autocapitalize: 'off' });
  const tagData = h('datalist', { id: 'dyTagList' }, ...allTags(repo.list()).slice(0, 30).map(t => h('option', { value: t.tag })));
  function paintMood() { moodRow.querySelectorAll('button').forEach(b => { const on = Number(b.dataset.v) === d.mood; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); }); }
  function paintPin() { pinBtn.setAttribute('aria-pressed', String(!!d.pinned)); pinBtn.classList.toggle('is-on', !!d.pinned); pinBtn.querySelector('span').textContent = d.pinned ? 'Pinned' : 'Pin'; }
  function paintStar() {
    starBtn.setAttribute('aria-pressed', String(!!d.starred)); starBtn.classList.toggle('is-on', !!d.starred);
    starBtn.querySelector('span').textContent = d.starred ? 'Starred · in Memories' : 'Star this day';
    starBtn.querySelector('svg').setAttribute('fill', d.starred ? 'currentColor' : 'none');
  }
  function paintTags() {
    tagList.replaceChildren(...d.tags.map(t => h('span', { class: 'dy-tag' }, '#' + t,
      h('button', { type: 'button', 'aria-label': `Remove tag ${t}`, onclick: () => { d.tags = d.tags.filter(x => x !== t); paintTags(); touch(); } }, '×'))));
    tagIn.hidden = d.tags.length >= MAX_TAGS;
  }
  function addTag() {
    const t = normalizeTag(tagIn.value); tagIn.value = '';
    if (!t || d.tags.includes(t) || d.tags.length >= MAX_TAGS) return;
    d.tags = [...d.tags, t]; paintTags(); touch();
  }
  tagIn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    else if (e.key === 'Backspace' && !tagIn.value && d.tags.length) { d.tags = d.tags.slice(0, -1); paintTags(); touch(); }
  });
  tagIn.addEventListener('blur', addTag);

  // ---------- saving ----------
  function statusText() {
    if (localDirty) return 'Typing…';
    if (!d.id) return isMeaningful(d) ? '' : 'Starts saving as soon as you write';
    if (commitDirty) return 'Saved on this device';
    if (app.mode !== 'cloud') return 'Saved on this device · local only';
    return store.isPending(entryPath(d.id)) ? 'Syncing…' : 'Synced';
  }
  function paint() {
    heading.textContent = d.id ? `Editing · ${dateLabel(toDatetime(d.date, d.time))}` : 'New entry';
    statusEl.textContent = statusText();
    newBtn.hidden = !d.id;
    const s = stats(d);
    statsEl.textContent = `${s.words} ${s.words === 1 ? 'word' : 'words'} · ${s.sections} ${s.sections === 1 ? 'section' : 'sections'}`;
    addBtn.disabled = d.sections.length >= MAX_SECTIONS;
    paintMood(); paintPin(); paintStar();
  }
  function saveLocal() {
    clearTimeout(saveT);
    if (!localDirty) return;
    if (!isMeaningful(d)) { localDirty = false; return; }
    try {
      const datetime = toDatetime(d.date, d.time);
      const extra = { mood: d.mood, tags: d.tags, pinned: d.pinned, starred: d.starred };
      const e = d.id ? repo.update(d.id, { datetime, sections: d.sections, ...extra }) : repo.create({ datetime, sections: d.sections, ...extra });
      d.id = e.id; d.knownUpdatedMs = e.updatedAtMs; localDirty = false; commitDirty = true;
    } catch (err) { toast(err.message, { error: true }); }
  }
  function commit() {
    clearTimeout(commitT);
    if (!commitDirty || !d.id) return;
    repo.commit(d.id); commitDirty = false; paint();
  }
  const flush = () => { saveLocal(); commit(); };
  function touch() {
    localDirty = true;
    clearTimeout(saveT); clearTimeout(commitT);
    saveT = setTimeout(() => { saveLocal(); paint(); }, 400);
    commitT = setTimeout(commit, 3000);
    paint();
  }

  // ---------- sections ----------
  function row(s, i) {
    const title = h('input', { class: 'dy-sec-title', type: 'text', placeholder: 'Section title (optional)', maxlength: MAX_TITLE, value: s.title, 'aria-label': `Section ${i + 1} title` });
    const ta = h('textarea', { class: 'dy-sec-text', placeholder: i === 0 ? 'What happened today?' : 'Write here…', maxlength: MAX_CONTENT, rows: 4, 'aria-label': `Section ${i + 1} text` });
    ta.value = s.content;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 1000) + 'px'; };
    title.addEventListener('input', () => { s.title = title.value; touch(); });
    ta.addEventListener('input', () => { s.content = ta.value; grow(); touch(); });
    const rm = d.sections.length > 1 ? h('button', { class: 'dy-icon', type: 'button', 'aria-label': `Remove section ${i + 1}`, html: icon('close', 18),
      onclick: async () => {
        if ((s.title.trim() || s.content.trim()) &&
          !(await confirmDialog({ title: 'Remove this section?', message: 'Its text will be deleted from this entry.', confirmLabel: 'Remove', danger: true }))) return;
        d.sections.splice(d.sections.indexOf(s), 1); buildSections(); touch();
      } }) : null;
    requestAnimationFrame(grow);
    return h('div', { class: 'dy-sec' }, h('div', { class: 'dy-sec-head' }, title, rm), ta);
  }
  function buildSections() { sectionsHost.replaceChildren(...d.sections.map(row)); paint(); }

  // ---------- changes that arrive from another device ----------
  function banner(text, actions) {
    bannerHost.replaceChildren(h('div', { class: 'dy-banner', role: 'status' }, h('p', {}, text),
      h('div', { class: 'dy-banner-row' }, ...actions.map(([label, fn]) => h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', onclick: () => { bannerHost.replaceChildren(); fn(); } }, label)))));
  }
  function reloadFromRepo() {
    const cur = repo.get(d.id); if (!cur) return;
    Object.assign(d, draftFromEntry(cur));
    localDirty = false; commitDirty = false;
    dateIn.value = d.date; timeIn.value = d.time; buildSections(); paintTags();
  }
  app.onExternal = info => {
    if (!d.id) return;
    const cur = repo.get(d.id);
    if (info.type === 'conflict' && info.id === d.id) {
      // The repo already replaced this entry with the other device's version and kept OUR text as a copy.
      // Show theirs here so a later keystroke can never overwrite it.
      reloadFromRepo();
      banner('This entry was edited on another device. Your version was saved as a separate entry.',
        info.copyId ? [['Open my version', () => app.edit(info.copyId)], ['OK', () => {}]] : [['OK', () => {}]]);
      return;
    }
    if (!cur) {
      banner('This entry was deleted on another device.', [['Keep it as a new entry', () => { d.id = null; d.knownUpdatedMs = null; localDirty = true; touch(); }], ['OK', () => {}]]);
      return;
    }
    if (cur.updatedAtMs === d.knownUpdatedMs) return;
    if (!localDirty && !commitDirty) { reloadFromRepo(); toast('Updated from another device.'); return; }
    banner('This entry changed on another device while you were editing.',
      [['Load their version', reloadFromRepo], ['Keep mine', () => { d.knownUpdatedMs = cur.updatedAtMs; localDirty = true; touch(); }]]);
  };
  app.onState = () => { statusEl.textContent = statusText(); };
  app.flushEditor = flush;

  // ---------- wiring ----------
  dateIn.addEventListener('input', () => { if (dateIn.value) { d.date = dateIn.value; touch(); } });
  timeIn.addEventListener('input', () => { if (timeIn.value) { d.time = timeIn.value; touch(); } });
  addBtn.addEventListener('click', () => {
    if (d.sections.length >= MAX_SECTIONS) return;
    d.sections.push({ title: '', content: '' }); buildSections(); touch();
    sectionsHost.lastElementChild?.querySelector('textarea')?.focus();
  });
  doneBtn.addEventListener('click', () => {
    flush();
    if (!d.id) { toast('Nothing to save yet — write something first.'); return; }
    toast('Saved.'); app.newEntry();
  });
  newBtn.addEventListener('click', () => { flush(); app.newEntry(); });

  buildSections(); paintTags();
  const otd = !d.id && !isMeaningful(d) ? onThisDay(repo.list(), todayStr()).slice(0, 3) : [];
  main.replaceChildren(h('section', { class: 'dy-card dy-editor' },
    h('div', { class: 'dy-head' }, heading, statusEl), bannerHost,
    h('div', { class: 'dy-when' }, dateIn, timeIn),
    h('div', { class: 'dy-meta' }, moodRow, h('div', { class: 'dy-metabtns' }, starBtn, pinBtn)),
    sectionsHost, statsEl,
    h('div', { class: 'dy-tagwrap' }, tagList, tagIn, tagData),
    h('div', { class: 'dy-actions' }, addBtn, newBtn, doneBtn)),
    otd.length ? h('section', { class: 'dy-card dm-card' }, h('h2', { class: 'dm-h' }, 'On this day'),
      h('div', { class: 'dt-list' }, ...otd.map(e => entryRow(e, x => openEntry(x, app), { showYear: true })))) : null);

  return () => {                               // dispose: never lose the last keystrokes
    flush();
    clearTimeout(saveT); clearTimeout(commitT);
    app.onExternal = null; app.onState = null; app.flushEditor = null;
  };
}
