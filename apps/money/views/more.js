import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { icon } from '../icons.js';
import { parseBackup, planImport, backupFileName } from '../data/backup.js';
import { cloudDayIds } from '../data/sync.js';
import { entriesToCsv } from '../data/export.js';
import { backupGuard, downloadJSON } from '../components/backup-guard.js';
import { openManageSheet } from './manage.js';
import { openExportSheet } from './export.js';
import { saveBlob } from '../../shared/download.js';
import { promptInstall } from '../data/pwa.js';

const row = (ic, label, onclick, href) => h(href ? 'a' : 'button', { class: 'mrow2', type: href ? null : 'button', href, onclick }, h('span', { html: icon(ic, 22), 'aria-hidden': 'true' }), h('span', {}, label));
const save = (name, text, type) => saveBlob(name, text, type);
const today = () => new Date().toISOString().slice(0, 10);

// Cloud day ids are needed so "replace"/"remove all" also clear the cloud copy; without them old days would come back on the next sync.
async function cloudIdsOrAbort(app) {
  if (!app.remote) { toast('Sign in and go online first, so the cloud copy is changed too.', { error: true }); return null; }
  try { return await cloudDayIds(app.remote); } catch { toast('Could not reach the cloud. Nothing was changed.', { error: true }); return null; }
}

function exportJSON({ repo }) { downloadJSON(backupFileName('backup'), repo.snapshot()); toast('Backup downloaded'); }
function exportCSV({ repo }) {
  const s = repo.settings;
  save(`money-tracker-entries-${today()}.csv`, '\uFEFF' + entriesToCsv({ days: repo.listDays(), expense: s.expense, income: s.income, accounts: s.accounts, catIds: repo.catIds(), defaultAcct: repo.defaultAcct(), now: Date.now() }), 'text/csv;charset=utf-8');
  toast('CSV downloaded');
}

function pickFile(onText) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => { const f = input.files[0]; input.remove(); if (f) onText(await f.text()); });
  document.body.append(input); input.click();
}

async function importBackup(app, mode) {
  const { repo } = app, replace = mode === 'replace';
  pickFile(async text => {
    const res = parseBackup(text); if (!res.ok) return toast(res.error, { error: true });
    const cloudIds = replace ? await cloudIdsOrAbort(app) : [];
    if (cloudIds === null) return;
    const s = repo.settings, local = { days: Object.fromEntries(repo.listDays().map(x => [x.key, x.doc])), expense: s.expense, income: s.income, accounts: s.accounts, goal: s.goal, ledger: s.ledger, debts: s.debts, lastAccounts: s.lastAccounts };
    const plan = planImport({ mode, local, payload: res.payload, cloudDayIds: cloudIds }), m = plan.summary;
    const msg = replace
      ? `Everything is replaced by the file (${m.backupDays} days). ${m.deleteLocal} days on this device and ${m.deleteCloud} in the cloud that are not in the file will be deleted.${res.stats.invalid ? ` ${res.stats.invalid} invalid items in the file are skipped.` : ''}`
      : `${m.newFromBackup} new days are added and ${m.overwritten} existing days are overwritten by the file. Nothing is deleted; ${m.localOnly} days that are only here stay as they are.`;
    if (!await confirmDialog({ title: replace ? 'Replace all data?' : 'Merge backup?', message: msg, confirmLabel: replace ? 'Replace' : 'Merge', danger: replace, typeToConfirm: replace ? 'REPLACE' : null })) return;
    if (!await backupGuard({ kind: 'auto-before-import', payload: repo.snapshot() })) return toast('Cancelled. Nothing was changed.');
    try { repo.applyImport(plan, res.payload); toast('Import done'); app.refresh(); } catch (e) { console.error(e); toast('Import failed halfway. Re-import your safety backup.', { error: true }); }
  });
}

async function removeAll(app) {
  const { repo } = app, n = repo.listDays().length;
  if (!await confirmDialog({ title: 'Remove all data?', message: `All ${n} days, categories, accounts, debts and goal are deleted from this device and the cloud. A backup file is downloaded first.`, confirmLabel: 'Delete everything', danger: true, typeToConfirm: 'DELETE' })) return;
  const ids = await cloudIdsOrAbort(app); if (ids === null) return;
  if (!await backupGuard({ kind: 'auto-before-delete', payload: repo.snapshot() })) return toast('Cancelled. Nothing was changed.');
  repo.wipeAll(ids); toast('All data removed'); app.refresh();
}

export function moreView(el, app) {
  const fs = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {});
  el.replaceChildren(
    h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'More'),
      ...(app.installPrompt ? [row('phone', 'Install app', () => promptInstall(app))] : []),
      row('moon', 'Switch light / dark theme', () => window.MunanTheme?.toggle()), row('expand', 'Toggle fullscreen', fs), row('home', 'Back to Munan.hub', null, '/index.html')),
    h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'Customize'), row('plan', 'Categories & sources', () => openManageSheet(app)), row('calc', 'Show calculator', () => app.calc?.restore())),
    h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'Backup & export'),
      row('download', 'Export report \u2014 Excel / PDF', () => openExportSheet(app)), row('download', 'Download backup (JSON)', () => exportJSON(app)), row('download', 'Export entries (CSV)', () => exportCSV(app)),
      row('upload', 'Import backup \u2014 merge (nothing deleted)', () => importBackup(app, 'merge')), row('upload', 'Import backup \u2014 replace everything', () => importBackup(app, 'replace'))),
    h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'Danger zone'), row('trash', 'Remove all data', () => removeAll(app))));
}
