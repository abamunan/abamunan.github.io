import { confirmDialog } from '../../shared/confirm.js';
import { toast } from '../../shared/toast.js';
import { LockedError } from '../domain/lock.js';
export const confirmUnlock = () => confirmDialog({ title: 'This day is locked', message: 'Unlock it for this one change? It locks again automatically after saving.', confirmLabel: 'Unlock for this change' });
// e needs {y,m0,d,id}. Undo restores the exact entry (same id + time).
export async function deleteWithUndo(repo, e, onDone) {
  let removed;
  try { removed = (await repo.deleteEntry(e.y, e.m0, e.d, e.id)).removed; }
  catch (err) {
    if (err instanceof LockedError) { if (!(await confirmUnlock())) return false; try { removed = (await repo.deleteEntry(e.y, e.m0, e.d, e.id, { unlocked: true })).removed; } catch (e2) { toast(e2.message, { error: true }); return false; } }
    else { toast(err.message, { error: true }); return false; }
  }
  onDone?.();
  toast('Entry deleted', { action: 'Undo', onAction: async () => { try { await repo.restoreEntry(e.y, e.m0, e.d, removed, { unlocked: true }); onDone?.(); } catch (x) { toast(x.message, { error: true }); } } });
  return true;
}
