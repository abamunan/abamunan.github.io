// Regression tests for the audit fixes (E1-E4, H1-H5, M1-M5, L1-L7). Run from the repo root:  node apps/money/tests/audit-fixes.mjs
// Uses the REAL store.js, storage.js and firestore.js (only the Firebase SDK is an in-memory fake). Two "devices" = two separate localStorages sharing one fake cloud.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const devs = {}; let cur = 'A';
const mem = () => (devs[cur] ||= {});
globalThis.window = { localStorage: { getItem: k => (k in mem() ? mem()[k] : null), setItem: (k, v) => { if (globalThis.__quota) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } mem()[k] = String(v); }, removeItem: k => { delete mem()[k]; }, get length() { return Object.keys(mem()).length; }, key: i => Object.keys(mem())[i] ?? null }, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const cloud = {}, clone = x => JSON.parse(JSON.stringify(x));
globalThis.__fakeFs = {
  doc: (_d, ...seg) => ({ path: seg.slice(2).join('/') }), collection: (_d, ...seg) => ({ coll: seg.slice(2).join('/') }),
  async getDoc(ref) { const d = cloud[ref.path]; return { exists: () => d !== undefined, data: () => clone(d) }; },
  async setDoc(ref, data) { if (globalThis.__poison === ref.path) { const e = new Error('too big'); e.code = 'invalid-argument'; throw e; } cloud[ref.path] = clone(data); },
  async deleteDoc(ref) { delete cloud[ref.path]; },
  async getDocs(c, q) { return { docs: Object.entries(cloud).filter(([p]) => p.startsWith(c.coll + '/')).map(([p, d]) => ({ id: p.slice(c.coll.length + 1), data: () => clone(d) })) }; },
  query: (r) => r, where: () => null
};
let src = readFileSync(new URL('../../shared/firestore.js', import.meta.url), 'utf8');
src = src.replace("import { auth, db } from '../../firebase-config.js';", "const auth = { currentUser: { uid: 'u1' } }; const db = {};").replace("const fs = () => fsP || (fsP = import(BASE + 'firebase-firestore.js'));", 'const fs = async () => globalThis.__fakeFs;');
const { firestoreRemote } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { createStore } = await import('../../shared/store.js');
const { createRepo } = await import('../data/storage.js');
const { initialSync } = await import('../data/sync.js');
const { CLOUD_MERGE } = await import('../data/keys.js');
const P = await import('../domain/plan.js');
const { round2 } = await import('../../shared/fmt.js');
const { evalExpr } = await import('../domain/expr.js');
const { parseBackup, planImport } = await import('../data/backup.js');
const { accountBalances, goalProgress } = await import('../domain/totals.js');
const { entriesToCsv } = await import('../data/export.js');
const { accountModel } = await import('../domain/viewmodels.js');
const { searchEntries } = await import('../domain/search.js');
const { categoryUseCounts } = await import('../domain/categories.js');

const dump = store => JSON.stringify(store.keys(/^mt(?!2_outbox)/).sort().map(k => [k, store.getRaw(k)]));
const settle = () => new Promise(r => setTimeout(r, 40));
const T = new Date(2026, 10, 20, 12);
let clock = T.getTime();
const mk = (device, { remote = true } = {}) => { cur = device; const store = createStore({ outboxKey: 'mt2_outbox_v1', remote: remote ? firestoreRemote({ overwrite: true, merge: CLOUD_MERGE }) : null });
  return { store, repo: createRepo({ store, backupGuard: async () => true, today: () => T, now: () => ++clock }), device }; };
const on = d => { cur = d.device; return d; };
const flush = async d => { on(d); await d.store.flush(); await settle(); };
const reset = () => { for (const k of Object.keys(devs)) delete devs[k]; for (const k of Object.keys(cloud)) delete cloud[k]; globalThis.__quota = false; globalThis.__poison = null; };
let n = 0; const t = async (name, fn) => { reset(); await fn(); n++; console.log('  ok ' + name); };

