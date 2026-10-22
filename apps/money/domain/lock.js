// Day lock. A day auto-locks 2 days after its date; a manual `locked` flag overrides either way.
// "Unlock to edit" is an in-memory permission for ONE edit session: it never rewrites `locked`,
// so after saving, an auto-locked day is locked again, a manual lock stays, and days inside the
// 2-day window are never locked unless the user locked them.
export const AUTO_LOCK_AFTER_DAYS = 2;
export function computeAutoLocked(y, m0, d, today = new Date()) {
  const a = new Date(y, m0, d); a.setHours(0, 0, 0, 0);
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  return Math.round((t - a) / 86400000) >= AUTO_LOCK_AFTER_DAYS;
}
export const isDayLocked = (y, m0, d, doc, today) => typeof doc?.locked === 'boolean' ? doc.locked : computeAutoLocked(y, m0, d, today);
export const setManualLock = (doc, locked) => ({ ...doc, locked: !!locked });      // the explicit lock/unlock button
export class LockedError extends Error { constructor() { super('Day is locked'); this.name = 'LockedError'; } }
