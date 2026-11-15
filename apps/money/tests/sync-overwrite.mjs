// M4 regression test: deletions must reach the cloud. Run from the repo root:  node apps/money/tests/sync-overwrite.mjs
// It loads the REAL apps/shared/firestore.js (only the Firebase imports are swapped for an in-memory fake),
// then drives the real repo + store through it. Invariant after every action: cloud document == local document.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = {}; const ls = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, get length() { return Object.keys(mem).length; }, key: i => Object.keys(mem)[i] ?? null };
globalThis.window = { localStorage: ls, addEventListener() {} }; Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const reset = () => Object.keys(mem).forEach(k => delete mem[k]);

// ---- load the real firestore.js with a fake Firebase SDK ----
const cloud = {};                                                    // 'moneytracker/2026_10_7' -> doc
const clone = x => JSON.parse(JSON.stringify(x));
globalThis.__fakeFs = {
  doc: (_db, ...seg) => ({ path: seg.slice(2).join('/') }),
  collection: (_db, ...seg) => ({ coll: seg.slice(2).join('/') }),
  async getDoc(ref) { const d = cloud[ref.path]; return { exists: () => d !== undefined, data: () => clone(d) }; },
  async setDoc(ref, data) { assert.ok(!JSON.stringify(data, (k, v) => v === undefined ? '__undef__' : v).includes('__undef__'), 'Firestore rejects undefined values'); cloud[ref.path] = clone(data); },
  async deleteDoc(ref) { delete cloud[ref.path]; },
  async getDocs(c) { return { docs: Object.entries(cloud).filter(([p]) => p.startsWith(c.coll + '/')).map(([p, d]) => ({ id: p.slice(c.coll.length + 1), data: () => clone(d) })) }; }
};
let src = readFileSync(new URL('../../shared/firestore.js', import.meta.url), 'utf8');
const swap = (from, to) => { assert.ok(src.includes(from), 'firestore.js changed shape, update this test: ' + from); src = src.replace(from, to); };
swap("import { auth, db } from '../../firebase-config.js';", "const auth = { currentUser: { uid: 'u1' } }; const db = {};");
swap("const fs = () => fsP || (fsP = import(BASE + 'firebase-firestore.js'));", 'const fs = async () => globalThis.__fakeFs;');
const { firestoreRemote } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const { createStore } = await import('../../shared/store.js');
const { createRepo } = await import('../data/storage.js');
const { initialSync } = await import('../data/sync.js');
const { parseBackup, planImport, buildBackup } = await import('../data/backup.js');
const settle = () => new Promise(r => setTimeout(r, 30));
const mk = overwrite => { const store = createStore({ outboxKey: 'mt2_outbox_v1', remote: firestoreRemote({ overwrite }) }); return { store, repo: createRepo({ store, backupGuard: async () => true, today: () => new Date(2026, 9, 7), now: () => 5000 }) }; };
const fresh = () => { reset(); Object.keys(cloud).forEach(k => delete cloud[k]); };
const flushAll = async store => { await store.flush(); await settle(); assert.equal(store.pendingCount(), 0, 'outbox drained'); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok ' + name); };

// Each scenario returns [cloudValue, localValue] for the thing that was deleted.
const scenarios = {
  'delete an entry': async ({ repo }) => { const r = await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 100, note: 'Biryani' }); await flushAll(repo._store); await repo.deleteEntry(2026, 9, 7, r.entry.id); return ['moneytracker/2026_10_7', 'mt_2026_10_7']; },
  'clear a note': async ({ repo }) => { const r = await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 100, note: 'Biryani' }); await flushAll(repo._store); await repo.updateEntry(2026, 9, 7, r.entry.id, { note: '' }); return ['moneytracker/2026_10_7', 'mt_2026_10_7']; },
  'delete a debt': async ({ repo }) => { repo.addDebt({ type: 'borrowed', person: 'Rafi', amount: 300, accountId: 'cash', date: '2026-10-07' }); await flushAll(repo._store); repo.removeDebt(repo.settings.debts[0].id); return ['moneytracker_meta/debts', 'mt_debts_v1', d => d.items, d => d]; },
  'delete a category': async ({ repo }) => { const c = repo.addCategory('expense', { label: 'Gifts', icon: 'g' }); await flushAll(repo._store); repo.deleteCategory('expense', c.id); return ['moneytracker_meta/settings', 'mt_categories_v1', d => d.expense, d => d.expense]; },
  'delete the last template': async ({ repo }) => { const t = repo.addTemplate({ label: 'Lunch', cat: 'lunch', amt: 50 }); await flushAll(repo._store); repo.removeTemplate(t.id); return ['moneytracker_meta/settings', 'mt2_templates_v1', d => d.templates, d => d]; }
};

