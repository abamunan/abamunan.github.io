// Full-diary JSON backup. Same envelope as the classic diary's "Backup JSON (all)", so either app can read it.
export function buildBackup(entries, now = new Date()) {
  return { app: 'munan-diary', version: 2, exportedAt: now.toISOString(), count: entries.length, entries };
}
export const backupName = (now = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `munans-diary-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};
