// Run: node apps/health/tests/run.mjs   (no browser needed; compares the new domain/data layer with the legacy ht.js algorithms)
import assert from 'node:assert/strict';
const mem = {}; const ls = { getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, get length() { return Object.keys(mem).length; }, key: i => Object.keys(mem)[i] };
globalThis.window = { localStorage: ls, addEventListener() {} }; Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const reset = () => Object.keys(mem).forEach(k => delete mem[k]);
const { createStore } = await import('../../shared/store.js');
const KEYS = await import('../data/keys.js');
const { DEFAULT_METRICS, MOODS, DEFAULT_PROFILE } = await import('../data/defaults.js');
const D = await import('../domain/day.js');
const S = await import('../domain/stats.js');
const M = await import('../domain/metrics.js');
const { searchDays } = await import('../domain/search.js');
const G = await import('../domain/guide.js');
const { isDayLocked, LockedError } = await import('../domain/lock.js');
const { isLeap, daysInMonth } = await import('../domain/calendar.js');
const { createRepo } = await import('../data/storage.js');
const { parseBackup, planImport, buildBackup, backupFileName } = await import('../data/backup.js');
const { initialSync } = await import('../data/sync.js');
const O = await import('./oracle.js');
const INS = await import('../domain/insights.js');
const R = await import('../domain/report.js');
const RF = await import('../data/report-files.js');
let n = 0; const t = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('  ok', name); });
let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const METRICS = DEFAULT_METRICS.map(m => ({ ...m }));
const randDoc = () => {                                    // a plausible stored day
  const d = {}; const pick = p => rnd() < p;
  if (pick(.6)) d.weight = Math.round((60 + rnd() * 30) * 10) / 10; if (pick(.5)) { d.bp_sys = 100 + Math.floor(rnd() * 60); d.bp_dia = 60 + Math.floor(rnd() * 40); }
  if (pick(.4)) d.hr = 55 + Math.floor(rnd() * 50); if (pick(.2)) d.sugar = 80 + Math.floor(rnd() * 80); if (pick(.5)) d.sleep = Math.round(rnd() * 20) / 2;
  if (pick(.3)) d.sleepq = 1 + Math.floor(rnd() * 5); if (pick(.5)) d.water = Math.round(rnd() * 40) / 10; if (pick(.5)) d.steps = Math.floor(rnd() * 15000);
  if (pick(.2)) d.calin = Math.floor(rnd() * 3000); if (pick(.2)) d.calout = Math.floor(rnd() * 3000);
  if (pick(.5)) d.mood = MOODS[Math.floor(rnd() * 5)].id; if (pick(.2)) d.meds_items = [{ id: 'a', name: 'Vit D', checked: pick(.5) }, { id: 'b', name: 'Iron', checked: pick(.5) }];
  if (pick(.2)) d.note_weight = 'after run'; return d;
};