for (const [name, run] of Object.entries(scenarios)) {
  await t(`overwrite: "${name}" reaches the cloud, and a fresh device pulls the same state`, async () => {
    fresh(); const { store, repo } = mk(true); repo._store = store;
    const [path, key, pickC = d => d, pickL = d => d] = await run({ repo }); await flushAll(store);
    assert.ok(same(pickC(cloud[path]), pickL(store.get(key))), `cloud ${path} must equal local ${key}`);
    // a second, empty device signs in and pulls: it must end up with exactly the same deleted-state
    reset(); const b = mk(true); await initialSync(b.repo, b.store, () => {});
    if (name === 'delete a debt') assert.equal(b.repo.settings.debts.length, 0);
    if (name === 'delete the last template') assert.equal(b.repo.settings.templates.length, 0);
    if (name === 'delete a category') assert.equal(b.repo.settings.expense.some(c => c.label === 'Gifts'), false);
    if (name === 'delete an entry') assert.equal((b.store.get('mt_2026_10_7') || {}).lunch || 0, 0);
    if (name === 'clear a note') assert.equal((b.store.get('mt_2026_10_7') || {}).note_lunch ?? '', '');
  });
}

await t('overwrite: Import → Replace really replaces (extra categories and debts in the cloud are gone)', async () => {
  fresh(); const { store, repo } = mk(true);
  const extra = repo.addCategory('expense', { label: 'Gifts', icon: 'g' }); repo.addDebt({ type: 'lent', person: 'A', amount: 5, accountId: 'cash', date: '2026-10-07' });
  await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 10 }); await flushAll(store);
  assert.ok(cloud['moneytracker_meta/settings'].expense.some(c => c.id === extra.id));
  const base = repo.settings.expense.filter(c => c.id !== extra.id);
  const json = JSON.stringify({ version: 1, exportedAt: 'x', categories: { expense: base, income: repo.settings.income }, goal: 0, accounts: repo.settings.accounts, ledger: [], debts: [], days: { mt_2026_10_7: { lunch: 77, acct_lunch: 'cash', ts_lunch: 1 } } });
  const parsed = parseBackup(json); assert.equal(parsed.ok, true);
  const local = { days: Object.fromEntries(repo.listDays().map(x => [x.key, x.doc])), ...repo.settings };
  repo.applyImport(planImport({ mode: 'replace', local, payload: parsed.payload, cloudDayIds: ['2026_10_7'] }), parsed.payload); await flushAll(store);
  assert.equal(cloud['moneytracker_meta/settings'].expense.some(c => c.id === extra.id), false, 'extra category removed from cloud');
  assert.deepEqual(cloud['moneytracker_meta/debts'].items, [], 'debts removed from cloud');
  assert.equal(cloud['moneytracker/2026_10_7'].lunch, 77, 'day replaced by backup');
});

await t('default (merge) mode is untouched: still unions with the cloud copy (Health relies on it)', async () => {
  fresh(); const { store, repo } = mk(false); repo._store = store;
  const [path, key] = await scenarios['delete an entry']({ repo }); await flushAll(store);
  assert.ok(!same(cloud[path], store.get(key)), 'merge mode keeps the deleted entry in the cloud (the old M4 behaviour, kept for other apps)');
});

console.log(`${n} sync test groups passed`);
