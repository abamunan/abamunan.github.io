import { h } from '../../shared/dom.js';
import { openSheet } from '../../shared/sheet.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { parseBackup, planRestore, applyPlan } from '../data/restore.js';

/** Reads a backup file, shows exactly what would change, and applies it only after the person confirms. */
export async function openRestore(app, file) {
  let text;
  try { text = await file.text(); } catch { toast('Could not read that file.', { error: true }); return; }
  const parsed = parseBackup(text, { uid: app.user ? app.user.uid : null });
  if (!parsed.ok) { toast(parsed.error, { error: true }); return; }
  const local = app.repo.list();
  const plans = { merge: planRestore(local, parsed.entries, 'merge'), replace: planRestore(local, parsed.entries, 'replace') };
  let mode = 'merge', sheet;
  const summary = h('p', { class: 'dm-note', role: 'status' });
  const go = h('button', { class: 'ui-btn ui-btn--primary', type: 'button' }, 'Restore');
  const radio = (v, label, desc) => h('label', { class: 'dx-radio' },
    h('input', { type: 'radio', name: 'rmode', value: v, checked: v === 'merge', onchange: () => { mode = v; paint(); } }), h('span', {}, h('b', {}, label), h('small', {}, desc)));
  function paint() {
    const p = plans[mode];
    const parts = [`${p.add.length} new`, `${p.update.length} ${mode === 'merge' ? 'newer in the backup' : 'overwritten'}`, `${p.same} unchanged`];
    if (mode === 'replace') parts.push(`${p.remove.length} removed`);
    if (parsed.skipped) parts.push(`${parsed.skipped} invalid skipped`);
    summary.textContent = parts.join(' · ');
    go.disabled = !(p.add.length || p.update.length || p.remove.length);
    go.className = 'ui-btn ' + (mode === 'replace' ? 'ui-btn--danger' : 'ui-btn--primary');
  }
  go.addEventListener('click', async () => {
    const p = plans[mode];
    if (mode === 'replace' && !(await confirmDialog({ title: 'Replace your whole diary?', danger: true, typeToConfirm: 'REPLACE', confirmLabel: 'Replace',
      message: `${p.remove.length} ${p.remove.length === 1 ? 'entry that is' : 'entries that are'} not in the backup will be deleted here and in the cloud, and ${p.update.length} will be overwritten.` }))) return;
    const r = applyPlan(app.repo, p);
    sheet.close(); app.refresh();
    toast(`Restored · ${r.added} new, ${r.updated} updated${r.removed ? `, ${r.removed} removed` : ''}.`);
  });
  sheet = openSheet({ title: 'Restore backup', content: h('div', { class: 'dx' },
    h('p', { class: 'dm-note' }, `${parsed.entries.length} ${parsed.entries.length === 1 ? 'entry' : 'entries'} in this file.`),
    radio('merge', 'Merge (recommended)', 'Adds missing entries and takes the backup’s version only where it is newer. Deletes nothing.'),
    radio('replace', 'Replace everything', 'Makes the diary exactly like the backup. Entries not in the file are deleted.'),
    summary, h('div', { class: 'dy-actions' }, go)) });
  paint();
  return sheet;
}
