import assert from 'node:assert/strict';

const mem = {};
const ls = {
  getItem: k => k in mem ? mem[k] : null,
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
  get length() { return Object.keys(mem).length; },
  key: i => Object.keys(mem)[i] ?? null
};
globalThis.window = { localStorage: ls, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const { createStore } = await import('../../shared/store.js');
const { initialSync } = await import('../data/sync.js');
const { NEW_KEYS } = await import('../data/keys.js');
const { createRepo } = await import('../data/storage.js');

const reset = () => Object.keys(mem).forEach(k => delete mem[k]);
const settle = () => new Promise(r => setTimeout(r, 10));
const fakeRepo = () => {
  const days = {};
  return { days, applyRemote: { day: (id, data) => { days[id] = data; } } };
};
const makeRemote = (docs, calls, failIncremental = false) => ({
  async list(collection, options) {
    assert.equal(collection, 'moneytracker');
    calls.push(options);
    if (options?.since && failIncremental) throw new Error('query unavailable');
    return options?.since ? docs.filter(x => Number(x.data.updatedAt) > options.since) : docs;
  },
  async get() { return null; },
  async set() {},
  async del() {}
});
const run = async (name, fn) => { await fn(); console.log('  ok ' + name); };

let originalNow = Date.now;
try {
  await run('Money day writes carry an updatedAt timestamp for incremental pulls', async () => {
    reset(); let written;
    const remote = { async list() { return []; }, async get() { return null; }, async set(path, data) { if (path === 'moneytracker/2026_10_7') written = data; }, async del() {} };
    const store = createStore({ outboxKey: NEW_KEYS.outbox, remote });
    const repo = createRepo({ store, backupGuard: async () => true, today: () => new Date(2026, 9, 7), now: () => 2000 });
    await repo.addEntry(2026, 9, 7, { cat: 'lunch', amt: 10 });
    await store.flush();
    assert.equal(written.updatedAt, 2000);
  });

  await run('first sync is full, later sync requests only changed days', async () => {
    reset(); const calls = []; const repo = fakeRepo();
    const remote = makeRemote([{ id: '2026_10_7', data: { updatedAt: 1100, lunch: 1 } }, { id: '2026_10_8', data: { updatedAt: 1200, lunch: 2 } }], calls);
    const store = createStore({ outboxKey: NEW_KEYS.outbox, remote });
    Date.now = () => 1000; await initialSync(repo, store);
    Date.now = () => 1300; await initialSync(repo, store);
    assert.deepEqual(calls, [{}, { since: 1000 }]);
    assert.equal(repo.days['2026_10_8'].lunch, 2);
  });

  await run('incremental query failure falls back to a full pull', async () => {
    reset(); const calls = []; const repo = fakeRepo();
    const remote = makeRemote([{ id: '2026_10_7', data: { updatedAt: 1100, lunch: 3 } }], calls, true);
    const store = createStore({ outboxKey: NEW_KEYS.outbox, remote });
    store.set(NEW_KEYS.sync, { last: 1000 }); Date.now = () => 1300;
    const report = await initialSync(repo, store);
    assert.deepEqual(calls, [{ since: 1000 }, undefined]);
    assert.equal(report.errors.length, 0);
    assert.equal(repo.days['2026_10_7'].lunch, 3);
  });
} finally {
  Date.now = originalNow;
}

await settle();
console.log('3 incremental sync test groups passed');
