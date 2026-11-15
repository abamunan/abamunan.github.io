import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { saveBlob } from '../../shared/download.js';
import { K } from '../data/keys.js';
import { buildBackup, backupName } from '../data/backup.js';
import { promptInstall } from '../data/pwa.js';
import { openExport } from '../components/export-sheet.js';
import { openRestore } from '../components/restore-sheet.js';
import { openSetPin, openVerifyPin } from '../components/lock-settings.js';
import { AUTO_LOCK } from '../data/lock.js';
import { icon } from '../icons.js';

export function moreView(main, app) {
  const { repo, store } = app;
  const pending = store.pendingCount();
  const when = app.lastSyncMs ? new Date(app.lastSyncMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
  const syncLine = app.mode === 'cloud'
    ? (pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync` : 'Everything is synced') + ` · last sync ${when}`
    : (app.localReason || 'Local only — entries are saved on this device only');

  const syncBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', disabled: app.mode !== 'cloud', html: `${icon('refresh', 18)}<span>Sync now</span>`,
    onclick: async () => {
      syncBtn.disabled = true;
      const r = await app.sync();
      if (r) toast(r.added + r.updated + r.removed ? `Synced · ${r.added} new, ${r.updated} updated, ${r.removed} removed` : 'Already up to date.');
      app.refresh();
    } });

  const backupBtn = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', disabled: !repo.count(), html: `${icon('download', 18)}<span>Download backup (JSON)</span>`,
    onclick: () => { const all = repo.exportAll(); saveBlob(backupName(), JSON.stringify(buildBackup(all), null, 2), 'application/json'); toast(`Backup downloaded — ${all.length} ${all.length === 1 ? 'entry' : 'entries'}.`); } });

  const exportBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', disabled: !repo.count(), html: `${icon('share', 18)}<span>Export PDF / Markdown…</span>`, onclick: () => openExport(app) });

  const clearBtn = h('button', { class: 'ui-btn ui-btn--ghost dy-danger', type: 'button', html: `${icon('trash', 18)}<span>Clear data on this device</span>`,
    onclick: async () => {
      const p = store.pendingCount();
      const ok = await confirmDialog({ title: 'Clear the diary on this device?', danger: true, typeToConfirm: 'CLEAR', confirmLabel: 'Clear',
        message: p ? `${p} change${p === 1 ? ' is' : 's are'} NOT synced yet and will be lost. Entries already in the cloud stay there.`
          : 'Only the copy on this device is removed. Entries in the cloud stay there.' });
      if (!ok) return;
      app.wipeDevice();
    } });

  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
    onchange: () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) openRestore(app, f); } });
  const restoreBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('refresh', 18)}<span>Restore from backup…</span>`, onclick: () => fileIn.click() });

  const lock = app.lock;
  const lockBody = lock.isEnabled()
    ? [h('p', { class: 'dm-note' }, 'On. The diary hides itself when you leave the app. This is a screen lock, not encryption.'),
       h('label', { class: 'dx-l' }, 'Auto-lock', h('select', { class: 'ui-input', 'aria-label': 'Auto-lock', onchange: e => lock.setTimeoutMs(Number(e.target.value)) },
         ...AUTO_LOCK.map(([ms, label]) => h('option', { value: String(ms), selected: ms === lock.timeoutMs() }, label)))),
       h('div', { class: 'dm-links' },
         h('button', { class: 'ui-btn ui-btn--primary', type: 'button', onclick: () => app.lockNow() }, 'Lock now'),
         h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', onclick: async () => {
           if (await openVerifyPin(app, 'Enter your PIN to turn off')) { lock.remove(); toast('App lock is off.'); app.refresh(); } } }, 'Turn off'))]
    : [h('p', { class: 'dm-note' }, 'Hide your diary behind a PIN. This is a screen lock, not encryption: entries on this device are not encrypted.'),
       h('button', { class: 'ui-btn ui-btn--primary', type: 'button', html: `${icon('pin', 18)}<span>Set a PIN</span>`, onclick: async () => { if (await openSetPin(app)) app.refresh(); } })];

  const install = app.installPrompt ? h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('phone', 18)}<span>Install app</span>`, onclick: () => promptInstall(app) }) : null;

  const card = (title, ...kids) => h('section', { class: 'dy-card dm-card' }, h('h2', { class: 'dm-h' }, title), ...kids);
  main.replaceChildren(
    card('Sync', h('p', { class: 'dm-note' }, syncLine), syncBtn),
    card('Backup & export', h('p', { class: 'dm-note' }, `${repo.count()} ${repo.count() === 1 ? 'entry' : 'entries'} on this device. The JSON backup also works with the classic diary.`), backupBtn, restoreBtn, exportBtn, fileIn),
    card('App lock', ...lockBody),
    install ? card('App', install) : null,
    card('This device', h('p', { class: 'dm-note' }, 'Everything is stored locally first, so writing works offline.'), clearBtn),
    card('Other', h('div', { class: 'dm-links' },
      h('a', { class: 'ui-btn ui-btn--ghost', href: '../../diary-classic.html' }, 'Classic diary (fallback)'),
      h('a', { class: 'ui-btn ui-btn--ghost', href: '../../dashboard.html' }, 'Dashboard')),
      h('p', { class: 'dm-note dm-ver' }, 'Diary 2 · Phase 3')));
}
