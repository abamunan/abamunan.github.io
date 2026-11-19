import assert from 'node:assert/strict';
const mem = {}; const ls = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, get length() { return Object.keys(mem).length; }, key: i => Object.keys(mem)[i] };
globalThis.window = { localStorage: ls, addEventListener() {} }; Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const reset = () => Object.keys(mem).forEach(k => delete mem[k]);
const { createStore } = await import('../../shared/store.js');
const { reconcile } = await import('../domain/reconcile.js');
const { addEntry, updateEntry, deleteEntry, restoreEntry } = await import('../domain/entries.js');
const { isDayLocked, LockedError } = await import('../../shared/lock.js');
const { monthTotals, accountBalances, budgetRows, goalProgress } = await import('../domain/totals.js');
const PL = await import('../domain/plan.js');
const IN = await import('../domain/insights.js');
const CT = await import('../domain/categories.js');
const RP = await import('../domain/report.js');
const RF = await import('../data/report-files.js');
const XL = await import('../data/xlsx.js');
const CA = await import('../domain/calc.js');
const { round2 } = await import('../../shared/fmt.js');
const { createRepo } = await import('../data/storage.js');
const { parseBackup, planImport, buildBackup } = await import('../data/backup.js');
const { initialSync } = await import('../data/sync.js');
const { legacyBalances, oldVersionSave, legacyGoalSaved } = await import('./oracle.js');
let n = 0; const t = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('  ok', name); });
const CATS = ['lunch', 'dinner', 'transport', 'self']; const EXP = ['lunch', 'dinner', 'transport'], INC = ['self'];
const ctx = { catIds: CATS, defaultAcct: 'cash', now: 1000, idGen: p => p + '_' + (++ctx._i), _i: 0 };
const flatSumOk = doc => CATS.every(c => Math.abs((doc[c] || 0) - (doc.entries || []).filter(e => e.cat === c).reduce((s, e) => s + e.amt, 0)) < 0.005);

await t('reconcile: legacy day → one adjustment per category, flat untouched, idempotent', () => {
  const legacy = { lunch: 150, note_lunch: 'biryani', acct_lunch: 'bkash', ts_lunch: 555, self: 500, dinner: 0 };
  const r = reconcile(legacy, CATS, ctx);
  assert.equal(r.changed, true); assert.equal(r.doc.lunch, 150); assert.equal(r.doc.self, 500);
  assert.equal(r.doc.entries.length, 2); const l = r.doc.entries.find(e => e.cat === 'lunch');
  assert.deepEqual([l.amt, l.acct, l.note, l.ts, l.adj], [150, 'bkash', 'biryani', 555, true]); assert.ok(flatSumOk(r.doc));
  assert.equal(reconcile(r.doc, CATS, ctx).changed, false);
  assert.deepEqual(reconcile({}, CATS, ctx).doc, {}); assert.equal(reconcile({ lunch: 0 }, CATS, ctx).changed, false);   // nothing written for empty days
});
await t('add/update/delete/undo keep flat + entries in sync (notes joined with ·, first entry account)', () => {
  let d = addEntry({}, { cat: 'lunch', amt: 100, acct: 'cash', note: 'rice', ts: 10 }, ctx).doc;
  const e2 = addEntry(d, { cat: 'lunch', amt: 50, acct: 'bkash', note: 'tea', ts: 20 }, ctx); d = e2.doc;
  assert.equal(d.lunch, 150); assert.equal(d.note_lunch, 'rice \u00B7 tea'); assert.equal(d.acct_lunch, 'cash'); assert.equal(d.ts_lunch, 20); assert.ok(flatSumOk(d));
  d = updateEntry(d, e2.entry.id, { amt: 70, cat: 'dinner' }, ctx).doc; assert.equal(d.lunch, 100); assert.equal(d.dinner, 70); assert.ok(flatSumOk(d));
  const del = deleteEntry(d, e2.entry.id, ctx); assert.equal(del.doc.dinner, 0); assert.equal('note_dinner' in del.doc, false); assert.ok(flatSumOk(del.doc));
  const back = restoreEntry(del.doc, del.removed, ctx).doc; assert.deepEqual(back, d);                                   // Undo restores exactly
  assert.throws(() => addEntry({}, { cat: 'lunch', amt: 0 }, ctx)); assert.throws(() => addEntry({}, { cat: 'zzz', amt: 5 }, ctx));
});
await t('old version overwrites a day (entries dropped): totals survive as ONE adjustment', () => {
  let d = addEntry(addEntry({}, { cat: 'lunch', amt: 100, acct: 'cash', note: 'a', ts: 1 }, ctx).doc, { cat: 'lunch', amt: 50, acct: 'bkash', note: 'b', ts: 2 }, ctx).doc;
  const old = oldVersionSave(d, { lunch: 120 }, CATS);            // old app edits lunch 150 → 120, entries vanish
  assert.equal('entries' in old, false); const r = reconcile(old, CATS, ctx);
  assert.equal(r.doc.lunch, 120); assert.deepEqual(r.doc.entries.map(e => [e.cat, e.amt, e.adj]), [['lunch', 120, true]]); assert.ok(flatSumOk(r.doc));
  const edited = { ...d, lunch: 120 };                            // flat edited while entries still present → negative adjustment
  const r2 = reconcile(edited, CATS, ctx); assert.equal(r2.doc.entries.find(e => e.adj).amt, -30); assert.ok(flatSumOk(r2.doc));
  const acctEdit = reconcile({ ...reconcile({ lunch: 80, acct_lunch: 'cash' }, CATS, ctx).doc, acct_lunch: 'card' }, CATS, ctx);   // old app changed only the account
  assert.equal(acctEdit.doc.entries[0].acct, 'card');
});
await t('lock rules', () => {
  const today = new Date(2026, 9, 7);
  assert.equal(isDayLocked(2026, 9, 7, {}, today), false); assert.equal(isDayLocked(2026, 9, 6, {}, today), false); assert.equal(isDayLocked(2026, 9, 5, {}, today), true);
  assert.equal(isDayLocked(2026, 9, 5, { locked: false }, today), false); assert.equal(isDayLocked(2026, 9, 7, { locked: true }, today), true);
});
await t('equivalence with legacy: balances + month totals on 120 random days', () => {
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const accounts = [{ id: 'cash', opening: 500 }, { id: 'bkash', opening: 0 }, { id: 'card', opening: 100 }];
  const days = []; const byDay = {};
  for (let d = 1; d <= 120; d++) { const doc = {}; [...EXP, ...INC].forEach(c => { if (rnd() < .5) { doc[c] = Math.round(rnd() * 900) / 4; doc['acct_' + c] = ['cash', 'bkash', 'card'][Math.floor(rnd() * 3)]; } }); days.push(doc); byDay[d] = doc; }
  const debts = [{ type: 'lent', amount: 300, accountId: 'cash', settled: false }, { type: 'borrowed', amount: 200, accountId: 'bkash', settled: false }, { type: 'lent', amount: 9, accountId: 'cash', settled: true }];
  const ledger = [{ type: 'add', accountId: 'cash', amount: 50 }, { type: 'transfer', fromId: 'cash', toId: 'card', amount: 75 }];
  const a = accountBalances({ accounts, days, ledger, debts, expIds: EXP, incIds: INC, defaultAcct: 'cash' });
  assert.deepEqual(a, legacyBalances({ accounts, days, ledger, debts, expIds: EXP, incIds: INC }));
  const m = monthTotals((y, mo, d) => byDay[d], 2026, 0, EXP, INC);                 // January: days 1..31
  let e = 0, i = 0; for (let d = 1; d <= 31; d++) { EXP.forEach(c => e += byDay[d][c] || 0); INC.forEach(c => i += byDay[d][c] || 0); }
  assert.equal(m.totalExp, Math.round(e * 100) / 100); assert.equal(m.totalInc, Math.round(i * 100) / 100);
  const split = { lunch: 150, acct_lunch: 'cash' }; const split2 = addEntry(addEntry({}, { cat: 'lunch', amt: 100, acct: 'cash', ts: 1 }, ctx).doc, { cat: 'lunch', amt: 50, acct: 'bkash', ts: 2 }, ctx).doc;
  const nb = accountBalances({ accounts: [{ id: 'cash' }, { id: 'bkash' }], days: [split2], expIds: EXP, incIds: INC, defaultAcct: 'cash' });
  assert.deepEqual([nb.cash, nb.bkash], [-100, -50]);                               // new: per-entry account (old app would say cash −150; documented)
  assert.deepEqual(budgetRows({ expenseCats: [{ id: 'lunch', budget: 1000, label: 'L', icon: '' }], catTotals: { lunch: 850 }, y: 2026, m0: 0, today: new Date(2026, 0, 31) })[0].state, 'warn');
});
// ---------- repo end-to-end ----------
const cloud = {}; let failRemote = false;
const remote = { async set(p, d) { if (failRemote) throw new Error('offline'); cloud[p] = JSON.parse(JSON.stringify(d)); }, async del(p) { if (failRemote) throw new Error('offline'); delete cloud[p]; },
  async get(p) { if (failRemote) throw new Error('offline'); return cloud[p] ?? null; }, async list(c) { if (failRemote) throw new Error('offline'); return Object.entries(cloud).filter(([p]) => p.startsWith(c + '/')).map(([p, d]) => ({ id: p.slice(c.length + 1), data: d })); } };