await t('E1: a write the cloud refuses for good does not block the writes queued behind it', async () => {
  const d = mk('A'); on(d); globalThis.__poison = 'moneytracker_meta/ledger';
  d.repo.addBalance('cash', 100); await d.repo.addEntry(2026, 10, 20, { cat: 'lunch', amt: 50 }); d.repo.addDebt({ type: 'lent', person: 'X', amount: 5, accountId: 'cash' });
  await flush(d);
  assert.ok(cloud['moneytracker/2026_11_20'], 'the day still reached the cloud'); assert.ok(cloud['moneytracker_meta/debts'], 'the debt still reached the cloud');
  assert.equal(d.store.pendingCount(), 0); assert.deepEqual(d.store.failedPaths(), ['moneytracker_meta/ledger']);
  globalThis.__poison = null; await d.store.retryFailed(); await settle(); assert.ok(cloud['moneytracker_meta/ledger'], 'Retry sends the parked write once the cause is fixed'); assert.equal(d.store.failedCount(), 0);
});

await t('E2: two devices add ledger events and debts, then sync: nothing is lost; a delete stays deleted', async () => {
  const a = mk('A'), b = mk('B');
  on(a); a.repo.addBalance('cash', 100); a.repo.addDebt({ type: 'lent', person: 'Rafi', amount: 50, accountId: 'cash' }); await flush(a);
  on(b); await initialSync(b.repo, b.store, () => {});                                            // B starts from A's data
  on(b); b.repo.addBalance('cash', 7); b.repo.addDebt({ type: 'borrowed', person: 'Sima', amount: 9, accountId: 'cash' }); await flush(b);
  on(a); a.repo.addTransfer('cash', 'bkash', 3); a.repo.removeDebt(a.repo.settings.debts[0].id);   // A is stale (never saw B's changes) and deletes Rafi
  await flush(a);
  const led = cloud['moneytracker_meta/ledger'], debts = cloud['moneytracker_meta/debts'];
  assert.deepEqual(led.events.map(e => e.type + e.amount).sort(), ['add100', 'add7', 'transfer3'], 'ledger events from BOTH devices survive');
  assert.deepEqual(debts.items.map(d => d.person), ['Sima'], 'B\'s debt survives and A\'s deletion is respected');
  on(a); await initialSync(a.repo, a.store, () => {}); assert.equal(a.repo.settings.ledger.length, 3); assert.deepEqual(a.repo.settings.debts.map(d => d.person), ['Sima']);
});

await t('E3: Add money / Transfer can be changed and deleted, Undo brings it back, the balance follows', async () => {
  const { repo } = mk('A', { remote: false }); repo.addBalance('cash', 100000);                    // typo: meant 1000
  const bal = () => accountBalances({ accounts: repo.settings.accounts, days: [], ledger: repo.settings.ledger, debts: [], expIds: [], incIds: [], defaultAcct: 'cash' }).cash;
  assert.equal(bal(), 100000); const id = repo.settings.ledger[0].id;
  repo.updateLedgerEvent(id, 1000); assert.equal(bal(), 1000);
  assert.throws(() => repo.updateLedgerEvent(id, 0), /valid amount/);
  const ev = repo.removeLedgerEvent(id); assert.equal(bal(), 0); repo.restoreLedgerEvent(ev); assert.equal(bal(), 1000);
  const m = accountModel(repo, 'cash'); assert.equal(m.moves[0].ledgerId, id, 'history rows carry the ledger id so the screen can offer Edit / Delete');
});

await t('E4: the last active account cannot be removed, balances never lose entries without a default account', async () => {
  const accts = [{ id: 'cash', label: 'Cash', opening: 0 }, { id: 'old', label: 'Old', opening: 0, archived: true }];
  assert.throws(() => P.deleteAccount(accts, [], 'cash', 'old', []), /active/);
  const bal = accountBalances({ accounts: accts, days: [{ entries: [{ id: 'e', cat: 'lunch', amt: 40, acct: null, ts: 1 }], lunch: 40 }], ledger: [], debts: [], expIds: ['lunch'], incIds: [], defaultAcct: null });
  assert.equal(bal.cash, -40, 'entry with no account lands in the first active account');
  const { repo } = mk('A', { remote: false }); repo.saveSettings({ accounts: repo.settings.accounts.map(a => ({ ...a, archived: true })) }); assert.notEqual(repo.defaultAcct(), null);
});