await t('keys: legacy names unchanged', () => {
  assert.equal(KEYS.dayLocalKey(2026, 9, 7), 'ht_2026_10_7'); assert.equal(KEYS.dayPath(2026, 9, 7), 'healthtracker/2026_10_7');
  assert.deepEqual(KEYS.parseDayKey('ht_2026_10_7'), { y: 2026, m: 9, d: 7 }); assert.deepEqual(KEYS.parseDayId('2026_1_31'), { y: 2026, m: 0, d: 31 });
  for (const k of ['ht_metrics_v1', 'ht_goals_v1', 'ht_profile_v1', 'ht2_outbox_v1', 'theme']) assert.equal(KEYS.DAY_RE.test(k), false, k + ' must not look like a day');
  assert.deepEqual([KEYS.K.metrics, KEYS.K.goals, KEYS.K.profile, KEYS.META.settings, KEYS.DAY_COLLECTION], ['ht_metrics_v1', 'ht_goals_v1', 'ht_profile_v1', 'healthtracker_meta/settings', 'healthtracker']);
});
await t('calendar: leap years and month lengths', () => {
  assert.equal(isLeap(2024), true); assert.equal(isLeap(1900), false); assert.equal(isLeap(2000), true);
  assert.deepEqual([daysInMonth(2026, 1), daysInMonth(2028, 1), daysInMonth(2026, 3), daysInMonth(2026, 11)], [28, 29, 30, 31]);
});
await t('lock rules (2-day auto-lock, manual flag wins)', () => {
  const today = new Date(2026, 9, 7);
  assert.equal(isDayLocked(2026, 9, 7, {}, today), false); assert.equal(isDayLocked(2026, 9, 6, {}, today), false); assert.equal(isDayLocked(2026, 9, 5, {}, today), true);
  assert.equal(isDayLocked(2026, 9, 5, { locked: false }, today), false); assert.equal(isDayLocked(2026, 9, 7, { locked: true }, today), true);
});
await t('equivalence with legacy collectDayData on 300 random forms (incl. hidden/extra metrics, notes, lock)', () => {
  for (let i = 0; i < 300; i++) {
    const els = {}, vals = {}, items = {}; const extra = new Set();
    METRICS.forEach(m => {
      if (rnd() < .15) return;                                  // field not rendered -> legacy writes 0 / '' / []
      if (m.type === 'number') { const v = rnd() < .3 ? '' : String(Math.round(rnd() * 5000) / 10); els['f_' + m.id] = { value: v }; vals[m.id] = v; }
      else if (m.type === 'bp') { const a = rnd() < .3 ? '' : String(90 + Math.floor(rnd() * 70)), b = rnd() < .3 ? '' : String(50 + Math.floor(rnd() * 50)); els['f_bp_sys'] = { value: a }; els['f_bp_dia'] = { value: b }; vals.bp_sys = a; vals.bp_dia = b; }
      else if (m.type === 'scale') { const v = rnd() < .4 ? '' : String(1 + Math.floor(rnd() * 5)); els['f_' + m.id] = { dataset: v ? { val: v } : {} }; vals[m.id] = v; }
      else if (m.type === 'mood') { const v = rnd() < .4 ? '' : MOODS[Math.floor(rnd() * 5)].id; els.f_mood = { dataset: v ? { val: v } : {} }; vals.mood = v; }
      else if (m.type === 'checklist') { const it = rnd() < .5 ? [] : [{ id: 'x', name: 'A', checked: rnd() < .5 }]; items[m.id] = it; vals[m.id + '_items'] = it; }
      if (rnd() < .25) { const note = rnd() < .5 ? '  fine  ' : '   '; els['note_' + m.id] = { value: note }; vals['note_' + m.id] = note; }
      if (!m.pinned && rnd() < .3) extra.add(m.id);
    });
    const existing = rnd() < .3 ? { locked: rnd() < .5 } : {};
    assert.deepEqual(D.buildDayDoc(METRICS, vals, { existing, extraShown: extra }), O.legacyCollectDay(METRICS, els, items, existing, extra));
  }
});
await t('computeExtraShown / forcedShown / hasData / visible list match legacy', () => {
  for (let i = 0; i < 200; i++) {
    const doc = randDoc(); if (rnd() < .3) doc.shown_sugar = true; if (rnd() < .2) doc.note_calin = ' x ';
    assert.equal(D.dayHasData(METRICS, doc), O.legacyDayHasData(METRICS, doc));
    METRICS.forEach(m => assert.equal(D.metricForcedShown(m, doc), O.legacyForcedShown(m, doc)));
    const ex = D.computeExtraShown(METRICS, doc);
    METRICS.forEach(m => assert.equal(ex.has(m.id), !m.pinned && (O.legacyForcedShown(m, doc) || !!doc['shown_' + m.id])));
    assert.deepEqual(D.visibleMetrics(METRICS, ex).map(m => m.id), METRICS.filter(m => m.pinned || ex.has(m.id)).map(m => m.id));
  }
});
await t('month stats equal legacy calcMonth (Jan, leap Feb 2028, Feb 2026) on random data', () => {
  const store = {}; for (const [y, m, dim] of [[2026, 0, 31], [2028, 1, 29], [2026, 1, 28]]) for (let d = 1; d <= dim; d++) store[`${y}_${m}_${d}`] = rnd() < .8 ? randDoc() : {};
  const getDay = (y, m, d) => store[`${y}_${m}_${d}`] || {};
  for (const [y, m] of [[2026, 0], [2028, 1], [2026, 1]]) { assert.deepEqual(S.calcMonth(getDay, y, m, METRICS), O.legacyCalcMonth(getDay, y, m, METRICS)); }
  const c = S.calcMonth(getDay, 2026, 0, METRICS); assert.equal(c.days, 31); assert.equal(S.avg([]), null); assert.equal(S.first([]), null); assert.equal(S.last([]), null);
  assert.equal(S.avg([{ d: 1, v: 2 }, { d: 2, v: 4 }]), 3); assert.equal(S.avg([2, 4]), 3);
});
await t('BMI / blood-pressure categories match legacy at every boundary', () => {
  for (const [w, h] of [[0, 170], [70, 0], [45, 170], [53.4, 170], [53.5, 170], [72, 170], [72.3, 170], [73.7, 170], [86.6, 170], [86.8, 170], [100, 170], [60, 160]]) { const a = S.bmiOf(w, h); assert.equal(a, O.legacyBmiOf(w, { height: h })); assert.deepEqual(S.bmiCategory(a), O.legacyBmiCategory(a)); }
  for (const [s, d] of [[null, 80], [119, 79], [125, 79], [125, 80], [129, 79], [130, 70], [139, 89], [139, 90], [140, 85], [150, 100], [110, 95]]) assert.deepEqual(S.bpCategory(s, d), O.legacyBpCategory(s, d));
});
await t('search equals legacy (matching, order, 150 cap) and ignores empty query', () => {
  const days = []; for (let i = 0; i < 400; i++) days.push({ y: 2024 + (i % 3), m: i % 12, d: 1 + (i % 28), data: randDoc() });
  const r = searchDays(days, METRICS, 'weight', MOODS); assert.equal(r.length, 150);
  assert.ok(r.every((x, i) => i === 0 || (r[i - 1].y - x.y || r[i - 1].mo - x.mo || r[i - 1].d - x.d) >= 0));
  assert.deepEqual(searchDays(days, METRICS, '  ', MOODS), []);
  const one = searchDays([{ y: 2026, m: 3, d: 2, data: { weight: 70, note_weight: 'Post Run', mood: 'good' } }], METRICS, 'post run', MOODS);
  assert.equal(one.length, 1); assert.equal(one[0].line.val, '70 kg'); assert.equal(one[0].mo, 3);
  assert.equal(D.summaryLine(METRICS[10], { mood: 'bad' }, MOODS).val, 'Bad'); assert.equal(D.summaryLine(METRICS[1], { bp_sys: 120 }, MOODS).val, '120/\u2013 mmHg');
});
await t('daily score and nutrition guide match legacy', () => {
  assert.deepEqual(D.dailyScore([], {}), { pct: null, filled: 0, total: 0 });
  const full = { weight: 70, bp_sys: 120, bp_dia: 80, hr: 60, sleep: 7, water: 2, steps: 5000, mood: 'good' };
  assert.equal(D.dailyScore(METRICS, full).pct, 100); assert.equal(D.dailyScore(METRICS, {}).pct, 0); assert.equal(D.dailyScore(METRICS, { weight: 70, bp_sys: 120 }).filled, 1);
  const p = { height: 172, age: 25, sex: 'male', activity: 1.55 }, pf = { ...p, sex: 'female' };
  for (const [w, prof] of [[null, DEFAULT_PROFILE], [82.4, p], [61, pf], [70, { height: 0, age: 30, sex: 'male', activity: 1.2 }]]) {
    const a = G.macroGuide(w, prof), b = O.legacyGuide(w, prof);
    for (const k of Object.keys(b)) assert.equal(a[k], b[k], k);
  }
  const days = [{ y: 2026, m: 1, d: 3, data: { weight: 70 } }, { y: 2026, m: 9, d: 2, data: { weight: 75 } }, { y: 2026, m: 9, d: 1, data: { weight: 99 } }, { y: 2027, m: 0, d: 1, data: {} }];
  assert.deepEqual(G.latestWeight(days), O.legacyLatestWeight(days)); assert.equal(G.latestWeight([]), null);
});
await t('metric / goal / profile operations', () => {
  const old = [{ id: 'weight', label: 'Weight', icon: 'x' }, { id: 'zzz', label: 'Z', icon: 'y' }];
  const mig = M.migratePinned(old); assert.deepEqual(mig.map(m => m.pinned), [true, false]); assert.equal('pinned' in old[0], false);   // input not mutated
  const a = M.addMetric(METRICS, { icon: ' ', label: '  Pulse ox ' }, { now: 1000, rand: 0.5 }); const added = a[a.length - 1];
  assert.deepEqual([added.label, added.icon, added.type, added.pinned, added.group], ['Pulse ox', '\uD83D\uDD16', 'number', false, 'lifestyle']); assert.match(added.id, /^c[0-9a-z]+$/);
  assert.throws(() => M.addMetric(METRICS, { label: '  ' }), /Enter a metric name/);
  assert.equal(M.updateMetric(METRICS, 'hr', { label: '  ' }).find(m => m.id === 'hr').label, 'Heart Rate');           // blank label ignored
  assert.equal(M.updateMetric(METRICS, 'hr', { icon: '' }).find(m => m.id === 'hr').icon, METRICS.find(m => m.id === 'hr').icon);
  assert.equal(M.updateMetric(METRICS, 'hr', { label: 'Pulse', icon: '\uD83D\uDC93' }).find(m => m.id === 'hr').label, 'Pulse');
  assert.equal(M.togglePin(METRICS, 'sugar').find(m => m.id === 'sugar').pinned, true);
  assert.equal(M.deleteMetric(METRICS, 'sugar').length, METRICS.length - 1); assert.throws(() => M.deleteMetric([METRICS[0]], 'weight'), /At least one/);
  assert.deepEqual(M.goalableMetrics(METRICS).map(m => m.id), ['weight', 'hr', 'sugar', 'sleep', 'sleepq', 'water', 'steps', 'calin', 'calout']);
  let g = M.setGoal({}, 'weight', '72.5'); assert.deepEqual(g, { weight: 72.5 }); assert.throws(() => M.setGoal(g, '', 5), /Pick a metric/); assert.throws(() => M.setGoal(g, 'water', 0), /Enter a target/); assert.throws(() => M.setGoal(g, 'water', -3), /Enter a target/);
  assert.deepEqual(M.removeGoal({ weight: 1, water: 2 }, 'weight'), { water: 2 }); assert.deepEqual(M.activeGoals({ weight: 70, water: 0, gone: 5 }, METRICS), [['weight', 70]]);
  assert.deepEqual(M.normProfile({ height: '-5', age: '30.5', sex: 'female', activity: '' }), { height: 0, age: 30.5, sex: 'female', activity: 1.375 });
  assert.deepEqual(M.mergeProfile({ height: 170 }), { height: 170, age: 0, sex: 'male', activity: 1.375 });
});
await t('unownedFields keeps values of deleted metrics (the legacy app silently dropped them on the next save)', () => {
  const kept = METRICS.filter(m => m.id !== 'sugar'); const doc = { weight: 70, sugar: 95, note_sugar: 'fasting', shown_sugar: true, mood: 'good', locked: true, weird: 1 };
  assert.deepEqual(D.unownedFields(kept, doc), { sugar: 95, note_sugar: 'fasting', shown_sugar: true, weird: 1 }); assert.deepEqual(D.unownedFields(METRICS, doc), { weird: 1 });
  assert.deepEqual(D.unownedFields(METRICS, null), {});
});
await t('backup: same format as legacy export; parse / plan merge / plan replace', () => {
  const days = { ht_2026_10_1: { weight: 70 }, ht_2026_10_2: { weight: 71 } };
  const b = buildBackup({ metrics: METRICS, goals: { weight: 68 }, profile: DEFAULT_PROFILE, days }, new Date('2026-10-11T00:00:00Z'));
  assert.deepEqual(Object.keys(b), ['version', 'exportedAt', 'metrics', 'goals', 'profile', 'days']); assert.equal(b.version, 1); assert.equal(backupFileName('backup', new Date('2026-10-11T05:00:00Z')), 'health-tracker-backup-2026-10-11.json');
  assert.equal(parseBackup('nope').ok, false); assert.equal(parseBackup('[]').ok, false); assert.equal(parseBackup('{"x":1}').ok, false);
  const pb = parseBackup(JSON.stringify({ ...b, days: { ...days, junk: { a: 1 }, ht_2026_10_3: 'str' } })); assert.equal(pb.ok, true); assert.deepEqual(pb.stats, { days: 2, invalid: 2 });
  const local = { metrics: METRICS, goals: { water: 2 }, profile: { ...DEFAULT_PROFILE, height: 170 }, days: { ht_2026_10_2: { weight: 99 }, ht_2026_10_9: { weight: 80 } } };
  const merge = planImport({ mode: 'merge', local, payload: pb.payload, cloudDayIds: ['2026_10_9', '2026_10_5'] });
  assert.deepEqual(merge.deleteLocalDays, []); assert.deepEqual(merge.deleteCloudDayIds, []); assert.deepEqual(merge.settings.goals, { water: 2, weight: 68 });
  assert.deepEqual(merge.summary, { mode: 'merge', backupDays: 2, overwritten: 1, newFromBackup: 1, localOnly: 1, deleteLocal: 0, deleteCloud: 0 });
  const rep = planImport({ mode: 'replace', local, payload: pb.payload, cloudDayIds: ['2026_10_9', '2026_10_5', '2026_10_1'] });
  assert.deepEqual(rep.deleteLocalDays, ['ht_2026_10_9']); assert.deepEqual(rep.deleteCloudDayIds.sort(), ['2026_10_5', '2026_10_9']); assert.deepEqual(rep.settings.goals, { weight: 68 });
  assert.deepEqual(planImport({ mode: 'replace', local, payload: { days: {} } }).settings.metrics, METRICS);        // empty metrics in backup never wipe the local list
  assert.equal(planImport({ mode: 'replace', local, payload: { profile: { height: 180 } } }).settings.profile.activity, 1.375);
});
// ---------- insights + reports ----------
const TODAY = new Date(2026, 9, 11);
const allDays = []; { const dt = new Date(2025, 5, 1); while (dt <= TODAY) { if (rnd() < .55) allDays.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), data: randDoc() }); dt.setDate(dt.getDate() + 1); } }
const dayMap = new Map(allDays.map(e => [`${e.y}_${e.m}_${e.d}`, e.data])); const getDayX = (y, m, d) => dayMap.get(`${y}_${m}_${d}`) || {};
const mk = (offsets, f = () => ({ weight: 70 })) => offsets.map(o => { const d = new Date(TODAY); d.setDate(d.getDate() - o); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), data: f(o) }; }).sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);