const mk = (guard) => { const store = createStore({ outboxKey: 'mt2_outbox_v1', remote }); return { store, repo: createRepo({ store, backupGuard: guard, today: () => new Date(2026, 9, 7), now: () => 5000 }) }; };
const settle = () => new Promise(r => setTimeout(r, 30));
await t('repo: lazy migration asks for a backup once per day; failed backup changes nothing', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); let calls = 0, ok = false;
  const { store, repo } = mk(async ({ kind, payload }) => { calls++; assert.equal(kind, 'auto-before-migration'); assert.ok(payload.days); return ok; });
  store.set('mt_2026_10_7', { lunch: 150, acct_lunch: 'bkash', note_lunch: 'old' });
  const before = JSON.stringify(store.get('mt_2026_10_7'));
  await assert.rejects(() => repo.addEntry(2026, 9, 7, { cat: 'dinner', amt: 80 }), /backup failed/); assert.equal(JSON.stringify(store.get('mt_2026_10_7')), before);
  ok = true; const r = await repo.addEntry(2026, 9, 7, { cat: 'dinner', amt: 80, acct: 'card' }); assert.equal(calls, 2);
  assert.equal(r.doc.dinner, 80); assert.equal(r.doc.lunch, 150); assert.ok(flatSumOk(r.doc)); assert.equal(repo.settings.lastAccounts.dinner, 'card');
  store.set('mt_2026_10_6', { lunch: 20 }); await repo.addEntry(2026, 9, 6, { cat: 'transport', amt: 10 }); assert.equal(calls, 2);    // same day → no 2nd backup
  await settle(); assert.ok(cloud['moneytracker/2026_10_7'].entries.length === 2); assert.ok(cloud['moneytracker_meta/settings'].lastAccounts);   // synced + new field only in settings doc
  assert.equal(repo.resolveAccount('dinner'), 'card'); assert.equal(repo.resolveAccount('lunch'), 'cash');
  repo.saveSettings({ expense: repo.settings.expense.map(f => f.id === 'dinner' ? { ...f, defaultAcct: 'bkash' } : f) }); assert.equal(repo.resolveAccount('dinner'), 'bkash');   // category default wins
});
await t('repo: lock enforced; edit session never rewrites the lock flag', async () => {
  reset(); const { store, repo } = mk(async () => true);
  store.set('mt_2026_10_1', { lunch: 40 });                                    // 6 days old → auto-locked
  await assert.rejects(() => repo.addEntry(2026, 9, 1, { cat: 'lunch', amt: 5 }), LockedError);
  await repo.addEntry(2026, 9, 1, { cat: 'lunch', amt: 5 }, { unlocked: true }); assert.equal('locked' in store.get('mt_2026_10_1'), false); assert.equal(isDayLocked(2026, 9, 1, store.get('mt_2026_10_1'), new Date(2026, 9, 7)), true);
  store.set('mt_2026_10_2', { lunch: 1, locked: true }); await repo.addEntry(2026, 9, 2, { cat: 'lunch', amt: 5 }, { unlocked: true }); assert.equal(store.get('mt_2026_10_2').locked, true);
  store.set('mt_2026_10_3', { lunch: 1, locked: false }); await repo.addEntry(2026, 9, 3, { cat: 'lunch', amt: 5 }); assert.equal(store.get('mt_2026_10_3').locked, false);
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 5 }); assert.equal('locked' in store.get('mt_2026_10_7'), false);       // today: never auto-locked
  repo.setManualLock(2026, 9, 7, true); await assert.rejects(() => repo.deleteEntry(2026, 9, 7, 'x'), LockedError);
  repo.setManualLock(2026, 9, 7, false); await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 5 }); assert.equal(store.get('mt_2026_10_7').locked, false);
});
await t('repo: moveEntry between days (and rollback target on failure)', async () => {
  reset(); const { store, repo } = mk(async () => true); const a = await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 30, note: 'x' });
  await repo.moveEntry([2026, 9, 7], [2026, 9, 6], a.entry.id, { amt: 35 }); assert.equal(store.get('mt_2026_10_7').lunch, 0); assert.equal(store.get('mt_2026_10_6').lunch, 35);
  store.set('mt_2026_9_1', { lunch: 1, locked: true });
  await assert.rejects(() => repo.moveEntry([2026, 9, 6], [2026, 8, 1], a.entry.id), LockedError); assert.equal(store.get('mt_2026_10_6').lunch, 35);
});
await t('import: Merge (backup wins on shared days, one-sided untouched) and Replace (deletes + counts)', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { store, repo } = mk(async () => true);
  store.set('mt_2026_10_1', { lunch: 10 }); store.set('mt_2026_10_2', { lunch: 20 });
  const legacy = JSON.stringify({ version: 1, exportedAt: 'x', categories: { expense: repo.settings.expense, income: repo.settings.income }, goal: 700, accounts: [...repo.settings.accounts, { id: 'bank', label: 'Bank', icon: 'b', opening: 5 }], ledger: [], debts: [{ id: 'd1', type: 'lent', person: 'A', amount: 5, accountId: 'cash', settled: false }], days: { mt_2026_10_2: { lunch: 99 }, mt_2026_10_3: { lunch: 30 }, bad_key: { lunch: 1 } } });
  const parsed = parseBackup(legacy); assert.equal(parsed.ok, true); assert.deepEqual(parsed.stats, { days: 2, invalid: 1 });
  assert.equal(parseBackup('nope').ok, false); assert.equal(parseBackup('[]').ok, false); assert.equal(parseBackup('{"a":1}').ok, false);
  const local = () => ({ days: Object.fromEntries(repo.listDays().map(x => [x.key, x.doc])), ...repo.settings });
  const merge = planImport({ mode: 'merge', local: local(), payload: parsed.payload, cloudDayIds: ['2026_10_1', '2026_10_2', '2026_9_9'] });
  assert.deepEqual(merge.summary, { mode: 'merge', backupDays: 2, overwritten: 1, newFromBackup: 1, localOnly: 1, deleteLocal: 0, deleteCloud: 0 });
  const rep = planImport({ mode: 'replace', local: local(), payload: parsed.payload, cloudDayIds: ['2026_10_1', '2026_10_2', '2026_9_9'] });
  assert.deepEqual([rep.summary.deleteLocal, rep.summary.deleteCloud, rep.deleteCloudDayIds], [1, 2, ['2026_10_1', '2026_9_9']]);
  repo.applyImport(merge, parsed.payload); assert.deepEqual([store.get('mt_2026_10_1').lunch, store.get('mt_2026_10_2').lunch, store.get('mt_2026_10_3').lunch], [10, 99, 30]);
  assert.equal(repo.settings.accounts.length, 4); assert.equal(repo.settings.goal, 700); assert.equal(repo.settings.debts.length, 1);
  repo.applyImport(rep, parsed.payload); assert.equal(store.get('mt_2026_10_1'), null); await settle();
  assert.equal(cloud['moneytracker/2026_10_1'], undefined); assert.equal(cloud['moneytracker/2026_10_3'].lunch, 30);
  const out = buildBackup({ ...repo.settings, days: {} }); assert.deepEqual(Object.keys(out), ['version', 'exportedAt', 'categories', 'goal', 'accounts', 'ledger', 'debts', 'days']);   // same keys/order as legacy export
});
await t('sync: cloud never overwrites an unsent local edit; offline sync reports errors, does not throw', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); failRemote = true; const { store, repo } = mk(async () => true);
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 100 });                        // stays in the outbox (offline)
  cloud['moneytracker/2026_10_7'] = { lunch: 1 }; cloud['moneytracker/2026_10_8'] = { lunch: 2 }; cloud['moneytracker_meta/debts'] = { items: [{ id: 'z', type: 'lent', amount: 1, person: 'p' }] };
  const steps = []; const off = await initialSync(repo, store, s => steps.push(s)); assert.equal(off.errors.length, 3); assert.equal(off.errors.some(e => e.name === 'settings'), false);   // settings write is pending → skipped, not pulled assert.deepEqual(steps, ['days', 'settings', 'ledger', 'debts']);
  failRemote = false; const on = await initialSync(repo, store, () => {}); assert.equal(on.errors.length, 0);
  assert.equal(store.get('mt_2026_10_7').lunch, 100); assert.equal(store.get('mt_2026_10_8').lunch, 2); assert.equal(repo.settings.debts.length, 1);
  await store.flush(); await settle(); assert.equal(cloud['moneytracker/2026_10_7'].lunch, 100);
});
await t('H1: an entry never keeps an account that does not exist (add, update, stored orphans, view rows, CSV)', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { store, repo } = mk(async () => true);
  const { accountModel } = await import('../domain/viewmodels.js'); const { entriesToCsv } = await import('../data/export.js');
  const total = () => accountModel(repo, 'cash').total;
  assert.equal(total(), 0);
  // add: a ghost account (deleted account / stale template / bad import) falls back to the default account
  const a = await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 100, acct: 'ghost' }); assert.equal(a.entry.acct, 'cash'); assert.equal(total(), -100, '100 spent is not lost');
  // a real account is kept
  const b = await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 40, acct: 'bkash' }); assert.equal(b.entry.acct, 'bkash');
  // update: moving to a ghost account falls back, moving to a real one works
  const u = await repo.updateEntry(2026, 9, 7, b.entry.id, { acct: 'ghost' }); assert.equal(u.entry.acct, 'cash'); assert.equal(total(), -140);
  const u2 = await repo.updateEntry(2026, 9, 7, b.entry.id, { acct: 'bkash' }); assert.equal(u2.entry.acct, 'bkash'); assert.equal(total(), -140, 'total is the same wherever the money sits');
  // undo (restore) of an entry whose account was deleted meanwhile
  const del = await repo.deleteEntry(2026, 9, 7, b.entry.id); await repo.restoreEntry(2026, 9, 7, { ...del.removed, acct: 'gone' }); assert.equal(total(), -140);
  // orphans ALREADY stored (old data, old import): entries[].acct and legacy flat acct_*
  store.set('mt_2026_10_5', { entries: [{ id: 'o1', cat: 'lunch', amt: 60, acct: 'ghost', note: '', ts: 1 }], lunch: 60, acct_lunch: 'ghost', ts_lunch: 1 });
  store.set('mt_2026_10_4', { lunch: 25, acct_lunch: 'ghost2', ts_lunch: 1 }); repo.load();
  assert.equal(total(), -225, 'stored orphan entries count in the total');
  const cashRows = accountModel(repo, 'cash').entries; assert.ok(cashRows.some(e => e.id === 'o1') && cashRows.every(e => e.acct === 'cash'), 'orphans are listed under the default account');
  assert.deepEqual([accountModel(repo, 'cash').balance, accountModel(repo, 'bkash').balance], [-225, 0], 'every taka sits in exactly one account');
  const csv = entriesToCsv({ days: repo.listDays(), expense: repo.settings.expense, income: repo.settings.income, accounts: repo.settings.accounts, catIds: repo.catIds(), defaultAcct: repo.defaultAcct(), now: 1 });
  assert.ok(!/ghost/.test(csv), 'CSV shows the account name, not a raw missing id');
  // a caller that passes no acctIds behaves exactly as before
  const { addEntry: rawAdd } = await import('../domain/entries.js'); assert.equal(rawAdd({}, { cat: 'lunch', amt: 5, acct: 'anything' }, { catIds: ['lunch'], defaultAcct: 'cash', now: 1 }).entry.acct, 'anything');
  assert.equal(rawAdd({}, { cat: 'lunch', amt: 5 }, { catIds: ['lunch'], acctIds: ['cash'], defaultAcct: 'cash', now: 1 }).entry.acct, 'cash');
});
await t('H2: deleting an account moves its history; the total never changes; failures change nothing', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); let guardCalls = 0, guardOk = true; const { store, repo } = mk(async () => { guardCalls++; return guardOk; });
  const { accountModel } = await import('../domain/viewmodels.js'); const total = () => accountModel(repo, 'cash').total, bal = id => accountModel(repo, 'cash').accounts.find(a => a.id === id)?.balance;
  const bank = repo.addAccount({ label: 'Bank', icon: 'b' }); repo.updateAccount('bkash', { opening: 300 });
  await repo.addEntry(2026, 9, 7, { cat: 'self', amt: 5000, acct: 'bkash' }); await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 200, acct: 'cash' });
  store.set('mt_2026_9_1', { lunch: 40, acct_lunch: 'bkash', ts_lunch: 1, locked: true });                  // old-format, locked day
  repo.addBalance('bkash', 100); repo.addTransfer('cash', 'bkash', 70); repo.addTransfer('bkash', bank.id, 25); repo.addDebt({ type: 'lent', person: 'Rafi', amount: 60, accountId: 'bkash' });
  repo.saveSettings({ lastAccounts: { self: 'bkash' }, expense: repo.settings.expense.map(f => (f.id === 'lunch' ? { ...f, defaultAcct: 'bkash' } : f)) }); repo.addTemplate({ label: 'Salary', cat: 'self', amt: 5000, acct: 'bkash' });
  const cashOpeningBefore = repo.settings.accounts.find(a => a.id === 'cash').opening || 0, before = total(), cashBefore = bal('cash'), bankBefore = bal(bank.id), bkashBefore = bal('bkash'); assert.equal(before, 300 + 5000 - 200 - 40 + 100 - 60);
  // invalid request: no backup prompt, nothing changes
  await assert.rejects(() => repo.deleteAccount('bkash', 'bkash'), /move its history/); await assert.rejects(() => repo.deleteAccount('bkash', 'nope'), /move its history/); await assert.rejects(() => repo.deleteAccount('bkash'), /move its history/); assert.equal(guardCalls, 0);
  // failed safety backup: nothing changes
  guardOk = false; await assert.rejects(() => repo.deleteAccount('bkash', 'cash'), /backup failed/); assert.equal(repo.settings.accounts.some(a => a.id === 'bkash'), true); assert.equal(total(), before);
  assert.equal(store.get('mt_2026_10_7').entries.find(e => e.cat === 'self').acct, 'bkash'); assert.equal(store.get('mt_ledger_v1').length, 3);
  // real delete: bKash -> Cash
  guardOk = true; guardCalls = 0; const r = await repo.deleteAccount('bkash', 'cash'); assert.equal(guardCalls, 1);
  assert.deepEqual([r.debts, r.ledger, r.dropped, r.days, r.entries], [1, 2, 1, 2, 2], 'moved: 1 debt, 2 ledger events (add + transfer to bank), 1 cash<->bkash transfer dropped, 2 days, 2 entries');
  assert.equal(repo.settings.accounts.some(a => a.id === 'bkash'), false); assert.equal(total(), before, 'the total is exactly the same after deleting the account');
  assert.equal(bal('cash'), round2(cashBefore + bkashBefore), 'cash now holds what cash and bKash held together');
  assert.equal(bal(bank.id), bankBefore, 'bank balance unchanged');
  assert.equal(store.get('mt_2026_10_7').entries.find(e => e.cat === 'self').acct, 'cash'); assert.equal(store.get('mt_2026_9_1').acct_lunch, 'cash'); assert.equal(store.get('mt_2026_9_1').locked, true, 'locked day stays locked');
  assert.deepEqual(store.get('mt_ledger_v1').map(e => [e.type, e.accountId ?? `${e.fromId}>${e.toId}`]), [['add', 'cash'], ['transfer', `cash>${bank.id}`]]);
  assert.equal(store.get('mt_debts_v1')[0].accountId, 'cash'); assert.equal(repo.settings.accounts.find(a => a.id === 'cash').opening, cashOpeningBefore + 300, "bKash's opening balance was added to Cash");
  assert.equal(repo.settings.lastAccounts.self, 'cash'); assert.equal(repo.settings.expense.find(f => f.id === 'lunch').defaultAcct, 'cash'); assert.equal(repo.listTemplates()[0].acct, 'cash');
  // nothing in storage still mentions the deleted account (days, ledger, debts, settings, templates)
  assert.ok(!Object.keys(mem).filter(k => /^mt_|^mt2_templates/.test(k)).some(k => mem[k].includes('"bkash"')), 'no stored key still references the deleted account');
  await store.flush(); await settle(); assert.ok(!JSON.stringify(cloud).includes('"bkash"'), 'the cloud copy was updated too');
  // the last account can never be deleted
  await repo.deleteAccount('card', 'cash'); await repo.deleteAccount(bank.id, 'cash'); await assert.rejects(() => repo.deleteAccount('cash', 'cash'), /At least one/);
});
await t('H3: a category with data is archived, not deleted; totals, balances, CSV agree; old orphans can be restored', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { store, repo } = mk(async () => true);
  const { accountModel } = await import('../domain/viewmodels.js'); const { entriesToCsv } = await import('../data/export.js'); const CT3 = await import('../domain/categories.js');
  const total = () => accountModel(repo, 'cash').total, csv = () => entriesToCsv({ days: repo.listDays(), expense: repo.settings.expense, income: repo.settings.income, accounts: repo.settings.accounts, catIds: repo.catIds(), defaultAcct: repo.defaultAcct(), now: 1 });
  const gift = repo.addCategory('expense', { label: 'Present', icon: 'g' }); await repo.addEntry(2026, 9, 7, { cat: gift.id, amt: 700 }); await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 100 });
  assert.equal(total(), -800);
  // deleting is refused while data exists (this is what used to turn -800 into -100); the CSV still has the row
  assert.throws(() => repo.deleteCategory('expense', gift.id), /Archive it instead/); assert.equal(total(), -800); assert.ok(csv().includes('Present'));
  // archive: flag set, everything still counts, nothing else changes
  repo.updateCategory('expense', gift.id, { archived: true }); assert.equal(repo.settings.expense.find(f => f.id === gift.id).archived, true);
  assert.equal(total(), -800, 'archiving does not change the total'); assert.ok(csv().includes('Present') && !csv().includes(gift.id), 'CSV shows the archived category by name');
  assert.equal(repo.getDay(2026, 9, 7)[gift.id], 700); repo.updateCategory('expense', gift.id, { archived: false }); assert.equal(repo.settings.expense.find(f => f.id === gift.id).archived, undefined);
  // an unused category can still be deleted; the last active one cannot be archived or deleted
  const tmp = repo.addCategory('expense', { label: 'Temp' }); repo.deleteCategory('expense', tmp.id); assert.equal(repo.catIds().includes(tmp.id), false);
  const incs = repo.settings.income.map(f => f.id); incs.slice(1).forEach(id => repo.updateCategory('income', id, { archived: true })); assert.throws(() => repo.updateCategory('income', incs[0], { archived: true }), /At least one must stay active/); assert.throws(() => repo.deleteCategory('income', incs[0]), /At least one income/);
  // an archived category can be deleted when it has no data, and never makes the "at least one" rule pass by counting archived ones
  assert.throws(() => CT3.deleteCategory([{ id: 'a' }, { id: 'b', archived: true }], 'expense', 'a'), /At least one expense/);
  // old orphans (categories deleted by an older version): found in entries[] and in old-format flat fields, not confused with other fields
  store.set('mt_2026_9_2', { entries: [{ id: 'e1', cat: 'oldcat', amt: 55, acct: 'cash', note: '', ts: 1 }], oldcat: 55, ts_oldcat: 1, acct_oldcat: 'cash' });
  store.set('mt_2026_9_3', { flatcat: 25, ts_flatcat: 1, acct_flatcat: 'cash', locked: true, someNumber: 7 }); repo.load();
  assert.deepEqual(repo.orphanCategories(), [{ id: 'flatcat', days: 1, total: 25 }, { id: 'oldcat', days: 1, total: 55 }], 'orphans found once per day; unrelated numeric fields ignored');
  assert.equal(total(), -800, 'orphans are invisible before restore');
  const back = repo.restoreCategory('expense', 'oldcat', 'Old things'); assert.deepEqual([back.archived, back.budget, back.id], [true, 0, 'oldcat']); assert.equal(total(), -855, 'restored data counts again');
  assert.deepEqual(repo.orphanCategories().map(o => o.id), ['flatcat']); assert.throws(() => repo.restoreCategory('expense', 'flatcat', 'gift'), /already have/); assert.throws(() => repo.restoreCategory('expense', 'oldcat', 'Zzz'), /Already in the list/);
  // an archived flag survives a backup round trip and an import
  const parsed = parseBackup(JSON.stringify({ version: 1, exportedAt: 'x', categories: { expense: repo.settings.expense, income: repo.settings.income }, goal: 0, accounts: repo.settings.accounts, ledger: [], debts: [], days: {} })); assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.categories.expense.find(f => f.id === 'oldcat').archived, true);
});
await t('H4: Accounts history explains the balance: opening + Money in - Money out = balance, for every account', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { store, repo } = mk(async () => true);
  const { accountModel } = await import('../domain/viewmodels.js'); let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const bank = repo.addAccount({ label: 'Bank', icon: 'b' }); repo.updateAccount('cash', { opening: 250.5 }); repo.updateAccount('bkash', { opening: -40 });
  const check = why => { for (const a of repo.settings.accounts) { const m = accountModel(repo, a.id); assert.equal(round2(m.opening + m.income - m.expense), m.balance, `${why}: ${a.id}`); assert.equal(m.rows.length, m.entries.length + m.moves.length); } };
  check('empty');
  await repo.addEntry(2026, 9, 7, { cat: 'self', amt: 5000, acct: 'bkash' }); await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 200, acct: 'cash' }); await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 33, acct: 'ghost' });   // ghost -> default account
  repo.addBalance('cash', 1000); repo.addTransfer('cash', 'bkash', 1000); repo.addTransfer('bkash', bank.id, 25.75);
  repo.addDebt({ type: 'lent', person: 'Rafi', amount: 60, accountId: 'bkash' }); repo.addDebt({ type: 'borrowed', person: 'Mina', amount: 90, accountId: bank.id }); const done = repo.addDebt({ type: 'lent', person: 'Old', amount: 11, accountId: 'cash' });
  repo.setDebtSettled(repo.settings.debts[2].id, true); check('scenario');
  const cash = accountModel(repo, 'cash'), bk = accountModel(repo, 'bkash'), bn = accountModel(repo, bank.id);
  assert.deepEqual(cash.moves.map(x => x.label).sort(), ['Money added', 'Transfer to bKash'], 'Cash: Add money and the outgoing transfer are listed (settled debt is not)');
  assert.deepEqual(bk.moves.map(x => x.label).sort(), ['Lent to Rafi', 'Transfer from Cash', 'Transfer to Bank'].sort(), 'bKash: transfers both ways and the open loan');
  assert.deepEqual(bn.moves.map(x => x.label).sort(), ['Borrowed from Mina', 'Transfer from bKash'].sort());
  assert.ok(cash.moves.every(x => x.move === true && x.id.startsWith('mv_') && Number.isInteger(x.y)));
  const tr = bk.moves.find(x => x.label === 'Transfer to Bank'); assert.deepEqual([tr.kind, tr.amt, tr.signed], ['out', 25.75, -25.75]); assert.equal(bk.balance, round2(-40 + 5000 + 1000 - 25.75 - 60));
  assert.equal(cash.rows.length, cash.entries.length + 2, 'rows = entries + moves'); assert.equal(cash.entries.filter(e => e.amt === 33).length, 1, 'the ghost-account entry shows under the default account');
  for (const sort of ['newest', 'oldest', 'amount-high', 'amount-low']) { const m = accountModel(repo, 'cash', sort); assert.equal(m.rows.length, cash.rows.length); if (sort === 'amount-high') assert.ok(m.rows.every((r, i, a) => !i || Math.abs(a[i - 1].signed) >= Math.abs(r.signed))); }
  // settling / deleting changes the history and the balance together
  repo.setDebtSettled(repo.settings.debts[0].id, true); check('settled'); assert.equal(accountModel(repo, 'bkash').moves.some(x => x.label === 'Lent to Rafi'), false); repo.removeDebt(repo.settings.debts[1].id); check('debt removed');
  // random operations never break the equation
  for (let i = 0; i < 60; i++) {
    const ids = repo.settings.accounts.map(a => a.id), pick = () => ids[rnd(ids.length)], op = rnd(5);
    if (op === 0) await repo.addEntry(2026, 9, 7, { cat: rnd(2) ? 'lunch' : 'self', amt: 1 + rnd(900), acct: rnd(6) ? pick() : 'ghost' });
    else if (op === 1) repo.addBalance(pick(), 1 + rnd(500)); else if (op === 2) { const a = pick(), b = pick(); if (a !== b) repo.addTransfer(a, b, 1 + rnd(300)); }
    else if (op === 3) repo.addDebt({ type: rnd(2) ? 'lent' : 'borrowed', person: 'P' + i, amount: 1 + rnd(200), accountId: pick() });
    else if (repo.settings.debts.length) repo.setDebtSettled(repo.settings.debts[rnd(repo.settings.debts.length)].id, !!rnd(2));
    if (i % 10 === 9) check('random ' + i);
  }
  check('random end'); await repo.deleteAccount(bank.id, 'cash'); check('after deleting an account');
});
await t('wipeAll: removes days + meta, resets to defaults, queues cloud deletes', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { store, repo } = mk(async () => true);
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 10 }); repo.saveDebts([{ id: 'q' }]); await settle();
  cloud['moneytracker/2020_1_1'] = { lunch: 1 }; const r = repo.wipeAll(['2020_1_1']); await settle();
  assert.deepEqual(r, { localDays: 1, cloudDays: 1 }); assert.equal(repo.listDays().length, 0); assert.equal(repo.settings.debts.length, 0); assert.equal(repo.settings.expense.length, 19);
  assert.deepEqual(Object.keys(cloud), []);
});
await t('repo: template CRUD and persistence', async () => {
  reset(); const { store, repo } = mk(async () => true);
  const tmpl = repo.addTemplate({ label: 'Tea & Snacks', cat: 'lunch', amt: 40, note: '#tea' });
  assert.equal(repo.listTemplates().length, 1);
  assert.equal(repo.listTemplates()[0].label, 'Tea & Snacks');
  assert.equal(repo.listTemplates()[0].amt, 40);
  assert.throws(() => repo.addTemplate({ label: '', cat: 'lunch' }), /name/);
  assert.throws(() => repo.addTemplate({ label: 'X', cat: 'unknown' }), /category/);
  repo.removeTemplate(tmpl.id);
  assert.equal(repo.listTemplates().length, 0);
});
console.log(`\n${n} test groups passed`);
// ---------- appended: expr + view-models ----------
const { evalExpr, hasOperator } = await import('../domain/expr.js');
const { todayModel, monthModel, yearModel, planModel } = await import('../domain/viewmodels.js');
await t('expr: arithmetic, precedence, unicode operators, rejects anything else', () => {
  assert.equal(evalExpr('100+50'), 150); assert.equal(evalExpr('2+3*4'), 14); assert.equal(evalExpr('(20+5)/2'), 12.5); assert.equal(evalExpr('1,200 \u00D7 2'), 2400);
  assert.equal(evalExpr('10\u22123'), 7); assert.equal(evalExpr('-5+10'), 5); assert.equal(evalExpr('0.1+0.2'), 0.3); assert.equal(evalExpr('7\u00F73'), 2.33);
  for (const bad of ['', '1/0', '2+', '(2', 'abc', 'alert(1)', '1+*2', '2)(3', '1..2+', null]) assert.equal(evalExpr(bad), null, String(bad));
  assert.equal(hasOperator('100'), false); assert.equal(hasOperator('-5'), false); assert.equal(hasOperator('5+5'), true);
});
await t('view-models: today, month (grouped, filtered, locked) and year; adjustment ids are stable', async () => {
  reset(); const { store, repo } = mk(async () => true); const now = new Date(2026, 9, 7);
  store.set('mt_2026_10_5', { lunch: 40, acct_lunch: 'cash', note_lunch: 'old', ts_lunch: 100, self: 900, acct_self: 'bkash' });        // legacy day
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 120, acct: 'cash', note: 'biryani', ts: 300 }); await repo.addEntry(2026, 9, 7, { cat: 'transport', amt: 30, ts: 200 });
  const td = todayModel(repo, now); assert.equal(td.today.exp, 150); assert.deepEqual(td.today.entries.map(e => e.label + e.signed), [repo.settings.expense.find(f => f.id === 'lunch').label + -120, repo.settings.expense.find(f => f.id === 'transport').label + -30].map(String));
  assert.equal(td.net, 900 - 40 - 150 + repo.settings.accounts.reduce((s, a) => s + a.opening, 0)); assert.equal(td.today.locked, false);
  const m = monthModel(repo, 2026, 9, { kind: 'all' }, now); assert.deepEqual(m.days.map(g => g.d), [7, 5]); assert.equal(m.days[1].locked, true); assert.equal(m.totals.totalExp, 190);
  const adj = m.days[1].entries.find(e => e.adj); assert.equal(adj.id, 'adj_lunch'); assert.equal(monthModel(repo, 2026, 9, {}, now).days[1].entries.find(e => e.adj).id, 'adj_lunch');   // stable across renders
  assert.equal(monthModel(repo, 2026, 9, { kind: 'in' }, now).days.length, 1); assert.equal(monthModel(repo, 2026, 9, { cat: 'transport' }, now).days[0].entries.length, 1);
  await repo.updateEntry(2026, 9, 5, 'adj_lunch', { amt: 45 }, { unlocked: true }); assert.equal(store.get('mt_2026_10_5').lunch, 45);                // editing a legacy adjustment works
  const y = yearModel(repo, 2026); assert.equal(y.months[9].exp, 195); assert.equal(y.months[0].days, 0);
});
await t('plan domain: budgets, accounts, ledger and debts validate input and never mutate their arguments', () => {
  const exp = [{ id: 'lunch', label: 'Lunch', budget: 0 }, { id: 'rent', label: 'Rent', budget: 50 }], before = JSON.stringify(exp);
  const b = PL.setBudgets(exp, { lunch: 3100.456, rent: 0 }); assert.deepEqual(b.map(f => f.budget), [3100.46, 0]); assert.equal(JSON.stringify(exp), before);
  assert.throws(() => PL.setBudgets(exp, { nope: 1 }), /Unknown category/); assert.equal(PL.setBudgets(exp, { lunch: -5 })[0].budget, 0); assert.equal(PL.normGoal('abc'), 0); assert.equal(PL.normGoal(1500), 1500);
  const accts = [{ id: 'cash', label: 'Cash', icon: 'c', opening: 0 }, { id: 'bk', label: 'bKash', icon: 'b', opening: 10 }];
  assert.throws(() => PL.addAccount(accts, { label: '  ' }), /name/); const a2 = PL.addAccount(accts, { label: ' Bank ', icon: '' }, 'abank'); assert.deepEqual(a2[2], { id: 'abank', label: 'Bank', icon: '\u{1F4B0}', opening: 0 }); assert.equal(accts.length, 2);
  assert.equal(PL.updateAccount(accts, 'bk', { opening: -40.5 })[1].opening, -40.5); assert.throws(() => PL.updateAccount(accts, 'bk', { label: '' }), /name/); assert.throws(() => PL.updateAccount(accts, 'zz', {}), /not found/);
  const debts = [{ id: 'd1', type: 'lent', person: 'A', amount: 100, accountId: 'bk', settled: false }, { id: 'd2', type: 'borrowed', person: 'B', amount: 40, accountId: 'bk', settled: true }];
  const del = PL.deleteAccount(accts, debts, 'bk', 'cash'); assert.deepEqual([del.accounts.map(a => a.id), del.debts.map(d => d.accountId), del.moved.debts], [['cash'], ['cash', 'cash'], 2]); assert.equal(debts[0].accountId, 'bk');
  assert.throws(() => PL.deleteAccount(accts, debts, 'bk'), /move its history/); assert.throws(() => PL.deleteAccount(accts, debts, 'bk', 'bk'), /move its history/); assert.throws(() => PL.deleteAccount(accts, debts, 'bk', 'zz'), /move its history/);
  assert.throws(() => PL.deleteAccount([accts[0]], [], 'cash', 'cash'), /At least one/);
  const lg = PL.addBalance([], accts, 'cash', 25, { now: new Date(0), id: 'x' }); assert.deepEqual(lg, [{ id: 'x', ts: '1970-01-01T00:00:00.000Z', type: 'add', accountId: 'cash', amount: 25 }]);
  assert.throws(() => PL.addBalance([], accts, 'cash', 0), /valid amount/); assert.throws(() => PL.addBalance([], accts, 'zz', 5), /not found/);
  assert.deepEqual(PL.addTransfer([], accts, 'cash', 'bk', 5, { now: new Date(0), id: 't' })[0], { id: 't', ts: '1970-01-01T00:00:00.000Z', type: 'transfer', fromId: 'cash', toId: 'bk', amount: 5 });
  assert.throws(() => PL.addTransfer([], accts, 'cash', 'cash', 5), /different/); assert.throws(() => PL.addTransfer([], accts, 'cash', 'zz', 5), /destination/);
  const d = PL.addDebt([], accts, { type: 'borrowed', person: ' Rafi ', amount: 70, accountId: 'cash', note: ' for books ' }, { id: 'dx', today: new Date(2026, 9, 7) });
  assert.deepEqual(d[0], { id: 'dx', type: 'borrowed', person: 'Rafi', amount: 70, date: '2026-10-07', accountId: 'cash', settled: false, note: 'for books' });
  for (const bad of [{ type: 'x' }, { type: 'lent', person: '' }, { type: 'lent', person: 'p', accountId: 'zz', amount: 1 }, { type: 'lent', person: 'p', accountId: 'cash', amount: 0 }]) assert.throws(() => PL.addDebt([], accts, bad));
  const st = PL.setDebtSettled(debts, 'd1', true, new Date(2026, 9, 7)); assert.deepEqual([st[0].settled, st[0].settledDate], [true, '2026-10-07']); assert.equal(PL.setDebtSettled(st, 'd1', false)[0].settledDate, null); assert.equal(debts[0].settled, false);
  assert.deepEqual(PL.debtTotals([...debts, { type: 'borrowed', amount: 5, settled: false }]), { owe: 5, receive: 100 }); assert.equal(PL.removeDebt(debts, 'd1').length, 1); assert.throws(() => PL.removeDebt(debts, 'zz'), /not found/);
  assert.deepEqual(PL.sortDebts([{ id: 'a', settled: true, date: '2026-10-09' }, { id: 'b', settled: false, date: '2026-10-01' }, { id: 'c', settled: false, date: '2026-10-05' }]).map(x => x.id), ['c', 'b', 'a']);
});
await t('goal projection equals the legacy formula (current, past, future month; no budgets; negative saved)', () => {
  const expense = [{ id: 'lunch', budget: 3100 }, { id: 'transport', budget: 620 }, { id: 'rent', budget: 0 }, { id: 'mobile' }], today = new Date(2026, 9, 7);
  for (const [y, m0, totals] of [[2026, 9, { lunch: 1000, transport: 50, rent: 9999 }], [2026, 9, { lunch: 100 }], [2026, 8, { lunch: 3000, transport: 700 }], [2026, 10, { lunch: 5 }], [2026, 9, {}]]) {
    const g = goalProgress({ expenseCats: expense, catTotals: totals, goal: 1000, y, m0, today });
    assert.ok(Math.abs(g.saved - legacyGoalSaved({ expense, catTotals: totals, y, m: m0, today })) < 0.006, `${y}-${m0}`);
    assert.equal(g.pct, Math.max(0, Math.min(100, g.saved / 1000 * 100))); assert.equal(g.hasGoal, true);
  }
  assert.equal(goalProgress({ expenseCats: expense, catTotals: { lunch: 1000 }, goal: 1000, y: 2026, m0: 9, today }).pct, 0);                                // overspent → 0%, not negative
  assert.equal(goalProgress({ expenseCats: expense, catTotals: {}, goal: 1, y: 2026, m0: 10, today }).saved, 0);                                              // future month: nothing elapsed
  assert.deepEqual(goalProgress({ expenseCats: [], catTotals: {}, goal: 0, y: 2026, m0: 9, today }), { target: 0, saved: 0, hasGoal: false, pct: 0 });
});
await t('repo plan ops persist under the legacy keys; planModel counts listed accounts only; debts move balances', async () => {
  reset(); const { store, repo } = mk(async () => true), now = new Date(2026, 9, 7);
  repo.setBudgets({ lunch: 3100, transport: 620 }); repo.setGoal(1500);
  assert.equal(store.get('mt_categories_v1').expense.find(f => f.id === 'lunch').budget, 3100); assert.equal(store.getRaw('mt_savings_goal_v1'), '1500'); assert.equal(repo.settings.goal, 1500);
  const bank = repo.addAccount({ label: ' Bank ', icon: '' }); assert.equal(store.get('mt_accounts_v1').length, 4); repo.updateAccount(bank.id, { opening: 1000 });
  repo.addBalance('cash', 200); repo.addTransfer('cash', bank.id, 50);
  assert.deepEqual(store.get('mt_ledger_v1').map(e => [e.type, e.amount]), [['add', 200], ['transfer', 50]]); assert.equal(store.get('mt_ledger_v1')[0].ts, new Date(5000).toISOString());
  repo.addDebt({ type: 'lent', person: 'Rafi', amount: 300, accountId: 'cash' });
  let m = planModel(repo, now); const bal = () => Object.fromEntries(m.accounts.map(a => [a.id, a.balance]));
  assert.deepEqual(bal(), { cash: -150, bkash: 0, card: 0, [bank.id]: 1050 }); assert.equal(m.total, 900); assert.deepEqual([m.debts.owe, m.debts.receive, m.debts.lent.length, m.debts.lent[0].acctLabel], [0, 300, 1, 'Cash']);
  const id = store.get('mt_debts_v1')[0].id; repo.setDebtSettled(id, true); m = planModel(repo, now); assert.equal(bal().cash, 150); assert.equal(m.debts.receive, 0); assert.equal(store.get('mt_debts_v1')[0].settledDate, '2026-10-07');
  repo.addDebt({ type: 'borrowed', person: 'Mina', amount: 70, accountId: bank.id }); assert.equal(planModel(repo, now).total, 1270);
  const r = await repo.deleteAccount(bank.id, 'cash'); assert.deepEqual([r.debts, r.ledger, r.dropped], [1, 0, 1]); assert.equal(store.get('mt_debts_v1')[1].accountId, 'cash'); assert.equal(store.get('mt_accounts_v1').some(a => a.id === bank.id), false);
  m = planModel(repo, now); assert.equal(m.total, 1270, 'deleting an account does not change the total (history moved to Cash)'); assert.equal(todayModel(repo, now).net, 1270);
  assert.equal(m.debts.owe, 70); repo.removeDebt(store.get('mt_debts_v1')[1].id); assert.equal(planModel(repo, now).debts.owe, 0);
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 1000 }); m = planModel(repo, now);
  const lunch = m.budgets.find(b => b.id === 'lunch'); assert.deepEqual([lunch.used, lunch.budget, lunch.state, lunch.onPace], [1000, 3100, 'ok', false]); assert.equal(m.budgetUsed, 1000); assert.equal(m.budgetTotal, 3720);
  assert.ok(Math.abs(m.goal.saved - legacyGoalSaved({ expense: repo.settings.expense, catTotals: { lunch: 1000 }, y: 2026, m: 9, today: now })) < 0.006); assert.equal(m.expenseCats.length, repo.settings.expense.length);
  repo.setGoal(0); assert.equal(planModel(repo, now).goal.hasGoal, false); await repo.deleteAccount('cash', 'bkash'); await repo.deleteAccount('bkash', 'card'); await assert.rejects(() => repo.deleteAccount('card', 'card'), /At least one/); assert.equal(repo.settings.accounts.length, 1);   // the last account can never be deleted
});
await t('insights: month summary, per-day, categories, trend, biggest, forecast (numbers worked out by hand)', async () => {
  reset(); const { store, repo } = mk(async () => true), now = new Date(2026, 9, 7);
  const { insightsModel, categoryDrillModel } = await import('../domain/viewmodels.js');
  store.set('mt_2026_9_5', { lunch: 1000 }); store.set('mt_2026_9_20', { lunch: 500, self: 20000 });                                        // September: expense 1500, income 20000
  store.set('mt_2026_10_1', { lunch: 300 }); store.set('mt_2026_10_3', { lunch: 200, transport: 100, note_lunch: 'tea' }); store.set('mt_2026_10_6', { dinner: 700, self: 5000 });
  const m = insightsModel(repo, 2026, 9, now);
  assert.deepEqual([m.hasData, m.inc, m.exp, m.net, m.dim, m.elapsed], [true, 5000, 1300, 3700, 31, 7]);
  assert.equal(m.savingsRate, 3700 / 5000); assert.deepEqual([m.prev.m0, m.prev.exp, m.prev.inc, m.prev.has], [8, 1500, 20000, true]);
  assert.equal(m.vsPrev.exp, -200); assert.ok(Math.abs(m.vsPrev.pct - (-200 / 1500 * 100)) < 1e-9);
  assert.equal(m.daily.length, 31); assert.deepEqual([m.daily[0], m.daily[2], m.daily[5], m.daily[6], m.daily[7]], [300, 300, 700, 0, 0]);
  assert.deepEqual([m.spendDays, m.avgPerDay, m.noSpendDays, m.top, m.forecast], [3, round2(1300 / 7), 4, { day: 6, amt: 700 }, round2(1300 / 7 * 31)]);
  assert.deepEqual(m.categories.map(c => [c.id, c.total, c.prev, c.delta]), [['dinner', 700, 0, 700], ['lunch', 500, 1500, -1000], ['transport', 100, 0, 100]]);
  assert.ok(Math.abs(m.categories.reduce((s, c) => s + c.share, 0) - 100) < 1e-9);
  assert.deepEqual(m.trend.map(t => [t.m0, t.exp, t.inc]), [[4, 0, 0], [5, 0, 0], [6, 0, 0], [7, 0, 0], [8, 1500, 20000], [9, 1300, 5000]]);
  assert.deepEqual(m.biggest.map(b => [b.d, b.label.length > 0, b.amt]), [[6, true, 700], [1, true, 300], [3, true, 200], [3, true, 100]]);
  const dr = categoryDrillModel(repo, 2026, 9, 'lunch'); assert.deepEqual([dr.total, dr.count, dr.activeDays, dr.daily[0], dr.daily[2]], [500, 2, 2, 300, 200]);
  assert.deepEqual(dr.entries.map(e => [e.d, e.amt]), [[3, 200], [1, 300]]); assert.equal(dr.entries[0].note, 'tea');                   // newest day first
  assert.equal(dr.total, m.categories.find(c => c.id === 'lunch').total);                                                                 // drill-down total == category row
});
await t('insights: edge cases (empty month, past month has no forecast, year rollover, no income, first days)', () => {
  const E = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], I = [{ id: 'i', label: 'I' }], now = new Date(2026, 0, 2);
  const mk2 = (days, y, m0, today = now) => IN.buildInsights({ days, expense: E, income: I, y, m0, today });
  const empty = mk2([], 2026, 0); assert.deepEqual([empty.hasData, empty.savingsRate, empty.vsPrev, empty.forecast, empty.top, empty.categories.length, empty.biggest.length], [false, null, null, null, null, 0, 0]);
  assert.deepEqual(IN.shiftMonth(2026, 0, -1), { y: 2025, m0: 11 }); assert.deepEqual(IN.shiftMonth(2026, 11, 1), { y: 2027, m0: 0 }); assert.deepEqual(IN.shiftMonth(2026, 2, -14), { y: 2025, m0: 0 });
  const d = [{ y: 2025, m: 11, d: 30, doc: { a: 80 } }, { y: 2026, m: 0, d: 1, doc: { a: 20 } }];                                           // December → January
  const m = mk2(d, 2026, 0); assert.deepEqual([m.exp, m.prev.m0, m.prev.y, m.prev.exp, m.vsPrev.exp, m.forecast, m.savingsRate], [20, 11, 2025, 80, -60, null, null]);   // only 2 days elapsed → no forecast; no income → no rate
  assert.deepEqual(m.trend.map(t => [t.y, t.m0]).slice(0, 2), [[2025, 7], [2025, 8]]);
  const past = mk2([{ y: 2025, m: 11, d: 30, doc: { a: 80 } }], 2025, 11); assert.deepEqual([past.forecast, past.elapsed, past.noSpendDays], [null, 31, 30]);   // finished month: no forecast, whole month counted
  const fut = mk2([], 2026, 5); assert.deepEqual([fut.elapsed, fut.noSpendDays, fut.avgPerDay], [0, 0, 0]);
  assert.equal(mk2([{ y: 2026, m: 0, d: 1, doc: { i: 100, a: 150 } }], 2026, 0).savingsRate, -0.5);                                          // overspent → negative rate
  assert.equal(mk2([{ y: 2026, m: 0, d: 1, doc: { i: 100 } }], 2026, 0).vsPrev, null);                                                       // nothing last month → no comparison
  const lp = mk2([{ y: 2026, m: 0, d: 1, doc: { a: 10 } }, { y: 2025, m: 11, d: 1, doc: { i: 50 } }], 2026, 0); assert.equal(lp.vsPrev.pct, null);   // prev had income only → delta shown, no % (no divide by 0)
});
await t('search: AND words, amounts, months/dates, kind filter, limit, newest first, Unicode, lock flag', async () => {
  reset(); const { store, repo } = mk(async () => true), now = new Date(2026, 9, 7);
  const { searchModel } = await import('../domain/viewmodels.js');
  store.set('mt_2026_9_5', { lunch: 1000, note_lunch: 'Biryani' }); store.set('mt_2026_9_20', { lunch: 500, note_lunch: 'rice', self: 20000 }); store.set('mt_2026_8_2', { dinner: 90, note_dinner: '\u09AD\u09BE\u09A4 \u09A1\u09BE\u09B2' });
  store.set('mt_2026_10_3', { lunch: 200, note_lunch: 'Tea with Rafi', transport: 100 }); store.set('mt_2026_10_6', { dinner: 700, self: 5000, note_self: 'salary' });
  const q = (query, kind = 'all', limit = 100) => searchModel(repo, query, kind, now, limit), n = (query, kind) => q(query, kind).total;
  assert.deepEqual([q('').total, q('   ').tokens.length, q('').groups.length], [0, 0, 0]);                                                  // empty query lists nothing (not everything)
  assert.deepEqual([n('tea'), n('TEA'), n('rafi tea'), n('rafi nothing'), n('zzz')], [1, 1, 1, 0, 0]);                                       // case-insensitive, all words must match
  assert.deepEqual([n('500'), n('700'), n('1,000'), n('1000'), n('50')], [1, 1, 1, 1, 0]);                                                  // a number is an exact amount (50 is not 500 or 5000)
  let r = q('sep'); assert.deepEqual([r.total, r.sumOut, r.sumIn, r.groups.map(g => g.d)], [3, 1500, 20000, [20, 5]]);                     // month name; newest day first
  assert.equal(n('2026-10-03'), 2); assert.equal(n('october lunch'), 1); assert.equal(n('oct 2026'), 4); assert.equal(n('salary'), 1);   // ISO date, month + category label, month + year, note
  assert.deepEqual([n('sep', 'in'), n('sep', 'out'), n('lunch', 'in')], [1, 2, 0]);
  r = q('oct', 'all', 2); assert.deepEqual([r.total, r.shown, r.sumOut, r.sumIn, r.groups.length], [4, 2, 1000, 5000, 1]);                  // limit shows 2 but totals cover all 4
  assert.equal(r.groups[0].d, 6); assert.deepEqual(r.groups[0].entries.map(e => e.amt).sort((a, b) => a - b), [700, 5000]);
  assert.deepEqual([n('3 oct'), n('2026'), n('20 sep')], [2, 8, 2]);                                                                       // day number + month, bare year, day + month (20 Sep: lunch + self)
  assert.equal(n('\u09AD\u09BE\u09A4'), 1); assert.equal(n('\u09A1\u09BE\u09B2 \u09AD\u09BE\u09A4'), 1);                                          // Bangla notes work
  const { searchTagsModel } = await import('../domain/viewmodels.js');
  store.set('mt_2026_10_2', { lunch: 120, note_lunch: 'Burger #fastfood #treat' });
  assert.equal(n('#fastfood'), 1); assert.equal(n('#treat'), 1); assert.equal(n('treat'), 1);
  const tags = searchTagsModel(repo);
  assert.ok(tags.includes('#fastfood') && tags.includes('#treat'));
  r = q('oct'); assert.deepEqual(r.groups.map(g => [g.d, g.locked]), [[6, false], [3, true], [2, true]]);                                              // lock state matches History (auto-lock after 2 days)
  assert.ok(r.groups.every(g => g.entries.every(e => e.id && e.cat && e.kind)));                                                           // rows are editable entries (ids + category)
  const before = JSON.stringify(Object.fromEntries(repo.listDays().map(x => [x.key, x.doc]))); q('oct'); assert.equal(JSON.stringify(Object.fromEntries(repo.listDays().map(x => [x.key, x.doc]))), before);   // read-only
});
await t('categories & sources: add / edit / pin / default account / reorder / delete, usage count, repo persistence', async () => {
  const exp = [{ id: 'lunch', label: 'Lunch', icon: 'L', budget: 500, pinned: true }, { id: 'rent', label: 'Rent', icon: 'R', budget: 0, pinned: false }], before = JSON.stringify(exp);
  const a = CT.addCategory(exp, 'expense', { label: ' Tea ', icon: '' }, 'ctea'); assert.deepEqual(a[2], { id: 'ctea', label: 'Tea', icon: '\u{1F516}', budget: 0, pinned: false }); assert.equal(JSON.stringify(exp), before);
  assert.deepEqual(CT.addCategory([{ id: 's', label: 'Salary', icon: 'S', pinned: true }], 'income', { label: 'Gift' }, 'cg')[1], { id: 'cg', label: 'Gift', icon: '\u{1F516}', pinned: false });   // income has no budget
  assert.throws(() => CT.addCategory(exp, 'expense', { label: '  ' }), /name/); assert.throws(() => CT.addCategory(exp, 'expense', { label: 'lunch' }), /already/); assert.throws(() => CT.addCategory(exp, 'x', { label: 'a' }), /Unknown/);
  const u = CT.updateCategory(exp, 'rent', { label: 'Home Rent', icon: '', pinned: true, defaultAcct: 'bk' }, ['cash', 'bk']); assert.deepEqual([u[1].label, u[1].icon, u[1].pinned, u[1].defaultAcct, u[1].budget], ['Home Rent', 'R', true, 'bk', 0]);
  assert.equal('defaultAcct' in CT.updateCategory(u, 'rent', { defaultAcct: '' }, ['bk'])[1], false); assert.throws(() => CT.updateCategory(exp, 'rent', { defaultAcct: 'zz' }, ['bk']), /Account/);
  assert.throws(() => CT.updateCategory(exp, 'rent', { label: 'LUNCH' }), /already/); assert.equal(CT.updateCategory(exp, 'rent', { label: 'rent' })[1].label, 'rent'); assert.throws(() => CT.updateCategory(exp, 'rent', { label: ' ' }), /name/); assert.throws(() => CT.updateCategory(exp, 'no', {}), /Not found/);
  assert.deepEqual(CT.moveCategory(a, 'ctea', -1).map(f => f.id), ['lunch', 'ctea', 'rent']); assert.equal(CT.moveCategory(a, 'lunch', -1), a); assert.equal(CT.moveCategory(a, 'ctea', 1), a);
  assert.deepEqual(CT.deleteCategory(a, 'expense', 'ctea').map(f => f.id), ['lunch', 'rent']); assert.throws(() => CT.deleteCategory([exp[0]], 'expense', 'lunch'), /At least one expense/); assert.throws(() => CT.deleteCategory([{ id: 's' }], 'income', 's'), /At least one income/);
  assert.deepEqual(CT.categoryUsage([{ doc: { lunch: 150.5, entries: [{ cat: 'lunch' }] } }, { doc: { lunch: 0, entries: [{ cat: 'lunch', amt: 1 }] } }, { doc: { rent: 9 } }, { doc: {} }], 'lunch'), { days: 2, total: 150.5 });
  reset(); const { repo } = mk(async () => true); const n0 = repo.settings.expense.length, ni = repo.settings.income.length;
  const c = repo.addCategory('expense', { label: 'Tea', icon: '\u2615' }); assert.equal(repo.settings.expense.length, n0 + 1); repo.updateCategory('expense', c.id, { pinned: true, defaultAcct: 'bkash' }); repo.moveCategory('expense', c.id, -1);
  assert.equal(repo.resolveAccount(c.id), 'bkash'); assert.equal(repo.settings.expense[n0 - 1].id, c.id);
  const src = repo.addCategory('income', { label: 'Tuition' }); assert.equal(repo.settings.income.length, ni + 1);
  await repo.addEntry(2026, 9, 7, { cat: c.id, amt: 40, acct: 'bkash', note: 'x' }); assert.equal(repo.categoryUsage(c.id).days, 1);
  const { store: s2, repo: r2 } = mk(async () => true); assert.ok(r2.settings.expense.some(f => f.id === c.id && f.pinned && f.defaultAcct === 'bkash') && r2.settings.income.some(f => f.id === src.id));   // survives a reload
  assert.throws(() => repo.deleteCategory('expense', c.id), /Archive it instead/); assert.equal(repo.catIds().includes(c.id), true, 'a category with data cannot be deleted');
  assert.throws(() => { repo.settings.income.slice(1).forEach(f => repo.deleteCategory('income', f.id)); repo.deleteCategory('income', repo.settings.income[0].id); }, /At least one income/);
});
await t('report: month and year numbers worked out by hand; xlsx is a valid zip; html escapes', async () => {
  const D = { '2026-9-3': { lunch: 100, self: 1000 }, '2026-9-7': { lunch: 50, rent: 500 }, '2026-8-20': { lunch: 70 } }, getDoc = (y, m0, d) => D[`${y}-${m0}-${d}`] || {};
  const expense = [{ id: 'lunch', label: 'Lunch', icon: 'L' }, { id: 'rent', label: 'Rent', icon: 'R' }, { id: 'unused', label: 'Unused', icon: 'U' }], income = [{ id: 'self', label: 'Self <b>', icon: 'S' }];
  const m = RP.buildReport({ getDoc, expense, income, y: 2026, m0: 9 });
  assert.deepEqual([m.title, m.period, m.totals, m.hasData], ['October 2026', 'month', { exp: 650, inc: 1000, net: 350 }, true]);
  assert.deepEqual(m.categories.map(c => [c.label, c.type, c.amount]), [['Lunch', 'Expense', 150], ['Rent', 'Expense', 500], ['Self <b>', 'Income', 1000]]);   // zero categories left out
  assert.deepEqual(m.rows, [{ label: 'Day 3', exp: 100, inc: 1000, net: 900 }, { label: 'Day 7', exp: 550, inc: 0, net: -550 }]);
  assert.deepEqual(m.detail.head, ['Day', 'Lunch', 'Rent', 'Total Exp', 'Self <b>', 'Total Inc', 'Net']); assert.deepEqual(m.detail.rows, [['Day 3', 100, 0, 100, 1000, 1000, 900], ['Day 7', 50, 500, 550, 0, 0, -550]]);
  const y = RP.buildReport({ getDoc, expense, income, y: 2026 });
  assert.deepEqual([y.title, y.period, y.rows.length, y.totals, y.categories[0].amount, y.rows[8].exp, y.rows[9].net, y.rows[0].exp], ['2026', 'year', 12, { exp: 720, inc: 1000, net: 280 }, 220, 70, 350, 0]);
  const e = RP.buildReport({ getDoc, expense, income, y: 2025, m0: 0 }); assert.deepEqual([e.hasData, e.rows.length, e.totals.net], [false, 0, 0]);
  assert.equal(RP.buildReport({ getDoc, expense: expense.slice(1), income, y: 2026, m0: 9 }).totals.exp, 500);                                              // a deleted category stops counting
  const x = RF.reportToXlsx(m, { date: new Date(2026, 9, 10, 12, 0, 0) }); assert.ok(x instanceof Uint8Array); assert.equal(String.fromCharCode(x[0], x[1]), 'PK');
  const dv = new DataView(x.buffer, x.byteOffset, x.byteLength), eocd = x.length - 22; assert.equal(dv.getUint32(eocd, true), 0x06054b50); assert.equal(dv.getUint16(eocd + 10, true), 6);   // 6 parts
  assert.equal(XL.zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]).length, 30 + 5 + 5 + 46 + 5 + 22);                                // exact size of a one-file store zip
  assert.equal(RF.reportFileName(m, 'xlsx'), 'MoneyTracker_October_2026.xlsx');
  const html = RF.reportToHtml(m); assert.ok(html.includes('<table>') && html.includes('1,000'));
  const tmpDir = (await import('node:os')).tmpdir();
  (await import('node:fs')).writeFileSync((await import('node:path')).join(tmpDir, 'sample-report.xlsx'), x);
});
await t('calculator: keys, operator rules, brackets, decimals, errors, preview, history entry', () => {
  const run = (keys, st = CA.initial()) => { for (const k of keys) st = CA.press(st, k); return st; }, ex = (keys, st) => run(keys, st).expr;
  let s = run('12+30='); assert.deepEqual([s.expr, s.done, s.entry], ['42', true, { e: '12 + 30', r: '42' }]);
  assert.equal(ex('100+50*2='), '200'); assert.equal(CA.preview(run('100+50*2')), 200); assert.equal(CA.preview(run('7')), null); assert.equal(CA.preview(run('(2+3')), 5); assert.equal(CA.preview(run('2+3=')), null);
  assert.equal(ex('7', run('12+30=')), '7'); assert.equal(ex('+8=', run('12+30=')), '50');                               // digit after "=" starts fresh, operator continues
  assert.equal(ex('5+*3='), '15'); assert.equal(ex('+'), ''); assert.equal(ex('-'), '\u2212'); assert.equal(ex('-5+2='), '\u22123');   // operator replaced; sign allowed first
  assert.equal(ex('1.5.5'), '1.55'); assert.equal(ex('.5+.5='), '1'); assert.equal(ex('007'), '7'); assert.equal(ex('0.'), '0.'); assert.equal(ex('5+.'), '5+0.');
  assert.equal(ex('(2+3='), '5'); assert.equal(ex('2(3+4)='), '14'); assert.equal(ex(')'), ''); assert.equal(ex('()'), '('); assert.equal(ex('(3+)'), '(3+');   // auto-close, implicit ×, no stray or empty brackets
  s = run('5/0='); assert.deepEqual([s.error, s.expr, s.done], [true, '5\u00F70', false]); assert.equal(ex('\u232B', s), '5\u00F7');   // error keeps the expression
  assert.equal(ex('1'.repeat(13)), '1'.repeat(12)); assert.equal(ex('123\u232B'), '12'); assert.equal(ex('123C'), ''); assert.equal(ex('0.1+0.2='), '0.3'); assert.equal(ex('1/3='), '0.33');
  assert.equal(ex('5+='), '5'); assert.equal(run('999999999999*999999999999=').error, true); assert.equal(run('\u2212').expr, '\u2212');
  assert.equal(ex('2*3\u2212'), '2\u00D73\u2212'); assert.equal(ex('2\u2212\u2212'), '2\u2212'); assert.equal(ex('(\u22122+5)='), '3');
  assert.deepEqual([CA.normalizeKey('Enter'), CA.normalizeKey('/'), CA.normalizeKey('x'), CA.normalizeKey(','), CA.normalizeKey('Backspace')], ['=', '\u00F7', '\u00D7', '.', '\u232B']);
  assert.deepEqual([CA.show('12+30'), CA.show('\u22125+2'), CA.fmtNum(1234567.5), CA.fmtNum(-5)], ['12 + 30', '\u22125 + 2', '12,34,567.5', '\u22125']);
});
await t('pwa: manifest.json is valid and has its own icons/scope; sw.js precaches the shell, serves cache-first (refreshing in the background), and falls back to the shell when offline', async () => {
  const nodeFs = await import('node:fs'), SW_ROOT = new URL('../', import.meta.url);
  const manifest = JSON.parse(nodeFs.readFileSync(new URL('manifest.json', SW_ROOT), 'utf8'));
  assert.deepEqual([manifest.start_url, manifest.scope, manifest.display], ['/apps/money/index.html', '/apps/money/', 'fullscreen']);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'at least 192 + 512 icons');
  manifest.icons.forEach(ic => { assert.ok(/^(any|maskable)$/.test(ic.purpose), 'one purpose per icon entry, not "any maskable": ' + ic.src); assert.ok(/^\/apps\/money\//.test(ic.src), 'own icon, not the legacy one: ' + ic.src); });
  assert.ok(manifest.icons.some(ic => ic.purpose === 'maskable') && manifest.icons.some(ic => ic.purpose === 'any'), 'both an "any" and a "maskable" icon are declared');
  assert.ok(manifest.id, 'has its own id, so it installs separately from the legacy manifest-moneytracker.json');
  // ---- minimal service-worker-global-scope stub, just enough to exercise sw.js's own install/activate/message/fetch logic ----
  const ORIGIN = 'http://localhost:8123', abs = u => new URL(u, ORIGIN + '/').href;   // the real Cache API always keys by the fully-resolved URL
  const swListeners = {}, swCaches = new Map();   // cacheName -> Map(absoluteUrl -> fake Response)
  const PRECACHE_PATHS = new Set(nodeFs.readFileSync(new URL('sw.js', SW_ROOT), 'utf8').match(/'\/[^']+'/g).map(s => s.slice(1, -1).split('?')[0]));
  let swOffline = false;
  let swHold = null;     // a promise the fake network waits for, to stop the background refresh finishing early
  const swFetch = async req => { if (swOffline) throw new Error('offline'); if (swHold) await swHold; const url = typeof req === 'string' ? req : req.url, path = new URL(url, ORIGIN + '/').pathname, known = PRECACHE_PATHS.has(path) || path === '/apps/money/sw.js'; return { ok: known, status: known ? 200 : 404, url, clone() { return this; } }; };
  globalThis.self = { addEventListener: (type, fn) => { (swListeners[type] ||= []).push(fn); }, location: { origin: ORIGIN }, skipWaiting: () => { globalThis.__swSkipped = true; }, clients: { claim: async () => { globalThis.__swClaimed = true; } } };
  globalThis.caches = {
    open: async name => { if (!swCaches.has(name)) swCaches.set(name, new Map()); const m = swCaches.get(name);
      return { add: async url => { const r = await swFetch(url); if (!r.ok) throw new Error('404 ' + url); m.set(abs(url), r); }, put: async (req, res) => m.set(abs(typeof req === 'string' ? req : req.url), res), match: async req => m.get(abs(typeof req === 'string' ? req : req.url)) }; },
    match: async req => { const key = abs(typeof req === 'string' ? req : req.url); for (const m of swCaches.values()) if (m.has(key)) return m.get(key); return undefined; },
    keys: async () => [...swCaches.keys()], delete: async name => swCaches.delete(name),
  };
  globalThis.fetch = swFetch; globalThis.Response = class { static error() { return { ok: false, status: 0, isError: true }; } };
  await import(new URL('sw.js', SW_ROOT));
  assert.ok(swListeners.install && swListeners.activate && swListeners.message && swListeners.fetch, 'registers install/activate/message/fetch');
  const w1 = []; await swListeners.install[0]({ waitUntil: p => w1.push(p) }); await Promise.all(w1);
  const shell = [...swCaches.values()][0];
  assert.ok(shell.size > 30, 'most of the shell got precached, got ' + shell.size);
  assert.ok(shell.has(abs('/apps/money/index.html')) && shell.has(abs('/site.css?v=3')) && shell.has(abs('/apps/shared/dom.js')), 'page, root CSS and shared JS are all precached');
  assert.ok(!shell.has(abs('/apps/shared/firestore.js')), 'firestore.js is deliberately NOT precached (only loads once signed in)');
  swCaches.set('money-shell-v0', new Map([[abs('/old.js'), { ok: true }]]));   // simulate a stale cache from a previous CACHE_VERSION
  const w2 = []; await swListeners.activate[0]({ waitUntil: p => w2.push(p) }); await Promise.all(w2);
  assert.ok(!swCaches.has('money-shell-v0'), 'stale cache version dropped on activate'); assert.equal(globalThis.__swClaimed, true);
  swListeners.message[0]({ data: { type: 'SKIP_WAITING' } }); assert.equal(globalThis.__swSkipped, true, 'the update-toast Reload action (sw-register.js) can take over immediately');
  let p1, release; const kept = []; swHold = new Promise(r => { release = r; });
  swListeners.fetch[0]({ request: { method: 'GET', url: ORIGIN + '/apps/money/app.css' }, respondWith: p => { p1 = p; }, waitUntil: p => kept.push(p) });
  const r1 = await p1; assert.equal(new URL(r1.url, ORIGIN + '/').pathname, '/apps/money/app.css', 'cached file served instantly');
  assert.equal(kept.length, 1, 'L9: the page already has its cached copy, the refresh is still running, and it was handed to event.waitUntil BEFORE the response finished (called later from inside the refresh, waitUntil throws and the cache never updates)');
  swHold = null; release(); await Promise.all(kept);
  let touched = false;
  swListeners.fetch[0]({ request: { method: 'GET', url: 'https://fonts.googleapis.com/x' }, respondWith: () => { touched = true; } });
  assert.equal(touched, false, 'cross-origin requests (fonts, Firebase) are left alone entirely');
  swListeners.fetch[0]({ request: { method: 'POST', url: ORIGIN + '/apps/money/app.css' }, respondWith: () => { touched = true; } });
  assert.equal(touched, false, 'non-GET requests are left alone entirely');
  swOffline = true;
  let p2; swListeners.fetch[0]({ request: { method: 'GET', url: ORIGIN + '/apps/money/index.html', mode: 'navigate' }, respondWith: p => { p2 = p; }, waitUntil: () => {} });
  const r2 = await p2; assert.equal(new URL(r2.url, ORIGIN + '/').pathname, '/apps/money/index.html', 'offline navigation still gets the app shell from cache');
});

// ───────────────────────── audit round 2: H5, H7, H8, H9, L1, L3, L4 ─────────────────────────
await t('H5: Quick templates travel with the JSON backup; merge adds/overwrites by id, replace uses the file (an old file without the key keeps this device\'s), and a template whose category is gone is dropped', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const a = mk(async () => true).repo;
  a.addTemplate({ id: 't1', label: 'Rickshaw', cat: 'transport', amt: 30, acct: 'cash' }); a.addTemplate({ id: 't2', label: 'Lunch', cat: 'lunch', amt: 120, acct: 'cash' });
  const snap = a.snapshot(); assert.deepEqual(snap.templates.map(x => x.label), ['Rickshaw', 'Lunch']);
  assert.equal('templates' in buildBackup({ ...snap, templates: [] }), false, 'no templates → no key, so files from users without templates look exactly as before');
  const fresh = () => { reset(); Object.keys(cloud).forEach(k => delete cloud[k]); return mk(async () => true).repo; };
  const localOf = r => ({ days: {}, expense: r.settings.expense, income: r.settings.income, accounts: r.settings.accounts, goal: 0, ledger: [], debts: [], lastAccounts: {}, templates: r.settings.templates });
  // replace on a new device
  let b = fresh(), res = parseBackup(JSON.stringify(snap)); assert.ok(res.ok);
  b.applyImport(planImport({ mode: 'replace', local: localOf(b), payload: res.payload }), res.payload);
  assert.deepEqual(b.listTemplates().map(x => x.label), ['Rickshaw', 'Lunch'], 'restored after replace');
  // an old backup (no templates key) must not wipe this device's templates
  b = fresh(); b.addTemplate({ id: 'mine', label: 'Mine', cat: 'dinner', amt: 5, acct: 'cash' });
  const old = { ...snap }; delete old.templates; res = parseBackup(JSON.stringify(old));
  b.applyImport(planImport({ mode: 'replace', local: localOf(b), payload: res.payload }), res.payload);
  assert.deepEqual(b.listTemplates().map(x => x.id), ['mine'], 'old file keeps local templates');
  // merge: by id, backup wins, nothing deleted
  b = fresh(); b.addTemplate({ id: 't1', label: 'Rickshaw (old)', cat: 'transport', amt: 99, acct: 'cash' }); b.addTemplate({ id: 'mine', label: 'Mine', cat: 'dinner', amt: 5, acct: 'cash' });
  res = parseBackup(JSON.stringify(snap)); b.applyImport(planImport({ mode: 'merge', local: localOf(b), payload: res.payload }), res.payload);
  assert.deepEqual(b.listTemplates().map(x => x.id + ':' + x.label), ['t1:Rickshaw', 'mine:Mine', 't2:Lunch']);
  // category not in the restored categories → template dropped; malformed entries ignored
  b = fresh(); res = parseBackup(JSON.stringify({ ...snap, templates: [{ id: 'g', label: 'Ghost', cat: 'no-such-category' }, null, { label: 'no id', cat: 'lunch' }, { id: 'ok', label: 'Ok', cat: 'lunch', amt: 1, acct: 'cash' }] }));
  b.applyImport(planImport({ mode: 'replace', local: localOf(b), payload: res.payload }), res.payload);
  assert.deepEqual(b.listTemplates().map(x => x.id), ['ok']);
});
await t('H7: dates are the LOCAL calendar day (toISOString() is UTC: in Dhaka it names yesterday between 00:00 and 06:00)', async () => {
  const { spawnSync } = await import('node:child_process'), href = f => JSON.stringify(new URL(f, import.meta.url).href);
  const code = `const { isoLocal } = await import(${href('../../shared/fmt.js')}); const { backupFileName } = await import(${href('../data/backup.js')});
    const d = new Date(2026, 10, 15, 2, 0); console.log(JSON.stringify([new Date().getTimezoneOffset(), isoLocal(d), d.toISOString().slice(0, 10), backupFileName('backup', d)]));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: 'Asia/Dhaka' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); const [off, local, utc, name] = JSON.parse(r.stdout);
  assert.equal(local, '2026-11-15'); assert.equal(name, 'money-tracker-backup-2026-11-15.json');
  if (off === -360) assert.equal(utc, '2026-11-14', 'sanity: 02:00 in Dhaka is still the 14th in UTC, the day the old code used'); else console.log('      (TZ=Asia/Dhaka not honoured on this OS: only the local-day part was checked)');
  const { isoLocal } = await import('../../shared/fmt.js'); assert.equal(isoLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05'); assert.equal(isoLocal(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});
await t('H8: amounts accept Bengali digits and the Taka sign; a comma only counts as digit grouping (1,5 is rejected, not read as 15)', async () => {
  const { evalExpr } = await import('../domain/expr.js');
  assert.equal(evalExpr('\u09EB\u09E6\u09E6'), 500); assert.equal(evalExpr('\u09F3\u09E7,\u09E8\u09E6\u09E6'), 1200); assert.equal(evalExpr('\u09EB + \u09E9'), 8); assert.equal(evalExpr('\u09E7\u09E6\u09E6\u00D7\u09E8'), 200); assert.equal(evalExpr('\u09E8\u09EB.\u09EB'), 25.5);
  assert.equal(evalExpr('1,200 \u00D7 2'), 2400, 'western grouping'); assert.equal(evalExpr('1,20,000'), 120000, 'lakh grouping, the one the app itself prints'); assert.equal(evalExpr('12,34,567.50'), 1234567.5); assert.equal(evalExpr('1,200,300+1'), 1200301);
  assert.equal(evalExpr('1,5'), null, 'a decimal comma is a typo here, not 15'); assert.equal(evalExpr('5,'), null); assert.equal(evalExpr('1,2345'), null); assert.equal(evalExpr('12,34'), null);
  assert.equal(evalExpr('500'), 500); assert.equal(evalExpr('(20+5)/2'), 12.5); assert.equal(evalExpr('abc'), null); assert.equal(evalExpr('5/0'), null);
});
await t('H9: CSV keeps a negative adjustment as a number; text cells that look like formulas are still defused', async () => {
  const { entriesToCsv } = await import('../data/export.js');
  const day = { lunch: 100, entries: [{ id: 'a', cat: 'lunch', amt: 150, acct: 'cash', note: '=1+1', ts: 1 }, { id: 'adj_lunch', cat: 'lunch', amt: -50, acct: 'cash', note: '-note', ts: 2, adj: true }] };
  const rows = entriesToCsv({ days: [{ y: 2026, m: 9, d: 7, doc: day }], expense: [{ id: 'lunch', label: 'Lunch' }], income: [], accounts: [{ id: 'cash', label: 'Cash' }], catIds: ['lunch'], defaultAcct: 'cash', now: 0 }).split('\r\n').map(l => l.split(','));
  assert.deepEqual(rows[0], ['Date', 'Type', 'Category', 'Amount', 'Account', 'Note']);
  assert.equal(rows[1][3], '150'); assert.equal(rows[2][3], '-50', 'negative Amount stays a plain number (was \'-50, which Excel reads as text)');
  assert.equal(rows[1][5], "'=1+1", 'a note that starts with = is still defused'); assert.equal(rows[2][5], "'-note");
});
await t('L1: categoryUseCounts gives the same numbers as categoryUseCount for every category, in one pass', () => {
  const days = [{ doc: { lunch: 50, entries: [{ id: '1', cat: 'lunch', amt: 50 }] } }, { doc: { lunch: 30, dinner: 20 } },
    { doc: { lunch: 15, self: 100, entries: [{ id: 'a', cat: 'lunch', amt: 10 }, { id: 'b', cat: 'lunch', amt: 5 }, { id: 'c', cat: 'self', amt: 100 }] } }, { doc: {} }, { doc: { dinner: 0, entries: [] } }, { doc: null }];
  const ids = ['lunch', 'dinner', 'transport', 'self'], all = CT.categoryUseCounts(days, ids);
  ids.forEach(id => assert.equal(all[id], CT.categoryUseCount(days, id), id));
  assert.deepEqual(all, { lunch: 4, dinner: 1, transport: 0, self: 1 });
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { repo } = mk(async () => true);
  assert.equal(typeof repo.categoryUseCounts, 'function'); assert.equal(repo.categoryUseCounts().lunch, 0);
});
await t('L3: adding an entry with an older time (Undo of a delete) keeps entries in time order, so reconcile() sees no change', () => {
  const c = { catIds: CATS, defaultAcct: 'cash', now: 1000 };
  let doc = addEntry({}, { cat: 'lunch', amt: 100, ts: 2000 }, c).doc; doc = addEntry(doc, { cat: 'dinner', amt: 50, ts: 1000 }, c).doc;
  assert.deepEqual(doc.entries.map(e => e.cat), ['dinner', 'lunch']); assert.equal(reconcile(doc, CATS, c).changed, false, 'no "safety backup" prompt for a pure re-order');
  const del = deleteEntry(doc, doc.entries[0].id, c); doc = restoreEntry(del.doc, del.removed, c).doc;
  assert.deepEqual(doc.entries.map(e => e.cat), ['dinner', 'lunch']); assert.equal(reconcile(doc, CATS, c).changed, false);
});
await t('L4: worstBudget is the category furthest over its budget, not the first one stuck at 100%', async () => {
  reset(); Object.keys(cloud).forEach(k => delete cloud[k]); const { repo } = mk(async () => true);
  repo.setBudgets({ lunch: 100, dinner: 100, transport: 100 });
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 150, acct: 'cash' }); await repo.addEntry(2026, 9, 7, { cat: 'dinner', amt: 300, acct: 'cash' }); await repo.addEntry(2026, 9, 7, { cat: 'transport', amt: 20, acct: 'cash' });
  const td = todayModel(repo, new Date(2026, 9, 7)); assert.equal(td.worstBudget.id, 'dinner', 'dinner is 3x over, lunch 1.5x');
  assert.equal(td.budgets.find(b => b.id === 'lunch').pct, 100, 'pct itself is still capped at 100 (the bar)');
});
console.log(`${n} test groups passed (incl. expr, view-models, plan, insights, search, categories, report, calculator, pwa, audit round 2)`);