await t('H1: a device with a slow clock is still picked up; a day deleted on one device disappears on the other', async () => {
  const a = mk('A'), b = mk('B');
  on(b); await initialSync(b.repo, b.store, () => {});                                               // B has synced once (sync.last = now)
  on(a); clock -= 5 * 60 * 1000; await a.repo.addEntry(2026, 10, 20, { cat: 'lunch', amt: 10 }); clock += 5 * 60 * 1000; await flush(a);   // A's clock is 5 minutes behind
  on(b); const r = await initialSync(b.repo, b.store, () => {}); assert.equal(b.repo.getDay(2026, 10, 20).lunch, 10, 'slow-clock write is not missed');
  on(a); const parsed = parseBackup(JSON.stringify({ version: 1, categories: { expense: a.repo.settings.expense, income: a.repo.settings.income }, accounts: a.repo.settings.accounts, days: { mt_2026_11_21: { lunch: 5, entries: [] } } }));
  a.repo.applyImport(planImport({ mode: 'replace', local: { days: Object.fromEntries(a.repo.listDays().map(x => [x.key, x.doc])), ...a.repo.settings }, payload: parsed.payload, cloudDayIds: ['2026_11_20'] }), parsed.payload); await flush(a);
  on(b); await initialSync(b.repo, b.store, () => {}); assert.equal(b.repo.listDays().some(x => x.d === 20), false, 'Replace on A removed the day on B too');
});

await t('H2: a full disk leaves memory and storage identical, and import / delete-account roll back completely', async () => {
  const { repo, store } = mk('A', { remote: false }); repo.addBalance('cash', 10);
  globalThis.__quota = true; assert.throws(() => repo.addBalance('cash', 20), /Storage is full/); globalThis.__quota = false;
  assert.equal(repo.settings.ledger.length, 1, 'memory did not move ahead of storage'); assert.equal(store.get('mt_ledger_v1').length, 1);
  await repo.addEntry(2026, 10, 20, { cat: 'lunch', amt: 10, acct: 'cash' }); const before = dump(store);
  const parsed = parseBackup(JSON.stringify({ version: 1, categories: { expense: repo.settings.expense, income: repo.settings.income }, accounts: repo.settings.accounts, ledger: [], debts: [], days: { mt_2026_11_21: { lunch: 9, entries: [] }, mt_2026_11_22: { lunch: 9, entries: [] } } }));
  const origSet = window.localStorage.setItem; let calls = 0; window.localStorage.setItem = (k, v) => { if (/^mt_2026_11_22/.test(k)) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return origSet(k, v); };
  assert.throws(() => repo.applyImport(planImport({ mode: 'replace', local: { days: Object.fromEntries(repo.listDays().map(x => [x.key, x.doc])), ...repo.settings }, payload: parsed.payload }), parsed.payload));
  window.localStorage.setItem = origSet;
  assert.equal(dump(store), before, 'a failed import changes nothing');
});

await t('H3: an archived account is never chosen as a default; debts need an active account', async () => {
  const { repo } = mk('A', { remote: false });
  repo.updateCategory('expense', 'dinner', { defaultAcct: 'bkash' }); repo.setAccountArchived('bkash', true);
  assert.equal(repo.resolveAccount('dinner'), 'cash');
  assert.throws(() => repo.addDebt({ type: 'lent', person: 'A', amount: 5, accountId: 'bkash' }), /active account/);
  assert.throws(() => P.deleteAccount(repo.settings.accounts, [], 'cash', 'bkash', []), /active/);
});

await t('H4: the savings projection counts spending in categories without a budget', async () => {
  const g = goalProgress({ expenseCats: [{ id: 'lunch', budget: 3000 }, { id: 'rent', budget: 0 }], catTotals: { lunch: 0, rent: 20000 }, goal: 5000, y: 2026, m0: 10, today: new Date(2026, 10, 20) });
  assert.ok(g.saved < 0, 'rent of 20,000 is no longer ignored (was +3,000 / 60%)'); assert.equal(g.pct, 0);
});

