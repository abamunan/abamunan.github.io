import { confirmDialog } from '../../shared/confirm.js';
import { saveBlob } from '../../shared/download.js';
import { parseBackup, backupFileName } from '../data/backup.js';
export const downloadJSON = (name, obj) => saveBlob(name, JSON.stringify(obj, null, 2), 'application/json');
// Used by repo.ensureBackup (and later import/remove-all). Verifies the JSON re-parses with the same day count, downloads it,
// then makes the user confirm the file really saved (browsers can't tell us). Cancel → false → the write is aborted.
export async function backupGuard({ kind, payload }) {
  const check = parseBackup(JSON.stringify(payload));
  if (!check.ok || check.stats.days !== Object.keys(payload.days || {}).length) return false;
  const name = backupFileName(kind); downloadJSON(name, payload);
  return confirmDialog({ title: 'Safety backup downloaded?', message: `${check.stats.days} ${check.stats.days === 1 ? 'day was' : 'days were'} saved to ${name}. Check your Downloads, then continue. Nothing is changed until you confirm.`, confirmLabel: 'File saved \u2014 continue', cancelLabel: 'Cancel' });
}
