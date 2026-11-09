import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { saveBlob } from '../../shared/download.js';
import { backupFileName } from '../data/backup.js';
import { buildCsv } from '../domain/report.js';
import { activeGoals } from '../domain/metrics.js';
import { csvFileName } from '../data/report-files.js';
import { openExportSheet } from '../components/export-sheet.js';
import { openSettingsSheet } from '../components/settings-sheet.js';
import { importBackup, removeAll } from '../components/restore.js';
import { promptInstall } from '../data/pwa.js';
import { icon } from '../icons.js';

// One tappable row: icon, label, optional second line. `href` makes it a link instead of a button.
const row = (ic, label, onclick, { sub, href } = {}) => h(href ? 'a' : 'button', { class: 'mrow2', type: href ? null : 'button', href, onclick },
  h('span', { html: icon(ic, 22), 'aria-hidden': 'true' }), h('span', { class: 'mrow__m' }, h('span', {}, label), sub && h('span', { class: 'erow__sub' }, sub)));

export function moreView(el, app) {
  const { repo } = app, days = repo.listDays().length, { metrics, goals, profile } = repo.state;
  const backup = () => { try { saveBlob(backupFileName('backup'), JSON.stringify(repo.snapshot(), null, 2), 'application/json'); toast('Backup downloaded'); } catch (e) { console.error(e); toast('Backup failed', { error: true }); } };
  const csv = () => { try {
    const list = repo.listDays(); if (!list.length) return toast('Nothing logged yet', { error: true });
    saveBlob(csvFileName(), '\uFEFF' + buildCsv(list, metrics), 'text/csv;charset=utf-8');       // BOM so Excel reads \u2713 and Bengali text correctly
    toast('CSV downloaded');
  } catch (e) { console.error(e); toast('CSV export failed', { error: true }); } };
  const nGoals = activeGoals(goals, metrics).length, pinned = metrics.filter(m => m.pinned).length;
  el.replaceChildren(
    ...(app.installPrompt ? [h('section', { class: 'card' }, h('h2', { class: 'card__h' }, 'App'), row('phone', 'Install app', () => promptInstall(app), { sub: 'Add Health Tracker to your home screen' }))] : []),
    h('section', { class: 'card', 'aria-labelledby': 'st-h' }, h('h2', { id: 'st-h', class: 'card__h' }, 'Settings'),
      row('list', 'Metrics', () => openSettingsSheet(app, 'metrics'), { sub: `${metrics.length} ${metrics.length === 1 ? 'metric' : 'metrics'} \u00B7 ${pinned} pinned` }),
      row('target', 'Goals', () => openSettingsSheet(app, 'goals'), { sub: nGoals ? `${nGoals} ${nGoals === 1 ? 'goal' : 'goals'} set` : 'None set yet' }),
      row('user', 'Profile', () => openSettingsSheet(app, 'profile'), { sub: profile.height > 0 && profile.age > 0 ? `${profile.height} cm \u00B7 ${profile.age} years` : 'Not set: needed for BMI and calories' })),
    h('section', { class: 'card', 'aria-labelledby': 'ex-h' }, h('h2', { id: 'ex-h', class: 'card__h' }, 'Export'),
      h('p', { class: 'card__p' }, 'Monthly or yearly report as Excel or PDF, a printable day, or every logged day as one CSV file.'),
      h('div', { class: 'hactions' }, h('button', { type: 'button', class: 'ui-btn ui-btn--primary', onclick: () => openExportSheet(app) }, 'Export report\u2026'),
        h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: csv }, 'CSV (all days)'))),
    h('section', { class: 'card', 'aria-labelledby': 'bk-h' }, h('h2', { id: 'bk-h', class: 'card__h' }, 'Backup & restore'),
      h('p', { class: 'card__p' }, `${days} ${days === 1 ? 'day' : 'days'} logged on this device. The file holds your days, metrics, goals and profile.`),
      h('button', { type: 'button', class: 'ui-btn ui-btn--primary', onclick: backup }, h('span', { html: icon('download', 18) }), ' Download backup (JSON)'),
      row('upload', 'Restore \u2014 merge', () => importBackup(app, 'merge'), { sub: 'Adds and updates days from a file. Nothing is deleted.' }),
      row('upload', 'Restore \u2014 replace everything', () => importBackup(app, 'replace'), { sub: 'Makes this device and the cloud match the file exactly.' })),
    h('section', { class: 'card', 'aria-labelledby': 'dz-h' }, h('h2', { id: 'dz-h', class: 'card__h' }, 'Danger zone'), row('trash', 'Remove all data', () => removeAll(app), { sub: 'A backup file is downloaded first.' })));
}