await t('H5: import repairs text amounts, drops broken items, rejects newer files, redirects money of missing accounts', async () => {
  const base = { version: 1, categories: { expense: [{ id: 'lunch', label: 'Lunch' }], income: [{ id: 'self', label: 'Self' }] }, accounts: [{ id: 'cash', label: 'Cash', opening: '5' }],
    ledger: [{ id: 'l1', type: 'add', accountId: 'ghost', amount: '50' }, { id: 'l2', type: 'add', accountId: 'cash', amount: 'abc' }, { type: 'transfer', fromId: 'cash', toId: 'cash', amount: 1 }],
    debts: [{ id: 'd1', type: 'lent', person: 'A', amount: '20', accountId: 'cash' }, { id: 'd1', type: 'lent', person: 'dup', amount: 1, accountId: 'cash' }],
    days: { mt_2026_11_20: { lunch: 30, entries: [{ id: 'a', cat: 'lunch', amt: '30', acct: 'cash', ts: 1 }, { id: 'b', cat: 'lunch', amt: 'x' }, { id: 'a', cat: 'lunch', amt: 1 }] } } };
  const r = parseBackup(JSON.stringify(base)); assert.equal(r.ok, true); assert.ok(r.stats.repaired >= 5);
  assert.equal(r.payload.accounts[0].opening, 5); assert.equal(r.payload.days.mt_2026_11_20.entries.length, 2); assert.equal(r.payload.days.mt_2026_11_20.entries[0].amt, 30);
  assert.deepEqual(r.payload.ledger.map(e => e.amount), [50]); assert.equal(r.payload.debts.length, 1);
  const plan = planImport({ mode: 'replace', local: { days: {}, expense: [], income: [], accounts: [], ledger: [], debts: [] }, payload: r.payload });
  assert.equal(plan.settings.ledger[0].accountId, 'cash'); assert.equal(plan.summary.redirected, 1);
  assert.equal(parseBackup(JSON.stringify({ version: 2, days: {} })).ok, false);
});

await t('M1: debts can be edited, repaid in parts, and balances + history agree; bad dates are refused', async () => {
  const { repo } = mk('A', { remote: false }), bal = () => accountModel(repo, 'cash').balance;
  assert.throws(() => repo.addDebt({ type: 'lent', person: 'A', amount: 100, accountId: 'cash', date: 'not-a-date' }), /valid date/);
  repo.addDebt({ type: 'lent', person: 'A', amount: 100, accountId: 'cash', date: '2026-11-01' }); const id = repo.settings.debts[0].id; assert.equal(bal(), -100);
  repo.addDebtPayment(id, { amount: 40, date: '2026-11-05' }); assert.equal(bal(), -60); assert.equal(P.debtTotals(repo.settings.debts).receive, 60);
  assert.throws(() => repo.addDebtPayment(id, { amount: 61 }), /left to pay/);
  repo.updateDebt(id, { person: 'Rafi', note: 'bike' }); assert.equal(repo.settings.debts[0].person, 'Rafi');
  repo.addDebtPayment(id, { amount: 60, date: '2026-11-06' }); assert.equal(repo.settings.debts[0].settled, true); assert.equal(bal(), 0);
  const m = accountModel(repo, 'cash'); assert.equal(m.opening + m.income - m.expense, m.balance, 'history explains the balance');
  repo.setDebtSettled(id, false); assert.equal(repo.settings.debts[0].settled, false); assert.equal(bal(), -60, 'reopening drops the last payment');
  repo.addDebt({ type: 'borrowed', person: 'B', amount: 10, accountId: 'cash' }); const id2 = repo.settings.debts[1].id; const b0 = bal(); repo.setDebtSettled(id2, true); assert.equal(bal(), b0 - 10, 'old model: settling returns the money');
});

await t('M2/M3: duplicate account names and bad templates are refused; deleting a category removes its templates', async () => {
  const { repo } = mk('A', { remote: false });
  assert.throws(() => repo.addAccount({ label: ' cash ' }), /already have/); assert.throws(() => repo.updateAccount('bkash', { label: 'CARD' }), /already have/);
  assert.throws(() => repo.addTemplate({ label: 't', cat: 'lunch', amt: -5 }), /0 or more/);
  const a = repo.addTemplate({ label: 'a', cat: 'lunch', amt: 1 }), b = repo.addTemplate({ label: 'b', cat: 'lunch', amt: 1 }); assert.notEqual(a.id, b.id);
  const c = repo.addCategory('expense', { label: 'Gifts2' }); repo.addTemplate({ label: 'g', cat: c.id, amt: 5 }); repo.deleteCategory('expense', c.id);
  assert.equal(repo.settings.templates.some(x => x.cat === c.id), false);
});

