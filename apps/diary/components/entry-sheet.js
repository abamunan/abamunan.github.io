// Read-only entry detail (full-screen sheet) with Pin, Edit and Delete(+Undo).
import { h } from '../../shared/dom.js';
import { openSheet } from '../../shared/sheet.js';
import { confirmDialog } from '../../shared/confirm.js';
import { toast } from '../../shared/toast.js';
import { dateLabel, timeLabel } from '../domain/dates.js';
import { blankDraft } from '../domain/entries.js';
import { moodOf } from '../domain/moods.js';
import { derive } from '../data/schema.js';
import { icon } from '../icons.js';

export function openEntry(entry, app) {
  const { repo } = app;
  const words = derive(entry).wordCount, mood = moodOf(entry.mood);
  const sections = entry.sections.map(s => h('section', { class: 'de-sec' },
    s.title.trim() ? h('h3', { class: 'de-title' }, s.title) : null,
    s.content.trim() ? h('p', { class: 'de-text' }, s.content) : h('p', { class: 'de-text de-empty' }, '(empty)')));
  let sheet;
  const edit = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', html: `${icon('edit', 18)}<span>Edit</span>`,
    onclick: () => { sheet.close(); app.edit(entry.id); } });
  const pin = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('pin', 18)}<span>${entry.pinned ? 'Unpin' : 'Pin'}</span>`,
    onclick: () => {
      const next = repo.update(entry.id, { pinned: !entry.pinned }); repo.commit(entry.id);
      const t = app.state.today;
      if (t.id === entry.id) { t.pinned = next.pinned; t.knownUpdatedMs = next.updatedAtMs; }   // keep an open editor in step (no false "changed elsewhere")
      sheet.close(); app.refresh(); toast(next.pinned ? 'Pinned to the top of Timeline.' : 'Unpinned.');
    } });
  const star = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('star', 18, entry.starred ? 'currentColor' : 'none')}<span>${entry.starred ? 'Unstar' : 'Star this day'}</span>`,
    onclick: () => {
      const next = repo.update(entry.id, { starred: !entry.starred }); repo.commit(entry.id);
      const t = app.state.today;
      if (t.id === entry.id) { t.starred = next.starred; t.knownUpdatedMs = next.updatedAtMs; }
      sheet.close(); app.refresh(); toast(next.starred ? 'Added to Memories.' : 'Removed from Memories.');
    } });
  const del = h('button', { class: 'ui-btn ui-btn--ghost dy-danger', type: 'button', html: `${icon('trash', 18)}<span>Delete</span>`,
    onclick: async () => {
      const ok = await confirmDialog({ title: 'Delete this entry?', message: 'You can undo for a few seconds afterwards.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      const removed = repo.remove(entry.id);
      if (app.state.today.id === entry.id) app.state.today = blankDraft();
      sheet.close(); app.refresh();
      if (removed) toast('Entry deleted', { action: 'Undo', timeout: 8000, onAction: () => { repo.restore(removed); app.refresh(); } });
    } });
  const body = h('div', { class: 'de' },
    h('p', { class: 'de-meta' }, `${mood ? mood.emoji + ' ' + mood.label + ' · ' : ''}${words} ${words === 1 ? 'word' : 'words'} · ${entry.sections.length} ${entry.sections.length === 1 ? 'section' : 'sections'}`),
    entry.tags?.length ? h('p', { class: 'dt-tags' }, ...entry.tags.map(t => h('span', { class: 'dt-tag' }, '#' + t))) : null,
    ...sections, h('div', { class: 'de-actions' }, edit, star, pin, del));
  sheet = openSheet({ title: `${dateLabel(entry.datetime)} · ${timeLabel(entry.datetime)}`, full: true, content: body });
  return sheet;
}
