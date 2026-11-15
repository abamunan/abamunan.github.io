// Run:  node apps/diary/tests/run.mjs      (no dependencies)
const mem = new Map();
const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); },
  get length() { return mem.size; }, key: i => [...mem.keys()][i] ?? null };
globalThis.window = { localStorage: ls, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const { createStore } = await import('../../shared/store.js');
const { createRepo } = await import('../data/storage.js');
const S = await import('../data/schema.js');
const { pull } = await import('../data/sync.js');
const { memoryBackend, lsBackend, migrateLegacy } = await import('../data/backends.js');
const R = await import('../data/restore.js');
const { createLock } = await import('../data/lock.js');
const { entryPath, entryKey, K } = await import('../data/keys.js');
const E = await import('../domain/entries.js');
const { filterEntries } = await import('../domain/search.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  got ${JSON.stringify(a)}`);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- schema ----------
{
  const r = S.fromRemote('abc', { datetime: '2026-10-27T09:05:00', sections: [{ title: 'a', content: 'b' }], createdAt: { seconds: 100, nanoseconds: 0 }, updatedAt: { toMillis: () => 5000 } });
  eq([r.createdAtMs, r.updatedAtMs, r.syncedMs], [100000, 5000, 5000], 'fromRemote timestamps (map + Timestamp-like)');
  ok(S.fromRemote('abc', { datetime: 'garbage' }) === null, 'unreadable date -> null');
  ok(S.fromRemote('../x', { datetime: '2026-10-27T09:05:00' }) === null, 'unsafe id -> null');
  eq(S.fromRemote('a', { datetime: '2026-10-27T09:05:00' }).sections, [{ title: '', content: '' }], 'missing sections -> one empty section');
  eq(S.coerceDatetime('2026-10-27T09:05:00'), '2026-10-27T09:05:00', 'coerce canonical');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(S.coerceDatetime('2026-10-27 09:05')), 'coerce loose string');
  const w = S.toRemote({ datetime: 'd', sections: [{ title: 't', content: 'c', junk: 1 }], createdAtMs: 1, updatedAtMs: 2 }, 'u1', { fromMillis: m => ({ ms: m }) });
  eq(Object.keys(w).sort(), ['createdAt', 'datetime', 'sections', 'updatedAt', 'userId'], 'toRemote has exactly the v1 fields');
  eq(w.sections, [{ title: 't', content: 'c' }], 'toRemote strips section extras');
  eq(S.decideWrite({ exists: false, remoteMs: null, base: 5 }), 'create', 'decide: missing remote -> create');
  eq(S.decideWrite({ exists: true, remoteMs: 5, base: 5 }), 'write', 'decide: unchanged -> write');
  eq(S.decideWrite({ exists: true, remoteMs: 6, base: 5 }), 'conflict', 'decide: remote moved -> conflict');
  eq(S.decideWrite({ exists: true, remoteMs: 6, base: null }), 'write', 'decide: never synced -> write');
  eq(S.derive({ datetime: '2026-10-27T09:05:00', sections: [{ title: '', content: 'one two  three' }] }).wordCount, 3, 'derive wordCount');
}

// ---------- fake cloud ----------
function makeCloud() {
  const docs = new Map();           // id -> {data(wire), updatedAtMs}
  const log = [];
  let down = false;
  const cloud = {
    docs, log, setDown: v => { down = v; },
    hooks: null,
    adapter: {
      async set(path, w) {
        if (down) throw new Error('offline');
        const id = path.split('/')[1];
        const cur = docs.get(id);
        const remoteEntry = cur ? S.fromRemote(id, { datetime: cur.datetime, sections: cur.sections, createdAt: cur.createdAtMs, updatedAt: cur.updatedAtMs }) : null;
        const v = S.decideWrite({ exists: !!cur, remoteMs: remoteEntry?.updatedAtMs ?? null, base: cloud.hooks.base(id) });
        log.push(v);
        if (v === 'conflict') { cloud.hooks.onConflict(id, remoteEntry); return; }
        docs.set(id, { ...w });
        cloud.hooks.onWritten(id, w.updatedAtMs);
      },
      async del(path) { if (down) throw new Error('offline'); docs.delete(path.split('/')[1]); },
      async list() { if (down) throw new Error('offline'); return [...docs.entries()].map(([id, d]) => ({ id, data: { datetime: d.datetime, sections: d.sections, createdAt: d.createdAtMs, updatedAt: d.updatedAtMs } })); }
    }
  };
  return cloud;
}
async function boot(cloud, clock, backend = memoryBackend()) {
  const store = createStore({ outboxKey: K.outbox });
  const repo = await createRepo({ store, backend, now: () => clock.t });
  cloud.hooks = { base: repo.base, onWritten: repo.markSynced, onConflict: repo.forkConflict };
  return { store, repo, backend, attach: () => store.setRemote(cloud.adapter) };
}
const clock = { t: 1_000_000 };

// ---------- create / sync / markSynced ----------
{
  mem.clear();
  const cloud = makeCloud(); const { store, repo, attach } = await boot(cloud, clock);
  const e = repo.create({ datetime: '2026-10-27T09:05:00', sections: [{ title: 'T', content: 'hello' }] });
  ok(repo.get(e.id).syncedMs === null, 'new entry unsynced');
  repo.commit(e.id);
  ok(store.isPending(entryPath(e.id)), 'commit queues it (works offline, nothing attached yet)');
  await attach(); await wait(20);
  ok(cloud.docs.has(e.id) && !store.isPending(entryPath(e.id)), 'flush wrote to cloud and cleared outbox');
  eq(repo.get(e.id).syncedMs, e.updatedAtMs, 'markSynced recorded the remote updatedAt');
  eq(cloud.log, ['create'], 'first write was a create');

  clock.t += 5000;
  repo.update(e.id, { sections: [{ title: 'T', content: 'hello world' }] }); repo.commit(e.id); await wait(20);
  eq(cloud.log, ['create', 'write'], 'second write is a plain write (no false conflict)');
  eq(cloud.docs.get(e.id).sections[0].content, 'hello world', 'cloud has the edit');
}

// ---------- offline then online ----------
{
  mem.clear();
  const cloud = makeCloud(); const { store, repo, attach, backend } = await boot(cloud, clock);
  await attach();
  cloud.setDown(true);
  const e = repo.create({ datetime: '2026-10-28T10:00:00', sections: [{ title: '', content: 'offline note' }] });
  repo.commit(e.id); await wait(20);
  ok(store.isPending(entryPath(e.id)) && !cloud.docs.has(e.id), 'offline: stays queued, UI never blocked');
  // simulate reload: new store/repo read the persisted outbox + entry
  await repo.flushStorage();
  const again = await boot(cloud, clock, backend);
  ok(again.repo.get(e.id)?.sections[0].content === 'offline note', 'entry survives reload');
  ok(again.store.isPending(entryPath(e.id)), 'outbox survives reload');
  cloud.setDown(false);
  await again.attach(); await wait(20);
  ok(cloud.docs.has(e.id) && !again.store.isPending(entryPath(e.id)), 'back online: queued entry delivered');
}

// ---------- conflict: edited on another device while we had unsent edits ----------
{
  mem.clear();
  const cloud = makeCloud(); const A = await boot(cloud, clock);
  await A.attach();
  const e = A.repo.create({ datetime: '2026-10-29T08:00:00', sections: [{ title: 'x', content: 'v1' }] });
  A.repo.commit(e.id); await wait(20);
  // other device rewrites the doc
  clock.t += 10000;
  cloud.docs.set(e.id, { datetime: e.datetime, sections: [{ title: 'x', content: 'other device' }], createdAtMs: e.createdAtMs, updatedAtMs: clock.t });
  // we edit offline-ish and flush
  clock.t += 1000;
  A.repo.update(e.id, { sections: [{ title: 'x', content: 'my edit' }] });
  let events = []; A.repo.subscribe(i => events.push(i));
  A.repo.commit(e.id); await wait(20);
  ok(cloud.log.includes('conflict'), 'remote moved -> conflict detected');
  eq(cloud.docs.get(e.id).sections[0].content, 'other device', 'cloud version NOT overwritten');
  eq(A.repo.get(e.id).sections[0].content, 'other device', 'local entry now shows the other device version');
  const copy = A.repo.list().find(x => x.id !== e.id);
  ok(copy && copy.sections[0].content === 'my edit', 'my text preserved as a separate entry');
  await wait(20);
  ok(cloud.docs.has(copy.id), 'my copy was synced as its own entry');
  ok(events.some(i => i.type === 'conflict' && i.id === e.id && i.copyId === copy.id), 'conflict event emitted');
}

// ---------- pull: add / update / skip pending / delete elsewhere ----------
{
  mem.clear();
  const cloud = makeCloud(); const A = await boot(cloud, clock);
  await A.attach();
  const mk = (id, content, ms) => cloud.docs.set(id, { datetime: '2026-10-01T07:00:00', sections: [{ title: '', content }], createdAtMs: ms, updatedAtMs: ms });
  mk('r1', 'one', 100); mk('r2', 'two', 200);
  let r = await pull({ repo: A.repo, store: A.store, remote: cloud.adapter });
  eq([r.added, r.updated, r.removed], [2, 0, 0], 'pull added 2');
  eq(A.repo.get('r1').syncedMs, 100, 'pulled entry carries syncedMs');
  r = await pull({ repo: A.repo, store: A.store, remote: cloud.adapter });
  eq([r.added, r.updated, r.removed], [0, 0, 0], 'second pull is a no-op');
  mk('r1', 'one edited', 300);
  r = await pull({ repo: A.repo, store: A.store, remote: cloud.adapter });
  eq([r.updated, A.repo.get('r1').sections[0].content], [1, 'one edited'], 'pull picks up remote edits');
  // pending local edit must survive a pull
  A.repo.update('r2', { sections: [{ title: '', content: 'local unsent' }] });
  cloud.setDown(true); A.repo.commit('r2'); await wait(10); cloud.setDown(false);
  mk('r2', 'remote changed', 400);
  await pull({ repo: A.repo, store: A.store, remote: cloud.adapter });
  eq(A.repo.get('r2').sections[0].content, 'local unsent', 'pull never overwrites an entry waiting in the outbox');
  // deleted elsewhere
  cloud.docs.delete('r1');
  r = await pull({ repo: A.repo, store: A.store, remote: cloud.adapter });
  ok(r.removed === 1 && !A.repo.get('r1'), 'entry deleted elsewhere is removed locally');
  // failed list must not delete anything
  cloud.setDown(true);
  let threw = false; try { await pull({ repo: A.repo, store: A.store, remote: cloud.adapter }); } catch { threw = true; }
  ok(threw && A.repo.count() === 1, 'failed pull throws and deletes nothing');
  cloud.setDown(false);
}

// ---------- delete + undo ----------
{
  mem.clear();
  const cloud = makeCloud(); const A = await boot(cloud, clock);
  await A.attach();
  const e = A.repo.create({ datetime: '2026-10-30T12:00:00', sections: [{ title: 'k', content: 'keep me' }] });
  A.repo.commit(e.id); await wait(20);
  const removed = A.repo.remove(e.id); await wait(20);
  ok(!A.repo.get(e.id) && !cloud.docs.has(e.id), 'delete removes locally and remotely');
  clock.t += 100;
  A.repo.restore(removed); await wait(20);
  ok(A.repo.get(e.id) && cloud.docs.has(e.id), 'undo brings it back everywhere');
  ok(cloud.log.at(-1) === 'create', 'undo after a flushed delete is a create');
  // undo BEFORE the delete flushed
  const e2 = A.repo.create({ datetime: '2026-10-30T13:00:00', sections: [{ title: '', content: 'x' }] });
  A.repo.commit(e2.id); await wait(20);
  cloud.setDown(true);
  const r2 = A.repo.remove(e2.id); await wait(10);
  A.repo.restore(r2);
  cloud.setDown(false); await A.store.flush(); await wait(30);
  ok(cloud.docs.has(e2.id), 'undo before flush keeps the cloud copy (set replaces the queued delete)');
}

// ---------- storage failures ----------
{
  mem.clear();
  const errs = [];
  const bad = { kind: 'x', async load() { return []; }, async put() { throw new Error('QuotaExceededError'); }, async del() {}, async clear() {} };
  const repo = await createRepo({ store: createStore({ outboxKey: K.outbox }), backend: bad, onError: e => errs.push(e.message) });
  const e = repo.create({ datetime: '2026-10-30T12:00:00', sections: [{ title: '', content: 'x' }] });
  await repo.flushStorage();
  ok(errs.length === 1 && /Quota/.test(errs[0]) && repo.get(e.id), 'backend write failure is reported; entry stays in memory');
  repo.commit(e.id);
  ok(createStore({ outboxKey: K.outbox }).isPending(entryPath(e.id)), 'and the outbox still holds the text (second copy)');
}

// ---------- backends / write-through / migration ----------
{
  mem.clear();
  const store = createStore({ outboxKey: K.outbox });
  for (const [name, mk] of [['memory', () => memoryBackend()], ['localStorage', () => lsBackend(store)]]) {
    mem.clear();
    const b = mk();
    await b.put({ id: 'a', datetime: 'x' }); await b.put({ id: 'b', datetime: 'y' });
    eq((await b.load()).map(x => x.id).sort(), ['a', 'b'], name + ' backend: put/load');
    await b.del('a'); eq((await b.load()).map(x => x.id), ['b'], name + ' backend: del');
    await b.clear(); eq((await b.load()).length, 0, name + ' backend: clear');
  }
  mem.clear();
  const bk = memoryBackend();
  const repo = await createRepo({ store, backend: bk, now: () => clock.t });
  const e = repo.create({ datetime: '2026-10-30T12:00:00', sections: [{ title: '', content: 'v1' }] });
  repo.update(e.id, { sections: [{ title: '', content: 'v2' }] }); repo.update(e.id, { sections: [{ title: '', content: 'v3' }] });
  await repo.flushStorage();
  eq((await bk.load())[0].sections[0].content, 'v3', 'write-through keeps the LAST edit');
  repo.remove(e.id); await repo.flushStorage();
  eq((await bk.load()).length, 0, 'delete reaches the backend');
  await repo.clearAll(); eq(repo.count(), 0, 'clearAll empties the repo');

  // legacy migration (Phase 1/2 kept entries in localStorage)
  mem.clear();
  const legacy = [1, 2, 3].map(i => ({ id: 'old' + i, datetime: '2026-10-0' + i + 'T10:00:00', sections: [{ title: '', content: 'n' + i }], createdAtMs: i, updatedAtMs: i, syncedMs: i }));
  legacy.forEach(x => store.set(entryKey(x.id), x));
  const target = memoryBackend();
  eq(await migrateLegacy({ store, backend: target }), 3, 'migration moves 3 entries');
  eq([(await target.load()).length, store.keys(/^diary2_e_/).length], [3, 0], 'copied to the new backend, originals removed');
  legacy.forEach(x => store.set(entryKey(x.id), x));
  const lying = { kind: 'idb', async load() { return []; }, async put() {}, async del() {}, async clear() {} };
  let threw = false; try { await migrateLegacy({ store, backend: lying }); } catch { threw = true; }
  ok(threw && store.keys(/^diary2_e_/).length === 3, 'failed verification keeps the originals (no data loss)');
  eq(await migrateLegacy({ store, backend: lsBackend(store) }), 0, 'no-op when the backend is localStorage itself');
}

// ---------- restore v2 ----------
{
  const mkRaw = (id, content, ms, extra = {}) => ({ id, userId: 'u1', datetime: '2026-10-05T10:00:00', sections: [{ title: '', content }], createdAtMs: ms, updatedAtMs: ms, ...extra });
  eq(R.parseBackup('nope').ok, false, 'invalid JSON rejected');
  eq(R.parseBackup('{"app":"other","entries":[]}').error, 'That is not a Diary backup file.', 'wrong app rejected');
  ok(/different account/.test(R.parseBackup(JSON.stringify({ app: 'munan-diary', entries: [mkRaw('a', 'x', 1, { userId: 'zzz' })] }), { uid: 'u1' }).error), 'other account rejected');
  const file = { app: 'munan-diary', version: 2, entries: [
    mkRaw('a', 'one', 100, { mood: 4, tags: ['Gym', 'gym'], pinned: true }),
    { id: 'legacy1', datetime: '2026-10-06T10:00:00', sections: [{ title: 't', content: 'old' }], createdAt: { seconds: 50, nanoseconds: 0 }, updatedAt: { seconds: 60, nanoseconds: 0 } },
    mkRaw('a', 'one newer', 200),                               // duplicate id: newest wins
    { id: 'bad1', datetime: 'garbage', sections: [] }, 'junk', { datetime: '2026-10-07T10:00:00', sections: [{ title: 1, content: 'x' }] },
    mkRaw('../evil', 'unsafe id', 5), mkRaw('big', 'x'.repeat(30001), 5)] };
  const p = R.parseBackup(JSON.stringify(file), { uid: 'u1' });
  ok(p.ok, 'valid file parses');
  eq([p.entries.length, p.skipped], [3, 4], 'kept: a, legacy1, unsafe-id entry (new id) / skipped: bad date, junk, bad title type, oversized');
  eq(p.entries.find(e => e.id === 'a').sections[0].content, 'one newer', 'duplicate ids: newest wins');
  eq(p.entries.find(e => e.id === 'legacy1').updatedAtMs, 60000, 'legacy {seconds} timestamps converted');
  ok(p.entries.every(e => /^[A-Za-z0-9_-]+$/.test(e.id)), 'unsafe ids replaced');
  const A1 = R.parseBackup(JSON.stringify({ app: 'munan-diary', entries: [mkRaw('a', 'x', 1, { mood: 4, tags: ['Gym', 'gym'], pinned: true })] })).entries[0];
  eq([A1.mood, A1.tags, A1.pinned], [4, ['gym'], true], 'mood/tags/pinned restored and normalised');

  const L = (id, ms) => ({ id, datetime: '2026-10-05T10:00:00', sections: [{ title: '', content: 'l' }], mood: null, tags: [], pinned: false, createdAtMs: ms, updatedAtMs: ms, syncedMs: ms });
  const local = [L('same', 100), L('localNewer', 300), L('backupNewer', 100), L('onlyLocal', 100)];
  const inc = [L('same', 100), L('localNewer', 200), L('backupNewer', 250), L('onlyBackup', 100)];
  let plan = R.planRestore(local, inc, 'merge');
  eq([plan.add.map(e => e.id), plan.update.map(e => e.id), plan.same, plan.remove], [['onlyBackup'], ['backupNewer'], 2, []], 'merge: add missing, update only newer, never delete');
  plan = R.planRestore(local, inc, 'replace');
  eq([plan.add.map(e => e.id), plan.update.map(e => e.id).sort(), plan.same, plan.remove], [['onlyBackup'], ['backupNewer', 'localNewer'], 1, ['onlyLocal']], 'replace: overwrite differing, remove extras');

  // apply through the repo + cloud: no false conflicts, deletes propagate
  mem.clear();
  const cloud = makeCloud(); const A = await boot(cloud, clock); await A.attach();
  const e1 = A.repo.create({ datetime: '2026-10-05T10:00:00', sections: [{ title: '', content: 'local v1' }] });
  const e2 = A.repo.create({ datetime: '2026-10-06T10:00:00', sections: [{ title: '', content: 'extra' }] });
  A.repo.commit(e1.id); A.repo.commit(e2.id); await wait(30);
  const backupEntry = { ...A.repo.get(e1.id), sections: [{ title: '', content: 'from backup' }], updatedAtMs: A.repo.get(e1.id).updatedAtMs + 5000 };
  const res = R.applyPlan(A.repo, R.planRestore(A.repo.list(), [backupEntry, { ...L('fresh', 10), id: 'fresh' }], 'replace'));
  await wait(60);
  eq([res.added, res.updated, res.removed], [1, 1, 1], 'applyPlan result counts');
  eq(A.repo.get(e1.id).sections[0].content, 'from backup', 'restored text is live');
  ok(!A.repo.get(e2.id) && !cloud.docs.has(e2.id), 'replace removed the extra entry locally AND in the cloud');
  ok(cloud.docs.has('fresh') && cloud.docs.get(e1.id).sections[0].content === 'from backup', 'restored entries reached the cloud');
  ok(!cloud.log.slice(2).includes('conflict'), 'restore never triggers a false conflict (' + cloud.log.join(',') + ')');
}

// ---------- app lock ----------
{
  const m = new Map(); const st = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  let t = 1_000_000; const lock = createLock(st, { now: () => t, iterations: 1000 });
  ok(!lock.isEnabled(), 'lock off by default');
  let bad = false; try { await lock.enable('12ab'); } catch { bad = true; } ok(bad, 'non-digit PIN refused');
  bad = false; try { await lock.enable('123'); } catch { bad = true; } ok(bad, 'too-short PIN refused');
  await lock.enable('4821', 0);
  ok(lock.isEnabled() && lock.timeoutMs() === 0, 'enabled with Immediately');
  ok(!m.get('diary2_lock').includes('4821'), 'PIN is not stored in clear text');
  ok((await lock.verify('4821')).ok, 'right PIN unlocks');
  const w1 = await lock.verify('0000'); ok(!w1.ok && w1.wait === 0, 'wrong PIN rejected, no wait yet');
  for (let i = 0; i < 3; i++) await lock.verify('1111');
  const w5 = await lock.verify('2222'); ok(!w5.ok && w5.wait === 30, '5th wrong PIN starts a 30 s lockout (' + w5.wait + ')');
  const during = await lock.verify('4821'); ok(!during.ok && during.wait > 0, 'even the right PIN is refused during the lockout');
  t += 31000; ok((await lock.verify('4821')).ok, 'works again after the wait');
  for (let i = 0; i < 6; i++) await lock.verify('9999'); t += 10 * 60000;
  ok((await lock.verify('4821')).ok, 'lockout is temporary');
  lock.setTimeoutMs(300000); eq(lock.timeoutMs(), 300000, 'auto-lock time can change');
  ok(!(await lock.disable('0000')).ok && lock.isEnabled(), 'cannot turn off with a wrong PIN');
  t += 20 * 60000;
  ok((await lock.disable('4821')).ok && !lock.isEnabled(), 'turns off with the right PIN');
  await lock.enable('555555'); const h1 = m.get('diary2_lock'); await lock.enable('555555');
  ok(h1 !== m.get('diary2_lock'), 'fresh salt each time (same PIN, different hash)');
}
// ---------- domain ----------
{
  const mk = (id, dt, content, title = '') => ({ id, datetime: dt, sections: [{ title, content }], createdAtMs: 1, updatedAtMs: 1, syncedMs: null });
  const list = E.sortEntries([mk('a', '2026-09-30T10:00:00', 'Went cycling in Lalbag'), mk('b', '2026-10-27T09:05:00', 'ভালো দিন', 'Morning'), mk('c', '2026-10-02T21:30:00', 'late')]);
  eq(list.map(x => x.id), ['b', 'c', 'a'], 'sorted newest first');
  eq(E.groupByMonth(list).map(g => [g.key, g.entries.length]), [['2026-10', 2], ['2026-09', 1]], 'grouped by month');
  eq(E.titleOf(list[0]), 'Morning', 'title from section title');
  eq(E.titleOf(list[2]), 'Went cycling in Lalbag', 'title falls back to first line');
  eq(filterEntries(list, 'oct 27').map(x => x.id), ['b'], 'search by human date');
  eq(filterEntries(list, 'cycling lalbag').map(x => x.id), ['a'], 'multi-word search');
  eq(filterEntries(list, 'ভালো').map(x => x.id), ['b'], 'Bangla search');
  const d = E.blankDraft(new Date(2026, 9, 27, 9, 5));
  eq([d.date, d.time, E.isMeaningful(d)], ['2026-10-27', '09:05', false], 'blank draft');
  d.sections[0].content = ' x '; ok(E.isMeaningful(d), 'draft becomes meaningful');
}


// ---------- Phase 2: tags / moods / calendar / export / extras ----------
{
  const T = await import('../domain/tags.js');
  const M = await import('../domain/moods.js');
  const C = await import('../domain/calendar.js');
  const X = await import('../domain/export.js');
  eq(T.normalizeTag('  #Cycling  Trip '), 'cycling trip', 'tag normalised (case, #, spaces)');
  eq(T.normalizeTags(['Gym', 'gym', '#GYM', '', 'a'.repeat(50)]).map(x => x.length), [3, 30], 'tags deduped + capped at 30 chars');
  eq(T.normalizeTags(Array.from({ length: 15 }, (_, i) => 't' + i)).length, 10, 'max 10 tags');
  eq(T.allTags([{ tags: ['a', 'b'] }, { tags: ['b'] }, { tags: [] }]), [{ tag: 'b', count: 2 }, { tag: 'a', count: 1 }], 'allTags sorted by use');
  ok(M.normalizeMood(3) === 3 && M.normalizeMood(0) === null && M.normalizeMood('4') === null && M.normalizeMood(6) === null, 'mood only integers 1..5');

  // schema: optional fields only written when set; classic shape preserved otherwise
  const TS = { fromMillis: m => ({ ms: m }) };
  const base = { datetime: '2026-10-27T09:05:00', sections: [{ title: '', content: 'x' }], createdAtMs: 1, updatedAtMs: 2 };
  eq(Object.keys(S.toRemote({ ...base, mood: null, tags: [], pinned: false }, 'u', TS)).sort(), ['createdAt', 'datetime', 'sections', 'updatedAt', 'userId'], 'plain entry keeps the exact v1 shape');
  eq(Object.keys(S.toRemote({ ...base, mood: 4, tags: ['a'], pinned: true }, 'u', TS)).sort(), ['createdAt', 'datetime', 'mood', 'pinned', 'sections', 'tags', 'updatedAt', 'userId'], 'extras written when set');
  const fr = S.fromRemote('id1', { datetime: base.datetime, sections: [], mood: 9, tags: ['X', 'x', 5], pinned: 'yes', updatedAt: 5 });
  eq([fr.mood, fr.tags, fr.pinned], [null, ['x', '5'], false], 'fromRemote sanitises mood/tags/pinned');
  eq(S.normalizeLocal({ id: 'a', datetime: base.datetime, mood: 2, tags: ['k'], pinned: true }).mood, 2, 'normalizeLocal keeps mood');

  // repo carries extras through create/update/fork
  mem.clear();
  const cloud = makeCloud(); const A = await boot(cloud, clock); await A.attach();
  const e = A.repo.create({ datetime: base.datetime, sections: base.sections, mood: 5, tags: ['Run', 'run', 'Lalbag'], pinned: true });
  eq([e.mood, e.tags, e.pinned], [5, ['run', 'lalbag'], true], 'create normalises extras');
  clock.t += 10; A.repo.update(e.id, { mood: null, pinned: false }); A.repo.commit(e.id); await wait(20);
  const stored = cloud.docs.get(e.id);
  eq([stored.mood, stored.pinned, stored.tags], [null, false, ['run', 'lalbag']], 'update patch only touches given fields');
  clock.t += 10; cloud.docs.set(e.id, { ...stored, updatedAtMs: clock.t + 50000 });
  A.repo.update(e.id, { tags: ['mine'] }); A.repo.commit(e.id); await wait(30);
  const fork = A.repo.list().find(x => x.id !== e.id);
  eq(fork.tags, ['mine'], 'conflict copy keeps my tags');

  // calendar
  const byDay = C.entriesByDay([{ datetime: '2026-10-27T09:00:00' }, { datetime: '2026-10-27T20:00:00' }, { datetime: '2026-10-26T08:00:00' }, { datetime: '2026-10-20T08:00:00' }]);
  eq([byDay.get('2026-10-27').length, byDay.size], [2, 3], 'entriesByDay groups');
  const weeks = C.monthGrid(2026, 9, byDay, '2026-10-27');       // Oct 2026 starts on a Thursday; weeks start on Saturday
  eq([C.WEEK_START, weeks.length, weeks[0].length, weeks[0][5].key, weeks[0][5].day, weeks[0][4].inMonth], [6, 6, 7, '2026-10-01', 1, false], 'Saturday-first grid: Thu Oct 1 is the 6th cell');
  eq(weeks[0][0].key, '2026-09-26', 'first cell is the Saturday before (26 Sep 2026 is a Saturday)');
  eq(C.monthGrid(2026, 9, byDay, '2026-10-27', 0).length, 5, 'Sunday-first still available (5 rows)');
  eq(weeks.flat().find(c => c.key === '2026-10-27').count, 2, 'grid carries counts');
  ok(weeks.flat().find(c => c.key === '2026-10-27').today, 'grid marks today');
  eq(C.monthGrid(2026, 1, new Map(), 'x').length, 5, 'Feb 2026 on a Saturday-first grid takes 5 rows');
  eq(C.monthGrid(2026, 1, new Map(), 'x', 0).length, 4, 'Feb 2026 Sunday-first is exactly 4 rows');
  eq(C.monthGrid(2025, 7, new Map(), 'x')[0][0].key, '2025-07-26', 'Aug 2025 starts on a Friday, so its first row begins Sat 26 Jul');
  eq(C.monthGrid(2025, 10, new Map(), 'x')[0][0].key, '2025-11-01', 'a month that starts on a Saturday has no leading days');
  eq(C.streaks(['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-20'], '2026-10-27'), { current: 3, longest: 3 }, 'streak counts back from today');
  eq(C.streaks(['2026-10-26', '2026-10-25'], '2026-10-27').current, 2, 'streak alive until midnight (yesterday counts)');
  eq(C.streaks(['2026-10-24'], '2026-10-27').current, 0, 'streak broken after a missed day');
  eq(C.streaks(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30').current, 3, 'streak survives a DST change');
  eq(C.streaks([], '2026-10-27'), { current: 0, longest: 0 }, 'empty diary streak');
  const otd = C.onThisDay([{ datetime: '2025-10-27T10:00:00' }, { datetime: '2024-10-27T10:00:00' }, { datetime: '2026-10-27T10:00:00' }, { datetime: '2025-10-28T10:00:00' }], '2026-10-27');
  eq(otd.map(x => x.datetime.slice(0, 4)), ['2025', '2024'], 'on this day: earlier years only, newest first');
  eq(C.monthStats([{ datetime: '2026-10-27T10:00:00', sections: [{ content: 'a b c' }] }, { datetime: '2026-10-27T11:00:00', sections: [{ content: 'd' }] }, { datetime: '2026-09-01T10:00:00', sections: [{ content: 'zz' }] }], '2026-10'), { entries: 2, words: 4, days: 1 }, 'monthStats');

  // export
  const list = [
    { id: 'a', datetime: '2026-10-27T09:05:00', sections: [{ title: 'T', content: 'one' }], mood: 4, tags: ['gym trip'], createdAtMs: 1 },
    { id: 'b', datetime: '2026-09-01T09:05:00', sections: [{ title: '', content: 'two' }], mood: null, tags: [], createdAtMs: 1 },
    { id: 'c', datetime: '2026-10-02T09:05:00', sections: [{ title: '', content: 'three' }], mood: null, tags: [], createdAtMs: 1 }];
  eq(X.inRange(list, '', '', true).map(x => x.id), ['b', 'c', 'a'], 'export oldest first');
  eq(X.inRange(list, '2026-10-01', '2026-10-31', false).map(x => x.id), ['a', 'c'], 'export range + newest first');
  const md = X.toMarkdown(X.inRange(list, '', '', true), new Date('2026-11-14T00:00:00Z'));
  ok(md.includes('## ') && md.includes('### T') && md.includes('#gym-trip') && md.includes('🙂 Good') && md.includes('3 entries'), 'markdown has headings, section title, tag, mood');
  eq(filterEntries([{ datetime: '2026-10-27T09:05:00', sections: [{ title: '', content: 'x' }], tags: ['gym'], mood: 5 }], '#gym great').length, 1, 'search matches #tag and mood label');
}


// ---------- sheets must be opaque (regression: translucent --paper let the page show through the reader) ----------
{
  const css = (await import('fs')).readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  ok(/\.ui-sheet,\s*\.ui-confirm\s*\{[^}]*background-color:\s*var\(--bg\)/.test(css), 'app.css makes .ui-sheet and .ui-confirm opaque (solid --bg)');
  ok(/\.ui-sheet--full\s*\{[^}]*background-image:\s*var\(--bg-gradient\)/.test(css), 'full-screen sheets use the solid page gradient');
  const reader = (await import('fs')).readFileSync(new URL('../components/memory-reader.js', import.meta.url), 'utf8');
  ok(!/sheet\.setTitle/.test(reader), 'reader does not repeat the date in the sheet title');
}

// ---------- Memories (starred days) ----------
{
  const Mem = await import('../domain/memories.js');
  const C2 = await import('../domain/calendar.js');
  const TS = { fromMillis: m => ({ ms: m }) };
  const base = { datetime: '2026-10-27T09:05:00', sections: [{ title: '', content: 'x' }], createdAtMs: 1, updatedAtMs: 2 };
  ok(!('starred' in S.toRemote({ ...base, starred: false }, 'u', TS)), 'unstarred entry keeps the exact v1 shape');
  eq(S.toRemote({ ...base, starred: true }, 'u', TS).starred, true, 'starred written when set');
  eq([S.fromRemote('a', { datetime: base.datetime, starred: true }).starred, S.fromRemote('a', { datetime: base.datetime, starred: 'yes' }).starred], [true, false], 'fromRemote: only a real true counts');
  eq(S.normalizeLocal({ id: 'a', datetime: base.datetime, starred: true }).starred, true, 'normalizeLocal keeps starred');
  eq(R.parseBackup(JSON.stringify({ app: 'munan-diary', entries: [{ id: 'a', datetime: base.datetime, sections: [{ title: '', content: 'x' }], starred: true }] })).entries[0].starred, true, 'restore keeps starred');

  mem.clear();
  const cloud = makeCloud(); const A = await boot(cloud, clock); await A.attach();
  const e = A.repo.create({ datetime: base.datetime, sections: base.sections, starred: true });
  eq(e.starred, true, 'create with starred');
  clock.t += 5; A.repo.update(e.id, { starred: false }); A.repo.commit(e.id); await wait(20);
  eq(A.repo.get(e.id).starred, false, 'update can un-star');
  A.repo.update(e.id, { starred: true }); eq(A.repo.exportAll()[0].starred, true, 'backup carries starred');

  const mk = (id, dt, content, starred = true, extra = {}) => ({ id, datetime: dt, sections: [{ title: extra.title || '', content }], mood: extra.mood ?? null, tags: [], pinned: false, starred, createdAtMs: 1, updatedAtMs: 1 });
  const list = [mk('a', '2026-10-27T09:00:00', 'morning'), mk('b', '2026-10-27T21:00:00', 'night'), mk('c', '2025-12-31T10:00:00', 'new year'), mk('d', '2025-06-01T10:00:00', 'nope', false), mk('e', '2024-02-29T10:00:00', 'leap day')];
  const st = Mem.memoriesOf(list);
  eq(st.map(x => x.id), ['b', 'a', 'c', 'e'], 'memoriesOf: starred only, newest first');
  const days = Mem.memoryDays(st);
  eq(days.map(d => [d.key, d.entries.map(x => x.id)]), [['2026-10-27', ['a', 'b']], ['2025-12-31', ['c']], ['2024-02-29', ['e']]], 'one memory per DAY, entries oldest→newest');
  eq(Mem.memoryDays(st, true).map(d => d.key), ['2024-02-29', '2025-12-31', '2026-10-27'], 'oldest first');
  eq(Mem.groupByYear(days).map(g => [g.year, g.days.length]), [['2026', 1], ['2025', 1], ['2024', 1]], 'grouped by year');
  eq(Mem.memoryYears(days), ['2026', '2025', '2024'], 'years newest first');
  eq(Mem.memoryStats(days), { days: 3, entries: 4, years: 3, first: '2024-02-29', last: '2026-10-27' }, 'memoryStats');
  eq(Mem.memoryStats([]), { days: 0, entries: 0, years: 0, first: null, last: null }, 'memoryStats empty');
  eq(Mem.dayText(days[0]), 'morning\n\nnight', 'dayText joins the day');
  eq(Mem.entryText({ sections: [{ title: 'T', content: 'body' }, { title: '', content: '' }, { title: '', content: 'more' }] }), 'T\nbody\n\nmore', 'entryText skips empty sections');
  ok(Mem.readMinutes(days[0]) === 1, 'readMinutes is at least 1');
  eq(Mem.pickRandom(days, () => 0).key, '2026-10-27', 'pickRandom low');
  eq(Mem.pickRandom(days, () => 0.999).key, '2024-02-29', 'pickRandom high stays in range');
  ok(Mem.pickRandom(days, () => 0, '2026-10-27').key !== '2026-10-27', 'pickRandom avoids the current one');
  eq(Mem.pickRandom([days[0]], () => 0, days[0].key).key, days[0].key, 'single memory can still be picked');
  eq(Mem.pickRandom([]), null, 'pickRandom empty');
  eq(Mem.dayInfo('2026-10-27').full, 'Tuesday, October 27, 2026', 'dayInfo full date');
  const grid = C2.monthGrid(2026, 9, C2.entriesByDay(list.filter(x => x.datetime.startsWith('2026'))), '2026-10-27').flat();
  ok(grid.find(c => c.key === '2026-10-27').starred && !grid.find(c => c.key === '2026-10-01').starred, 'calendar cells know which days are starred');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