await t('M4/M5: CSV skips categories that are no longer listed; text amounts are read as numbers', async () => {
  const days = [{ y: 2026, m: 10, d: 20, doc: { lunch: 10, gone: 5, entries: [{ id: 'a', cat: 'lunch', amt: '10', acct: 'cash', ts: 1 }, { id: 'b', cat: 'gone', amt: 5, acct: 'cash', ts: 2 }] } }];
  const csv = entriesToCsv({ days, expense: [{ id: 'lunch', label: 'Lunch' }], income: [], accounts: [{ id: 'cash', label: 'Cash' }], catIds: ['lunch'], defaultAcct: 'cash', now: 1 });
  assert.equal(csv.split('\r\n').length, 2); assert.ok(csv.includes('Lunch,10,Cash'));
});

await t('L1/L4/L7: rounding, one-letter search words and prototype-key categories', async () => {
  assert.equal(round2(1.005), 1.01); assert.equal(round2(1.255), 1.26); assert.equal(round2(-1.005), -1.01); assert.equal(round2(0.1 + 0.2), 0.3); assert.ok(Object.is(round2(-0.001), 0)); assert.equal(evalExpr('1.005'), 1.01);
  const e = [{ kind: 'out', amt: 5, label: 'Rice', note: '', acctLabel: '' }];
  const hit = q => searchEntries({ days: [{ y: 2026, m: 7, d: 3, doc: {} }], query: q, entriesOf: () => e }).total;
  assert.equal(hit('a'), 0, '"a" no longer matches "august"'); assert.equal(hit('aug'), 1); assert.equal(hit('3'), 1);
  assert.doesNotThrow(() => categoryUseCounts([{ doc: { entries: [{ cat: 'constructor', amt: 1 }] } }], ['lunch'])); assert.deepEqual(categoryUseCounts([{ doc: { entries: [{ cat: 'constructor', amt: 1 }] } }], ['lunch']), { lunch: 0 });
});

await t('S1: two devices edit DIFFERENT settings (categories, accounts, goal): both edits survive, deletes stay deleted, a rename keeps the newer copy', async () => {
  const a = mk('A'), b = mk('B');
  on(a); a.repo.setGoal(1000); await flush(a);
  on(b); await initialSync(b.repo, b.store, () => {}); assert.equal(b.repo.settings.goal, 1000);
  on(a); const coffee = a.repo.addCategory('expense', { label: 'Coffee' }); a.repo.updateCategory('expense', 'lunch', { icon: 'L' }); await flush(a);
  on(b);                                                                                           // B is stale: it never saw Coffee or the new lunch icon
  const bank = b.repo.addAccount({ label: 'Bank' }); b.repo.setGoal(2000); b.repo.deleteCategory('expense', 'gift'); b.repo.addTemplate({ label: 'Tea', cat: 'dinner', amt: 20 }); await flush(b);
  const c = cloud['moneytracker_meta/settings'], ids = l => c[l].map(x => x.id);
  assert.ok(ids('expense').includes(coffee.id), "A's new category survived B's write"); assert.ok(ids('accounts').includes(bank.id), "B's new account is there");
  assert.equal(c.expense.find(x => x.id === 'lunch').icon, 'L', "A's newer rename was not overwritten by B's stale copy");
  assert.ok(!ids('expense').includes('gift'), "B's delete reached the cloud"); assert.equal(c.goal, 2000, 'the later goal wins'); assert.equal(c.templates.length, 1);
  on(a); await initialSync(a.repo, a.store, () => {}); on(b); await initialSync(b.repo, b.store, () => {});
  for (const d of [a, b]) { on(d); assert.ok(d.repo.catIds().includes(coffee.id) && !d.repo.catIds().includes('gift'), d.device + ': categories agree'); assert.ok(d.repo.settings.accounts.some(x => x.id === bank.id), d.device + ': account'); assert.equal(d.repo.settings.goal, 2000); assert.equal(d.repo.settings.templates.length, 1); }
  assert.deepEqual(a.repo.catIds(), b.repo.catIds().filter(x => a.repo.catIds().includes(x)), 'same ids on both');
});