await t('streaks, active days, meds adherence equal the legacy functions (random data + engineered streaks)', () => {
  const eng = mk([0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);          // current 5, best 10
  for (const days of [allDays, eng, mk([1, 2, 3]), []]) {
    assert.deepEqual(INS.loggingStreak(days, METRICS, TODAY), O.legacyLoggingStreak(days, METRICS, TODAY));
    for (const goal of [0, 2, 3.5]) assert.deepEqual(INS.waterStreak(days, goal, TODAY), O.legacyWaterStreak(days, goal, TODAY));
    assert.equal(INS.activeDays(days, TODAY), O.legacyActiveDays(days, TODAY)); assert.equal(INS.medsAdherence(days), O.legacyMeds(days));
  }
  assert.deepEqual(INS.loggingStreak(eng, METRICS, TODAY), { current: 5, best: 10 }); assert.deepEqual(INS.loggingStreak(mk([1, 2, 3]), METRICS, TODAY), { current: 0, best: 3 });   // today not logged yet -> 0
  assert.equal(INS.activeDays(mk([0, 29, 30], () => ({ steps: 5000 })), TODAY), 2);                                                                                               // 30-day window includes today and 29 days back
  assert.equal(INS.medsAdherence(mk([0, 1], o => ({ meds_items: [{ checked: true }, { checked: o === 0 }] }))), 75); assert.equal(INS.medsAdherence([{ y: 2026, m: 0, d: 1, data: { meds_items: [] } }]), null);
});
await t('goal progress, month comparison, mood frequency, rolling average, 90-point series, best months, correlations equal legacy', () => {
  const mc = S.calcMonth(getDayX, 2026, 8, METRICS), prev = S.calcMonth(getDayX, 2026, 7, METRICS), goals = { weight: 68, water: 2.5, steps: 8000, sleep: 7.5 };
  const rows = INS.goalProgress(mc, goals); assert.deepEqual(rows.map(r => r.id), ['weight', 'water', 'steps', 'sleep']);
  const have = { weight: S.last(mc.weights), water: S.avg(mc.waters), steps: S.avg(mc.steps), sleep: S.avg(mc.sleeps) };
  rows.forEach(r => assert.equal(r.pct, r.have == null ? null : O.legacyGoalPct(have[r.id], goals[r.id], r.id === 'weight')));
  assert.deepEqual(INS.goalProgress(mc, {}), []); assert.equal(INS.goalProgress(S.calcMonth(() => ({}), 2026, 0, METRICS), { weight: 70 })[0].pct, null);
  const cmp = INS.monthComparison(mc, prev); cmp.forEach(r => { const c = S.avg(mc[{ Weight: 'weights', Sleep: 'sleeps', Water: 'waters', Steps: 'steps' }[r.label]]); assert.equal(r.cur, c); if (r.diff != null) assert.equal(r.good, r.label === 'Weight' ? r.diff <= 0 : r.diff >= 0); });
  assert.deepEqual(INS.monthComparison(S.calcMonth(() => ({}), 2026, 0, METRICS), S.calcMonth(() => ({}), 2026, 1, METRICS)), []);
  const mf = INS.moodFrequency(allDays); assert.deepEqual(mf.rows.map(r => [r.id, r.count, r.pct]), O.legacyMoodFreq(allDays, MOODS)); assert.equal(INS.moodFrequency([]).total, 0);
  const vals = [3, null, 5, 7, 9, 2, null]; assert.deepEqual(INS.rollingAvg(vals, 3), O.legacyRolling(vals, 3));
  for (const id of ['weight', 'hr', 'sleep', 'water', 'steps', 'sugar']) { const a = INS.metricSeries(allDays, id), b = O.legacyLast90(allDays, id); assert.deepEqual(a, b); assert.ok(a.length <= 90); }
  for (const [y, m] of [[2026, 9], [2026, 3], [2026, 0]]) { const a = INS.bestWorstMonths(getDayX, METRICS, y, m), b = O.legacyBestWorst(getDayX, y, m, METRICS);
    assert.equal(a.enough, !!b); if (b) { assert.deepEqual(a.mostActive && [a.mostActive.y, a.mostActive.mo, a.mostActive.steps], b.mostActive); assert.deepEqual(a.bestSleep && [a.bestSleep.y, a.bestSleep.mo, a.bestSleep.sleep], b.bestSleep); } }
  assert.equal(INS.bestWorstMonths(() => ({}), METRICS, 2026, 5).enough, false);
  for (const [a, am, b, bm] of [['sleep', false, 'mood', true], ['water', false, 'weight', false], ['steps', false, 'sleep', false]]) {
    const x = INS.correlation(allDays, a, b, { aMood: am, bMood: bm }), y = O.legacyCorr(allDays, a, am, b, bm, MOODS); assert.equal(x.r, y.r); assert.equal(x.n, y.n); }
  const withR = ys => INS.correlation(ys.map((v, i) => ({ y: 2026, m: 0, d: i + 1, data: { sleep: i + 1, water: v } })), 'sleep', 'water');
  assert.equal(withR([2, 1, 4, 3, 6, 2]).strength, 'moderate'); assert.equal(withR([1, 4, 2, 3, 6, 3]).strength, 'strong'); assert.ok(Math.abs(withR([1, 4, 2, 3, 6, 3]).r - 0.52757) < 1e-4);   // r 0.42 = moderate, 0.53 = strong
  assert.equal(withR([5, 1, 4, 2, 6, 3]).strength, 'weak'); assert.equal(withR([6, 5, 4, 3, 2, 1]).direction, 'negative');
  assert.equal(INS.correlation([], 'sleep', 'water').r, null); assert.equal(INS.pearson([1, 2, 3], [1, 1, 1]), null); assert.ok(Math.abs(INS.pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
  assert.equal(INS.moodToScore('great'), 5); assert.equal(INS.moodToScore('bad'), 1); assert.equal(INS.moodToScore('x'), null);
  assert.deepEqual(INS.correlation(mk([0, 1, 2, 3, 4], o => ({ sleep: 5 + o, mood: o === 4 ? 'bad' : o === 3 ? 'low' : o === 2 ? 'okay' : o === 1 ? 'good' : 'great' })), 'sleep', 'mood', { bMood: true }).strength, 'strong');
});
await t('weight forecast: same as legacy on daily data; uses real days when logging is sparse (legacy overstated the pace)', () => {
  const daily = mk(Array.from({ length: 20 }, (_, i) => 19 - i), o => ({ weight: Math.round((80 - (19 - o) * 0.1) * 10) / 10 }));    // loses 0.1 kg/day, ends at 78.1
  const a = INS.weightForecast(daily, 75, TODAY), b = O.legacyForecast(daily, 75, TODAY);
  assert.equal(a.state, 'on-track'); assert.equal(b.state, 'on-track'); assert.ok(Math.abs(a.slopePerWeek - b.perWeek) < 1e-6); assert.equal(a.daysToGoal, b.days); assert.equal(a.projDate.getTime(), b.proj);
  const sparse = mk([30, 27, 24, 21, 18, 15, 12, 9, 6, 3, 0], o => ({ weight: Math.round((80 - (30 - o) / 3 * 0.3) * 10) / 10 }));             // 0.3 kg per entry = 0.1 kg/day
  const s = INS.weightForecast(sparse, 75, TODAY), l = O.legacyForecast(sparse, 75, TODAY);
  assert.ok(Math.abs(s.slopePerWeek + 0.7) < 0.05, 'real pace is -0.7 kg/week, got ' + s.slopePerWeek); assert.ok(Math.abs(l.perWeek + 2.1) < 0.15, 'legacy claimed -2.1/week'); assert.ok(s.daysToGoal > 2.5 * l.days);
  assert.equal(INS.weightForecast(daily, 0, TODAY).state, 'need-goal'); assert.equal(INS.weightForecast(mk([0, 1]), 70, TODAY).state, 'need-data');
  assert.equal(INS.weightForecast(mk([2, 1, 0], o => ({ weight: 70.1 })), 70, TODAY).state, 'at-goal'); assert.equal(INS.weightForecast(mk([2, 1, 0], () => ({ weight: 70.19 })), 70, TODAY).state, 'at-goal'); assert.equal(INS.weightForecast(mk([2, 1, 0], () => ({ weight: 70.3 })), 70, TODAY).state, 'off-track');   // 0.2 kg is the at-goal band
  assert.equal(INS.weightForecast(daily, 85, TODAY).state, 'off-track'); assert.equal(INS.weightForecast(mk([2, 1, 0], () => ({ weight: 70 })), 65, TODAY).state, 'off-track');
});
await t('tips and heatmap', () => {
  assert.equal(INS.tips({ streak: { current: 0 }, latestWeight: null, avgSleep: null, goals: {} })[0].kind, 'start');
  assert.equal(INS.tips({ streak: { current: 9 }, latestWeight: 70.2, avgSleep: 5, goals: { weight: 70, sleep: 8 } }).length, 2);                         // capped at two
  assert.deepEqual(INS.tips({ streak: { current: 3 }, latestWeight: 75, avgSleep: 7, goals: { weight: 70, sleep: 8 } }).map(x => x.kind), ['keep']);
  assert.match(INS.tips({ streak: { current: 3 }, latestWeight: 75, avgSleep: 5.5, goals: { sleep: 8 } })[0].text, /5\.5h sleep.*8h goal/);
  assert.equal(INS.tips({ streak: { current: 3 }, latestWeight: null, avgSleep: 6.5, goals: { sleep: 8 } })[0].kind, 'sleep'); assert.equal(INS.tips({ streak: { current: 3 }, latestWeight: null, avgSleep: 7.5, goals: { sleep: 8 } })[0].kind, 'keep');   // more than 1h below goal
  const hm = INS.heatmap((y, m, d) => d === 3 ? { weight: 70 } : {}, METRICS, 2026, 9, TODAY);
  assert.equal(hm.lead, new Date(2026, 9, 1).getDay()); assert.equal(hm.cells.length, 31); assert.equal(hm.any, true);
  assert.deepEqual([hm.cells[2].has, hm.cells[2].future, hm.cells[10].today, hm.cells[11].future, hm.cells[10].future], [true, false, true, true, false]);
  assert.ok(INS.heatmap(() => ({}), METRICS, 2026, 10, TODAY).cells.every(c => c.future)); assert.ok(INS.heatmap(() => ({}), METRICS, 2026, 8, TODAY).cells.every(c => !c.future)); assert.equal(INS.heatmap(() => ({}), METRICS, 2026, 8, TODAY).any, false);
});
await t('reports: month/year tables, CSV equals the legacy export, xlsx and printable HTML are well-formed and escaped', () => {
  const m = R.buildReport({ getDay: getDayX, metrics: METRICS, y: 2026, m0: 8 });
  assert.equal(m.title, 'September 2026'); assert.equal(m.period, 'month'); assert.equal(m.hasData, true); assert.ok(m.rows.length > 0 && m.rows.every(r => r.length === m.head.length)); assert.match(m.summary[0].value, /^\d+ \/ 30$/); assert.equal(m.summary[0].label, 'Days logged');
  assert.equal(m.head[0], 'Date'); assert.equal(m.head.at(-1), 'Notes'); assert.ok(m.head.includes('Weight (kg)'));
  const y = R.buildReport({ getDay: getDayX, metrics: METRICS, y: 2026 }); assert.equal(y.title, '2026'); assert.ok(y.rows.length <= 10 && y.rows.length > 0 && y.rows.every(r => r.length === y.head.length)); assert.equal(y.rows[0][0], 'January');
  const none = R.buildReport({ getDay: () => ({}), metrics: METRICS, y: 2026, m0: 0 }); assert.equal(none.hasData, false); assert.equal(none.rows.length, 0);
  assert.equal(R.metricCell(METRICS[1], { bp_sys: 120 }), '120/\u2013'); assert.equal(R.metricCell(METRICS[0], { weight: 0 }), ''); assert.equal(R.metricCell(METRICS[10], { mood: 'low' }), 'Low'); assert.equal(R.metricCell(METRICS[11], { meds_items: [{ checked: true }, { checked: false }] }), '1/2');
  const withComma = [...allDays, { y: 2026, m: 9, d: 19, data: { weight: 70, hr: 60, note_weight: 'a', note_hr: 'b' } }, { y: 2026, m: 9, d: 20, data: { weight: 71, note_weight: 'said "hi", then\nleft', meds_items: [{ name: 'A,B', checked: true }] } }];
  assert.equal(R.buildCsv(withComma, METRICS), O.legacyCsv(withComma, METRICS)); assert.ok(R.buildCsv(withComma, METRICS).includes('Weight: a | Heart Rate: b'), 'several notes on one day are joined with " | "'); assert.equal(R.buildCsv([], METRICS).split('\r\n').length, 1);
  assert.equal(R.csvEscape('a"b'), '"a""b"'); assert.equal(RF.csvFileName(new Date('2026-10-11T00:00:00Z')), 'health-tracker-export-2026-10-11.csv'); assert.equal(RF.reportFileName(m, 'xlsx'), 'HealthTracker_September_2026.xlsx');
  const x = RF.reportToXlsx(m, { date: TODAY }); assert.ok(x instanceof Uint8Array && x[0] === 0x50 && x[1] === 0x4b); const txt = Buffer.from(x).toString('latin1'); assert.ok(txt.includes('xl/worksheets/sheet1.xml') && txt.includes('Health Tracker') && txt.includes('Monthly Report'));
  const evil = { ...m, title: '<img src=x onerror=alert(1)>', rows: [['<b>x</b>', 1, 'a & b']] }; const html = RF.reportToHtml(evil, { date: TODAY });
  assert.ok(!html.includes('<img src=x') && !html.includes('<b>x</b>') && html.includes('&lt;b&gt;x&lt;/b&gt;') && html.includes('a &amp; b'), 'report HTML escapes user text');
  const dh = RF.dayToHtml(R.buildDayReport({ y: 2026, m0: 9, d: 11, doc: { weight: 72.5, note_weight: '<i>', mood: 'good' }, metrics: METRICS, }), { date: TODAY }); assert.ok(dh.includes('72.5 kg') && dh.includes('&lt;i&gt;') && dh.includes('Sunday, October 11, 2026'));
  assert.ok(RF.dayToHtml({ title: 'x', lines: [] }).includes('No metrics logged'));
});
// ---------- repo end-to-end ----------
const cloud = {}; let failRemote = false;
const remote = { async set(p, d) { if (failRemote) throw new Error('offline'); cloud[p] = JSON.parse(JSON.stringify(d)); }, async del(p) { if (failRemote) throw new Error('offline'); delete cloud[p]; },
  async get(p) { if (failRemote) throw new Error('offline'); return cloud[p] ?? null; }, async list(c) { if (failRemote) throw new Error('offline'); return Object.entries(cloud).filter(([p]) => p.startsWith(c + '/')).map(([p, d]) => ({ id: p.slice(c.length + 1), data: d })); } };
const settle = () => new Promise(r => setTimeout(r, 15));
const fresh = (rem = remote, todayD = new Date(2026, 9, 11)) => { reset(); Object.keys(cloud).forEach(k => delete cloud[k]); failRemote = false;
  const store = createStore({ outboxKey: KEYS.NEW_KEYS.outbox, remote: rem }); return { store, repo: createRepo({ store, today: () => todayD, now: () => 1000, rand: () => 0.5 }) }; };

await t('repo reads data written by the LEGACY app untouched (same keys, same shapes)', () => {
  const { repo } = fresh();
  ls.setItem('ht_metrics_v1', JSON.stringify([{ id: 'weight', label: 'Weight', icon: 'w', type: 'number', unit: 'kg', group: 'body' }, { id: 'mood', label: 'Mood', icon: 'm', type: 'mood', group: 'mind' }]));
  ls.setItem('ht_goals_v1', JSON.stringify({ weight: 70 })); ls.setItem('ht_profile_v1', JSON.stringify({ height: 171 })); ls.setItem('ht_2026_10_9', JSON.stringify({ weight: 72.5, mood: 'good' }));
  repo.load(); assert.deepEqual(repo.state.metrics.map(m => m.pinned), [true, true]); assert.deepEqual(repo.state.goals, { weight: 70 }); assert.deepEqual(repo.state.profile, { height: 171, age: 0, sex: 'male', activity: 1.375 });
  assert.deepEqual(repo.getDay(2026, 9, 9), { weight: 72.5, mood: 'good' }); assert.deepEqual(repo.getDay(2026, 9, 8), {}); assert.equal(repo.listDays().length, 1);
  ls.setItem('ht_metrics_v1', '{bad json'); repo.load(); assert.equal(repo.state.metrics.length, DEFAULT_METRICS.length);                           // corrupt value falls back to defaults
});
await t('saveDay: writes local + cloud under the legacy key/path; locked days refuse unless unlocked', async () => {
  const { repo, store } = fresh();
  repo.saveDay(2026, 9, 11, { weight: 71 }); repo.saveDay(2026, 9, 10, { weight: 70 }); await settle();
  assert.deepEqual(JSON.parse(ls.getItem('ht_2026_10_11')), { weight: 71 }); assert.deepEqual(cloud['healthtracker/2026_10_11'], { weight: 71 }); assert.equal(store.pendingCount(), 0);
  assert.throws(() => repo.saveDay(2026, 9, 8, { weight: 1 }), LockedError); assert.equal(repo.getDay(2026, 9, 8).weight, undefined);
  repo.saveDay(2026, 9, 8, { weight: 69 }, { unlocked: true }); assert.equal(repo.getDay(2026, 9, 8).weight, 69);
  repo.setManualLock(2026, 9, 11, true); assert.equal(repo.isLocked(2026, 9, 11), true); assert.equal(repo.getDay(2026, 9, 11).weight, 71);              // lock keeps the data
  assert.throws(() => repo.saveDay(2026, 9, 11, { weight: 5 }), LockedError); repo.setManualLock(2026, 9, 11, false); assert.equal(repo.isLocked(2026, 9, 11), false);
  repo.setManualLock(2026, 9, 5, false); assert.equal(repo.isLocked(2026, 9, 5), false);                                                                  // manual unlock beats auto-lock
});
await t('settings sync as ONE doc { metrics, goals, profile }; metric/goal/profile ops persist', async () => {
  const { repo } = fresh();
  const mm = repo.metrics.add({ icon: '\uD83E\uDEC1', label: 'SpO2' }); repo.metrics.togglePin('sugar'); repo.metrics.update('hr', { label: 'Pulse' }); repo.goals.set('weight', 68); repo.setProfile({ height: 175, age: 26, sex: 'male', activity: 1.55 }); await settle();
  const doc = cloud['healthtracker_meta/settings']; assert.deepEqual(Object.keys(doc).sort(), ['goals', 'metrics', 'profile']);
  assert.ok(doc.metrics.some(m => m.id === mm.id) && doc.metrics.find(m => m.id === 'hr').label === 'Pulse' && doc.metrics.find(m => m.id === 'sugar').pinned === true);
  assert.deepEqual(doc.goals, { weight: 68 }); assert.equal(doc.profile.height, 175);
  assert.deepEqual(JSON.parse(ls.getItem('ht_goals_v1')), { weight: 68 }); assert.equal(JSON.parse(ls.getItem('ht_profile_v1')).age, 26);
  assert.throws(() => repo.goals.set('', 3)); repo.goals.remove('weight'); assert.deepEqual(repo.state.goals, {}); repo.metrics.remove(mm.id); assert.ok(!repo.state.metrics.some(m => m.id === mm.id));
});
await t('old app overwrite: day saved by the old version keeps its data readable (no schema change)', () => {
  const { repo } = fresh(); const doc = { weight: 70, bp_sys: 120, bp_dia: 80, mood: 'good', note_weight: 'x', locked: true };
  repo.saveDay(2026, 9, 11, doc, { unlocked: true });
  const els = { f_weight: { value: '70.5' }, f_bp_sys: { value: '118' }, f_bp_dia: { value: '78' }, f_mood: { dataset: { val: 'good' } } };
  const oldSaved = O.oldVersionSave(repo.state.metrics, els, {}, repo.getDay(2026, 9, 11));
  assert.equal(oldSaved.weight, 70.5); assert.equal(oldSaved.locked, true);
  assert.deepEqual(D.buildDayDoc(repo.state.metrics, { weight: '70.5', bp_sys: '118', bp_dia: '78', mood: 'good' }, { existing: doc }), oldSaved);   // new == old for the same input
});
await t('initialSync: pulls days + settings, never overwrites an unsent local edit, survives offline', async () => {
  const { repo, store } = fresh(); failRemote = true;
  repo.saveDay(2026, 9, 11, { weight: 71 }); await settle(); assert.equal(store.pendingCount(), 1);                                  // queued while offline
  failRemote = false; cloud['healthtracker/2026_10_11'] = { weight: 50 }; cloud['healthtracker/2026_10_10'] = { weight: 72 }; cloud['healthtracker/junk'] = { weight: 1 };
  cloud['healthtracker_meta/settings'] = { metrics: [{ id: 'weight', label: 'Weight', icon: 'w', type: 'number' }], goals: { weight: 66 }, profile: { height: 168 } };
  const steps = []; const r = await initialSync(repo, store, s => steps.push(s));
  assert.deepEqual(steps, ['days', 'settings']); assert.deepEqual(r.errors, []); assert.equal(repo.getDay(2026, 9, 11).weight, 71);        // unsent edit wins
  assert.equal(repo.getDay(2026, 9, 10).weight, 72); assert.equal(repo.state.goals.weight, 66); assert.equal(repo.state.profile.height, 168); assert.equal(repo.state.metrics.length, 1); assert.equal(repo.state.metrics[0].pinned, true);
  failRemote = true; const r2 = await initialSync(repo, store); assert.equal(r2.errors.length, 2); assert.equal(repo.getDay(2026, 9, 10).weight, 72);   // offline: errors reported, data intact
});
await t('applyImport (replace) + wipeAll', async () => {
  const { repo, store } = fresh(); repo.saveDay(2026, 9, 11, { weight: 71 }); repo.saveDay(2026, 9, 10, { weight: 70 }); repo.goals.set('weight', 60); await settle();
  cloud['healthtracker/2020_1_1'] = { weight: 90 };                                                                                  // cloud-only old day
  const pb = parseBackup(JSON.stringify(buildBackup({ metrics: DEFAULT_METRICS, goals: { water: 3 }, profile: DEFAULT_PROFILE, days: { ht_2026_10_10: { weight: 69 } } })));
  const plan = planImport({ mode: 'replace', local: { metrics: repo.state.metrics, goals: repo.state.goals, profile: repo.state.profile, days: Object.fromEntries(repo.listDays().map(x => [x.key, x.data])) }, payload: pb.payload, cloudDayIds: Object.keys(cloud).filter(k => k.startsWith('healthtracker/')).map(k => k.slice(14)) });
  repo.applyImport(plan, pb.payload); await settle();
  assert.deepEqual(repo.listDays().map(x => x.key), ['ht_2026_10_10']); assert.equal(repo.getDay(2026, 9, 10).weight, 69); assert.deepEqual(Object.keys(cloud).filter(k => k.startsWith('healthtracker/')), ['healthtracker/2026_10_10']);
  assert.deepEqual(repo.state.goals, { water: 3 }); assert.deepEqual(cloud['healthtracker_meta/settings'].goals, { water: 3 });
  const snap = repo.snapshot(); assert.equal(snap.version, 1); assert.deepEqual(Object.keys(snap.days), ['ht_2026_10_10']);
  cloud['healthtracker/2019_5_5'] = { weight: 88 };                                                                                  // cloud-only day found at wipe time
  const w = repo.wipeAll(['2019_5_5']); await settle(); assert.equal(w.localDays, 1); assert.equal(w.cloudDays, 1); assert.equal(repo.listDays().length, 0); assert.deepEqual(repo.state.goals, {}); assert.equal(repo.state.metrics.length, DEFAULT_METRICS.length);
  assert.deepEqual(Object.keys(cloud), []); assert.equal(store.pendingCount(), 0);
});
const GC = await import('../domain/guide-content.js');
await t('guide: view-model texts, personal numbers, and the static content adds up', () => {
  const none = G.guideModel([], DEFAULT_PROFILE);                                                       // nothing logged, no profile -> 70 kg example
  assert.deepEqual(none.cards.map(c => c.label), ['Protein', 'Fat', 'Carbs', 'Calorie Target', 'Weekly Gain']);
  assert.deepEqual(none.cards.map(c => c.val), ['112\u2013154g', '35\u2013105g', '210\u2013350g+', 'TDEE \u00D71.10\u20131.20', '0.18\u20130.35kg']);
  assert.equal(none.needsProfile, true); assert.equal(none.usingExample, true);
  assert.equal(none.notes[0], 'Using an example bodyweight of 70 kg \u2014 log your weight in Today to personalize these numbers.');
  assert.equal(none.notes[1], 'Add your height, age & activity level under Settings \u2192 Profile to see a personalized calorie target.');
  const days = [{ y: 2026, m: 8, d: 30, data: { weight: 80 } }, { y: 2026, m: 9, d: 5, data: { weight: 78.4 } }];
  const prof = { height: 175, age: 26, sex: 'male', activity: 1.55 }, full = G.guideModel(days, prof), o = O.legacyGuide(78.4, prof);
  assert.equal(full.needsProfile, false); assert.equal(full.usingExample, false);
  assert.equal(full.notes[0], 'Based on your last logged weight: 78.4 kg (Oct 5, 2026).');
  assert.equal(full.cards[3].val, `${o.surLow.toLocaleString('en-US')}\u2013${o.surHigh.toLocaleString('en-US')}`); assert.equal(full.cards[3].sub, 'kcal/day');
  assert.equal(full.notes[1], `Estimated TDEE ~${Math.round(o.tdee).toLocaleString('en-US')} kcal/day (Mifflin-St Jeor, from your Profile).`);
  assert.equal(full.cards[0].val, `${o.pLow}\u2013${o.pHigh}g`); assert.equal(full.cards[4].val, `${o.gainLow}\u2013${o.gainHigh}kg`);
  assert.equal(G.guideModel(days, { ...prof, height: 0 }).needsProfile, true);                           // height OR age missing -> still asks for the profile
  // static content: the sample plan's own totals must match what the card says, and the food list must really be cheapest-first
  const low = c => +c.replace(/[^\d\u2013]/g, '').split('\u2013')[0], high = c => +c.replace(/[^\d\u2013]/g, '').split('\u2013')[1];
  const lows = GC.FOODS.map(f => low(f.cost)); assert.deepEqual(lows, [...lows].sort((a, b) => a - b)); assert.equal(GC.FOODS.filter(f => f.best).length, 1); assert.equal(GC.FOODS[0].best, true);
  const num = (txt, re) => +re.exec(txt)[1], sum = f => GC.MEALS.reduce((a, m) => a + f(m), 0);
  assert.equal(sum(m => num(m.macro, /~(\d+)g protein/)), 126); assert.match(GC.MEALS_TOTAL.value, /^~126g protein/);
  assert.equal(sum(m => num(m.macro, /~(\d+) kcal/)), 2220); assert.match(GC.MEALS_TOTAL.value, /2,220\u20132,420 kcal/);
  assert.equal(sum(m => low(m.cost)), 170); assert.equal(sum(m => high(m.cost)), 220); assert.match(GC.MEALS_TOTAL.value, /\u09F3170\u2013220$/);
  assert.equal(GC.TRAINING.length, 4); assert.ok(GC.GUIDE_DISCLAIMER.includes('not personalized medical advice'));
});

const nodeFs = await import('node:fs'), nodePath = await import('node:path');
const HEALTH = new URL('../', import.meta.url), ROOT = new URL('../../../', import.meta.url);
const swSource = nodeFs.readFileSync(new URL('sw.js', HEALTH), 'utf8');
const precacheList = () => swSource.slice(swSource.indexOf('const PRECACHE = ['), swSource.indexOf('];', swSource.indexOf('const PRECACHE = ['))).match(/'\/[^']+'/g).map(x => x.slice(1, -1));
await t('pwa files: manifest, icons, index.html links, and a precache list that matches the real import graph', () => {
  const manifest = JSON.parse(nodeFs.readFileSync(new URL('manifest.json', HEALTH), 'utf8'));
  assert.deepEqual([manifest.start_url, manifest.scope, manifest.id, manifest.display], ['/apps/health/index.html', '/apps/health/', '/apps/health/index.html', 'fullscreen']);
  assert.ok(manifest.icons.length >= 2); manifest.icons.forEach(ic => { assert.ok(ic.purpose.includes('maskable'), ic.src); assert.ok(ic.src.startsWith('/apps/health/'), 'own icon, not the legacy one: ' + ic.src); });
  const legacy = JSON.parse(nodeFs.readFileSync(new URL('manifest-healthtracker.json', ROOT), 'utf8')), money = JSON.parse(nodeFs.readFileSync(new URL('apps/money/manifest.json', ROOT), 'utf8'));
  assert.notEqual(manifest.id, money.id); assert.notEqual(manifest.start_url, legacy.start_url);                  // installs side by side with the old Health Tracker and Money Tracker
  const png = f => { const b = nodeFs.readFileSync(new URL(f, HEALTH)); assert.equal(b.subarray(1, 4).toString(), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual([png('icon-192.png'), png('icon-512.png'), png('icon-touch.png')], [[192, 192], [512, 512], [180, 180]]);
  const html = nodeFs.readFileSync(new URL('index.html', HEALTH), 'utf8');
  assert.match(html, /<link rel="manifest" href="\/apps\/health\/manifest\.json">/); assert.match(html, /rel="apple-touch-icon" href="\/apps\/health\/icon-touch\.png"/);
  // every same-origin file the page loads, written EXACTLY as the page writes it (the Cache API treats ?v=3 as a different file from no query)
  const pageAssets = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith('//') && !/manifest|icon-|touch/.test(u));
  const list = precacheList(); assert.equal(new Set(list).size, list.length, 'no duplicates');
  for (const u of pageAssets) assert.ok(list.includes(u), 'page asset missing from PRECACHE: ' + u);
  assert.ok(list.includes('/apps/health/index.html') && list.includes('/apps/health/manifest.json') && list.includes('/apps/health/icon-192.png'));
  for (const u of list) assert.ok(nodeFs.existsSync(new URL('.' + u.split('?')[0], ROOT)), 'PRECACHE lists a file that does not exist: ' + u);
  const seen = new Set(), walk = f => { if (seen.has(f)) return; seen.add(f); for (const m of nodeFs.readFileSync(new URL('.' + f, ROOT), 'utf8').matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) walk(nodePath.posix.normalize(nodePath.posix.dirname(f) + '/' + m[1])); };
  walk('/apps/health/main.js');
  for (const f of seen) assert.ok(list.includes(f), 'module is imported but not precached (the app would break offline): ' + f);
  for (const f of list.filter(x => x.endsWith('.js') && x !== '/theme.js' && x !== '/owner.js')) assert.ok(seen.has(f), 'precached module nothing imports (dead weight): ' + f);
  assert.ok(!list.includes('/apps/shared/firestore.js'), 'firestore.js is deliberately not precached');
  assert.ok([...seen].includes('/apps/health/views/guide.js') && [...seen].includes('/apps/health/components/settings-sheet.js') && [...seen].includes('/apps/health/components/restore.js'), 'this round\'s files are part of the graph');
});
await t('pwa sw.js: precaches the shell, cache-first, offline fallback, and touches ONLY health-shell-* caches (never Money\'s)', async () => {
  const ORIGIN = 'http://localhost:8123', abs = u => new URL(u, ORIGIN + '/').href, swListeners = {}, swCaches = new Map(), PATHS = new Set(precacheList().map(u => u.split('?')[0]));
  let offline = false;
  const swFetch = async req => { if (offline) throw new Error('offline'); const url = typeof req === 'string' ? req : req.url, path = new URL(url, ORIGIN + '/').pathname, known = PATHS.has(path); return { ok: known, status: known ? 200 : 404, url, clone() { return this; } }; };
  globalThis.self = { addEventListener: (type, fn) => { (swListeners[type] ||= []).push(fn); }, location: { origin: ORIGIN }, skipWaiting: () => { globalThis.__swSkipped = true; }, clients: { claim: async () => { globalThis.__swClaimed = true; } } };
  globalThis.caches = { open: async name => { if (!swCaches.has(name)) swCaches.set(name, new Map()); const m = swCaches.get(name);
      return { add: async url => { const r = await swFetch(url); if (!r.ok) throw new Error('404 ' + url); m.set(abs(url), r); }, put: async (req, res) => m.set(abs(typeof req === 'string' ? req : req.url), res), match: async req => m.get(abs(typeof req === 'string' ? req : req.url)) }; },
    match: async req => { const key = abs(typeof req === 'string' ? req : req.url); for (const m of swCaches.values()) if (m.has(key)) return m.get(key); return undefined; }, keys: async () => [...swCaches.keys()], delete: async name => swCaches.delete(name) };
  globalThis.fetch = swFetch; globalThis.Response = class { static error() { return { ok: false, status: 0, isError: true }; } };
  await import(new URL('sw.js', HEALTH));
  assert.ok(swListeners.install && swListeners.activate && swListeners.message && swListeners.fetch);
  const w1 = []; await swListeners.install[0]({ waitUntil: p => w1.push(p) }); await Promise.all(w1);
  const names = [...swCaches.keys()]; assert.equal(names.length, 1); assert.match(names[0], /^health-shell-v\d+$/); const shell = swCaches.get(names[0]);
  assert.equal(shell.size, precacheList().length, 'every PRECACHE entry actually landed in the cache (a silent miss would break offline)');
  assert.ok(shell.has(abs('/apps/health/index.html')) && shell.has(abs('/site.css?v=3')) && shell.has(abs('/apps/health/views/guide.js')));
  swCaches.set('health-shell-v0', new Map([[abs('/old.js'), { ok: true }]])); swCaches.set('money-shell-v2', new Map([[abs('/apps/money/main.js'), { ok: true }]]));
  const w2 = []; await swListeners.activate[0]({ waitUntil: p => w2.push(p) }); await Promise.all(w2);
  assert.ok(!swCaches.has('health-shell-v0'), 'stale health cache dropped'); assert.ok(swCaches.has('money-shell-v2'), 'Money Tracker\'s cache is left alone'); assert.equal(globalThis.__swClaimed, true);
  swListeners.message[0]({ data: { type: 'SKIP_WAITING' } }); assert.equal(globalThis.__swSkipped, true);
  let p1; swListeners.fetch[0]({ request: { method: 'GET', url: ORIGIN + '/apps/health/app.css' }, respondWith: p => { p1 = p; } }); assert.equal(new URL((await p1).url, ORIGIN + '/').pathname, '/apps/health/app.css');
  let touched = false; swListeners.fetch[0]({ request: { method: 'GET', url: 'https://fonts.googleapis.com/x' }, respondWith: () => { touched = true; } }); assert.equal(touched, false, 'cross-origin left alone');
  swListeners.fetch[0]({ request: { method: 'POST', url: ORIGIN + '/apps/health/app.css' }, respondWith: () => { touched = true; } }); assert.equal(touched, false, 'non-GET left alone');
  offline = true; let p2; swListeners.fetch[0]({ request: { method: 'GET', url: ORIGIN + '/apps/health/index.html', mode: 'navigate' }, respondWith: p => { p2 = p; } }); assert.equal(new URL((await p2).url, ORIGIN + '/').pathname, '/apps/health/index.html');
  let p3; swListeners.fetch[0]({ request: { method: 'GET', url: ORIGIN + '/apps/health/some-new-route', mode: 'navigate' }, respondWith: p => { p3 = p; } }); assert.equal(new URL((await p3).url, ORIGIN + '/').pathname, '/apps/health/index.html', 'unknown page while offline falls back to the shell');
  const moneySrc = nodeFs.readFileSync(new URL('apps/money/sw.js', ROOT), 'utf8'); assert.ok(/startsWith\('money-shell-'\)/.test(moneySrc) && !/health-shell/.test(moneySrc), 'and Money\'s worker does not touch Health\'s cache either');
});
console.log(`${n} test groups passed (keys, calendar, lock, day doc, stats, search, guide, metrics, backup, repo, sync, guide model, pwa files, pwa sw)`);
