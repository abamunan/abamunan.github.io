import { DAY_COLLECTION, META } from './keys.js';
// Startup pull (one step per splash tick). Anything with an unsent local edit is skipped (store.js).
// Offline / failed steps never throw: the app keeps running on local data and reports the errors.
export async function initialSync(repo, store, onStep = () => {}) {
  const report = { days: 0, errors: [] };
  const step = async (name, fn) => { try { await fn(); } catch (e) { report.errors.push({ name, error: String(e?.message || e) }); } onStep(name); };
  await step('days', async () => { report.days = await store.pullCollection(DAY_COLLECTION, (id, d) => repo.applyRemote.day(id, d)); });
  await step('settings', () => store.pullDoc(META.settings, d => repo.applyRemote.settings(d)));
  return report;
}
export const cloudDayIds = async remote => (await remote.list(DAY_COLLECTION)).map(x => x.id);