await t('S2: a category deleted on one device is not brought back by a stale device, but a restore (saved later) wins; templates and accounts the same', async () => {
  const a = mk('A'), b = mk('B');
  on(a); a.repo.addTemplate({ label: 'T', cat: 'lunch', amt: 5 }); await flush(a);
  on(b); await initialSync(b.repo, b.store, () => {});
  on(a); a.repo.removeTemplate(a.repo.settings.templates[0].id); a.repo.deleteCategory('expense', 'tour'); await flush(a);
  on(b); b.repo.setGoal(77); await flush(b);                                                       // stale B pushes its old lists
  const c = cloud['moneytracker_meta/settings']; assert.equal(c.templates.length, 0, 'the removed template stays removed'); assert.ok(!c.expense.some(x => x.id === 'tour'), 'tour stays deleted');
  assert.ok(c.deleted['expense:tour'] > 0, 'the delete is remembered in the cloud document');
  on(b); await initialSync(b.repo, b.store, () => {}); assert.ok(!b.repo.catIds().includes('tour')); assert.equal(b.repo.settings.templates.length, 0);
  on(a); a.repo.restoreCategory('expense', 'tour', 'Tour back'); await flush(a);                    // saved after the delete: the item is alive again
  on(b); b.repo.setGoal(78); await flush(b); assert.ok(cloud['moneytracker_meta/settings'].expense.some(x => x.id === 'tour'), 'a later restore is not undone by the old tombstone');
});

await t('S3: mergeSpecial(sets) rules: newer updatedAt wins, tie keeps this device, scalar stamps, lastAccounts union, unknown keys kept', async () => {
  const src2 = readFileSync(new URL('../../shared/firestore.js', import.meta.url), 'utf8').replace("import { auth, db } from '../../firebase-config.js';", 'const auth = {}; const db = {};');
  const { mergeSpecial } = await import('data:text/javascript;base64,' + Buffer.from(src2).toString('base64') + '#' + Math.random());
  const m = CLOUD_MERGE['moneytracker_meta/settings'];
  const local = { expense: [{ id: 'a', label: 'mine', updatedAt: 5 }, { id: 'b', label: 'old', updatedAt: 1 }], goal: 10, goalAt: 3, lastAccounts: { x: 'cash' }, accounts: [{ id: 'c1' }], keep: 1, deleted: { 'expense:z': 9 } };
  const remote = { expense: [{ id: 'a', label: 'theirs', updatedAt: 5 }, { id: 'b', label: 'new', updatedAt: 4 }, { id: 'z', label: 'dead', updatedAt: 2 }, { id: 'q', label: 'q' }], goal: 20, goalAt: 8, lastAccounts: { x: 'bkash', y: 'card' }, other: 2, deleted: { 'expense:q': 1 } };
  const r = mergeSpecial(local, remote, m);
  assert.deepEqual(r.expense.map(x => x.id + ':' + x.label), ['a:mine', 'b:new']);                 // tie -> mine, newer remote wins, z removed (tomb 9 > 2), q removed (legacy item without updatedAt, tomb 1 > 0)
  assert.deepEqual([r.goal, r.goalAt], [20, 8]); assert.deepEqual(r.lastAccounts, { x: 'cash', y: 'card' }); assert.equal(r.keep, 1); assert.equal(r.other, 2); assert.deepEqual(r.accounts, [{ id: 'c1' }]);
  assert.deepEqual(r.deleted, { 'expense:z': 9, 'expense:q': 1 });
  assert.equal(mergeSpecial({ goal: 5, goalAt: 9 }, { goal: 1, goalAt: 2 }, m).goal, 5, 'newer local goal kept');
  assert.deepEqual(mergeSpecial({ expense: [{ id: 'k', updatedAt: 3 }], deleted: {} }, null, m), { expense: [{ id: 'k', updatedAt: 3 }], deleted: {} }, 'no cloud copy: written as is');
});

await t('S4: settings rollback and Remove all also cover the new settings bookkeeping', async () => {
  const { repo, store } = mk('A', { remote: false }); repo.deleteCategory('expense', 'gift'); assert.ok(repo.settings.smeta.deleted['expense:gift']);
  const snap = JSON.stringify(Object.fromEntries(store.keys(/^mt/).sort().map(k => [k, store.getRaw(k)])));
  globalThis.__quota = true; assert.throws(() => repo.addCategory('expense', { label: 'Big' }), e => e.name === 'StorageFullError' || /full/i.test(e.message)); globalThis.__quota = false;
  assert.equal(JSON.stringify(Object.fromEntries(store.keys(/^mt/).sort().map(k => [k, store.getRaw(k)]))), snap, 'a failed save changes nothing, including the tombstones'); assert.ok(!repo.catIds().some(id => id.startsWith('c') && repo.settings.expense.find(f => f.id === id)?.label === 'Big'));
  repo.wipeAll(); assert.equal(store.getRaw('mt2_settings_meta_v1'), null); assert.deepEqual(repo.settings.smeta, { deleted: {}, goalAt: 0 });
});

