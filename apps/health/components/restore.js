import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { parseBackup, planImport } from '../data/backup.js';
import { cloudDayIds } from '../data/sync.js';
import { backupGuard } from './backup-guard.js';

// "Replace" and "Remove all" must also clear the CLOUD copy, otherwise the removed days come back on the next sync. So they need the cloud day ids first.
async function cloudIdsOrAbort(app) {
  if (!app.remote) { toast('Sign in and go online first, so the cloud copy is changed too. Merge works offline.', { error: true }); return null; }
  try { return await cloudDayIds(app.remote); } catch { toast('Could not reach the cloud. Nothing was changed.', { error: true }); return null; }
}
export function pickFile(onText) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => { const f = input.files[0]; input.remove(); if (f) onText(await f.text()); });
  document.body.append(input); input.click();
}
const localData = repo => { const s = repo.state; return { metrics: s.metrics, goals: s.goals, profile: s.profile, days: Object.fromEntries(repo.listDays().map(x => [x.key, x.data])) }; };

// mode 'merge': nothing is deleted, the file wins where both have the same day / metric. mode 'replace': the file becomes everything.
export async function importBackup(app, mode, { text } = {}) {
  const { repo } = app, replace = mode === 'replace';
  const run = async text => {
    const res = parseBackup(text); if (!res.ok) return toast(res.error, { error: true });
    const cloudIds = replace ? await cloudIdsOrAbort(app) : [];
    if (cloudIds === null) return;
    const plan = planImport({ mode, local: localData(repo), payload: res.payload, cloudDayIds: cloudIds }), m = plan.summary, bad = res.stats.invalid ? ` ${res.stats.invalid} invalid items in the file are skipped.` : '';
    const msg = replace
      ? `Everything is replaced by the file: ${m.backupDays} days plus its metrics, goals and profile. ${m.deleteLocal} days on this device and ${m.deleteCloud} in the cloud that are not in the file will be deleted.${bad}`
      : `${m.newFromBackup} new days are added and ${m.overwritten} existing days are overwritten by the file. Nothing is deleted; ${m.localOnly} days that are only here stay as they are. Metrics, goals and profile fields in the file overwrite yours.${bad}`;
    if (!await confirmDialog({ title: replace ? 'Replace all data?' : 'Merge backup?', message: msg, confirmLabel: replace ? 'Replace' : 'Merge', danger: replace, typeToConfirm: replace ? 'REPLACE' : null })) return;
    if (!await backupGuard({ kind: 'auto-before-import', payload: repo.snapshot() })) return toast('Cancelled. Nothing was changed.');
    try { repo.applyImport(plan, res.payload); toast('Import done'); app.refresh(); } catch (e) { console.error(e); toast('Import failed halfway. Re-import your safety backup.', { error: true }); }
  };
  if (text != null) return run(text);                // tests / programmatic use
  pickFile(run);
}

export async function removeAll(app) {
  const { repo } = app, n = repo.listDays().length;
  if (!await confirmDialog({ title: 'Remove all data?', message: `All ${n} ${n === 1 ? 'day' : 'days'}, your metrics, goals and profile are deleted from this device and the cloud. A backup file is downloaded first.`, confirmLabel: 'Delete everything', danger: true, typeToConfirm: 'DELETE' })) return;
  const ids = await cloudIdsOrAbort(app); if (ids === null) return;
  if (!await backupGuard({ kind: 'auto-before-delete', payload: repo.snapshot() })) return toast('Cancelled. Nothing was changed.');
  repo.wipeAll(ids); toast('All data removed'); app.refresh();
}