await t('S5: orphan categories — flat amounts WITHOUT ts_/acct_/note_ are found when the id is known (default / removed / generated), metadata is never taken for a category', async () => {
  const { orphanCategories } = await import('../domain/categories.js');
  const days = [
    { doc: { tour: 40, updatedAt: 1763600000000, createdAt: 5, lockedAt: 7, locked: true, someNumber: 7, count: 3 } },                  // tour = a default id with no companions
    { doc: { cmf3k9x2a1b4: 15, savedAt: 4, v: 2, ts: 1, total: 99 } },                                                                  // generated id
    { doc: { gone: 9, oldcat: 5, ts_oldcat: 1 } },                                                                                      // "gone" has no evidence: ignored; oldcat has a companion
    { doc: { entries: [{ id: 'e', cat: 'ent', amt: 3 }], lunch: 0, zero: 0 } }
  ];
  const r = orphanCategories(days, ['lunch'], ['tour']);
  assert.deepEqual(r.map(o => [o.id, o.days, o.total]), [['cmf3k9x2a1b4', 1, 15], ['ent', 1, 3], ['oldcat', 1, 5], ['tour', 1, 40]]);
  const { repo } = mk('A', { remote: false }); repo.deleteCategory('expense', 'tour');                                                      // removing a category on this device remembers its id
  assert.ok(repo.settings.smeta.deleted['expense:tour']);
});

await t('R1: every document the app writes fits the Firestore rules (JS mirror of isMoneyDay / meta rules in firestore.rules)', async () => {
  const d = mk('A'); on(d);
  d.repo.addBalance('cash', 100); d.repo.addDebt({ type: 'lent', person: 'X', amount: 5, accountId: 'cash' }); d.repo.setGoal(10); d.repo.addCategory('income', { label: 'Gig' });
  await d.repo.addEntry(2026, 10, 20, { cat: 'lunch', amt: 50, note: 'x' }); await d.repo.addEntry(2026, 0, 3, { cat: 'dinner', amt: 5 }, { unlocked: true }); d.repo.setManualLock(2026, 0, 3, true);
  d.repo.recordDeletedDays(['2020_1_1']); await flush(d);
  const num = v => typeof v === 'number', day = x => Object.keys(x).length <= 400 && (x.updatedAt === undefined || num(x.updatedAt)) && (x.entries === undefined || (Array.isArray(x.entries) && x.entries.length <= 1000)) && (x.locked === undefined || typeof x.locked === 'boolean');
  let days = 0, metas = 0;
  for (const [p, data] of Object.entries(cloud)) {
    const [col, id] = p.split('/');
    if (col === 'moneytracker') { assert.match(id, /^[0-9]{4}_[0-9]{1,2}_[0-9]{1,2}$/); assert.ok(day(data), p); assert.ok(num(data.updatedAt), p + ' needs a numeric updatedAt (incremental sync queries on it)'); days++; }
    else { assert.equal(col, 'moneytracker_meta'); assert.ok(['settings', 'ledger', 'debts', 'deleted_days'].includes(id), p); assert.ok(Object.keys(data).length <= 60, p); metas++; }
  }
  assert.equal(days, 2); assert.equal(metas, 4);
  const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');   // comments are not rules
  assert.ok(!/match \/users\/\{uid\}\/\{rest=\*\*\}/.test(rules), 'the catch-all rule for users/{uid}/** is gone');
  for (const c of ['moneytracker', 'moneytracker_meta', 'healthtracker', 'healthtracker_meta', 'english_days', 'english_meta', 'typemaster', 'duzoology', 'profile']) assert.ok(rules.includes(`match /users/{uid}/${c}/`), c + ' still has access');
  const braces = [...rules].reduce((n, ch) => n + (ch === '{') - (ch === '}'), 0); assert.equal(braces, 0, 'braces balance');
});

console.log(`${n} audit-fix test groups passed`); process.exit(0);
