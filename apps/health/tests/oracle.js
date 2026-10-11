// Legacy algorithms ported LITERALLY from ht.js (globals turned into parameters). Used as the reference in run.mjs.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => m === 1 && isLeap(y) ? 29 : DAYS_IN_MONTH[m];

export function legacyDayHasData(METRICS, saved) {
  return METRICS.some(m => {
    if (m.type === 'number') return (saved[m.id] || 0) > 0;
    if (m.type === 'bp') return (saved[m.id + '_sys'] || 0) > 0;
    if (m.type === 'scale') return (saved[m.id] || 0) > 0;
    if (m.type === 'mood') return !!saved.mood;
    if (m.type === 'checklist') { const items = saved[m.id + '_items']; return Array.isArray(items) && items.length > 0; }
    return false;
  });
}
export function legacyForcedShown(m, data) {
  if (m.pinned) return false;
  if (m.type === 'bp') return (parseFloat(data[m.id + '_sys']) || 0) > 0 || (parseFloat(data[m.id + '_dia']) || 0) > 0;
  if (m.type === 'checklist') { const items = data[m.id + '_items']; return Array.isArray(items) && items.length > 0; }
  if (m.type === 'mood') { return !!data[m.id]; }
  if (m.type === 'scale') { return (parseFloat(data[m.id]) || 0) > 0; }
  const hasVal = (parseFloat(data[m.id]) || 0) > 0; const hasNote = !!(data['note_' + m.id] && String(data['note_' + m.id]).trim());
  return hasVal || hasNote;
}
// collectDayData with the DOM replaced by `els` = { 'f_weight': {value}, 'f_sleepq': {dataset:{val}}, 'f_mood': {dataset:{val}}, 'note_x': {value} }, `items` = { meds: [...] }
export function legacyCollectDay(METRICS, els, items, existing, extraShownIds) {
  const document = { getElementById: id => els[id] || null };
  const data = {};
  METRICS.forEach(m => {
    if (m.type === 'number') { const el = document.getElementById('f_' + m.id); data[m.id] = el ? (parseFloat(el.value) || 0) : 0; }
    else if (m.type === 'bp') { const sEl = document.getElementById('f_' + m.id + '_sys'), dEl = document.getElementById('f_' + m.id + '_dia');
      data[m.id + '_sys'] = sEl ? (parseFloat(sEl.value) || 0) : 0; data[m.id + '_dia'] = dEl ? (parseFloat(dEl.value) || 0) : 0; }
    else if (m.type === 'scale') { const wrap = document.getElementById('f_' + m.id); data[m.id] = wrap && wrap.dataset.val ? parseInt(wrap.dataset.val) : 0; }
    else if (m.type === 'mood') { const wrap = document.getElementById('f_mood'); data.mood = wrap ? (wrap.dataset.val || '') : ''; }
    else if (m.type === 'checklist') { data[m.id + '_items'] = items[m.id] || []; }
    const noteEl = document.getElementById('note_' + m.id); const noteVal = noteEl ? noteEl.value.trim() : '';
    if (noteVal) data['note_' + m.id] = noteVal;
  });
  METRICS.forEach(m => { if (m.pinned) return; if (!legacyForcedShown(m, data) && extraShownIds.has(m.id)) data['shown_' + m.id] = true; });
  const existingLock = existing.locked; if (typeof existingLock === 'boolean') data.locked = existingLock;
  return data;
}
export function legacyCalcMonth(getDay, y, m, METRICS) {
  const days = daysInMonth(y, m);
  const weights = [], sys = [], dia = [], hrs = [], sugars = [], sleeps = [], waters = [], steps = [], calIn = [], calOut = [];
  const moodCounts = {}; let loggedDays = 0; const dailyRows = [];
  for (let d = 1; d <= days; d++) {
    const data = getDay(y, m, d); const has = legacyDayHasData(METRICS, data);
    if (has) loggedDays++;
    if (data.weight > 0) weights.push({ d, v: data.weight });
    if (data.bp_sys > 0 || data.bp_dia > 0) { sys.push({ d, v: data.bp_sys || null }); dia.push({ d, v: data.bp_dia || null }); }
    if (data.hr > 0) hrs.push({ d, v: data.hr }); if (data.sugar > 0) sugars.push({ d, v: data.sugar }); if (data.sleep > 0) sleeps.push({ d, v: data.sleep });
    if (data.water > 0) waters.push({ d, v: data.water }); if (data.steps > 0) steps.push({ d, v: data.steps });
    if (data.calin > 0) calIn.push({ d, v: data.calin }); if (data.calout > 0) calOut.push({ d, v: data.calout });
    if (data.mood) moodCounts[data.mood] = (moodCounts[data.mood] || 0) + 1;
    dailyRows.push({ d, data, has });
  }
  return { days, loggedDays, weights, sys, dia, hrs, sugars, sleeps, waters, steps, calIn, calOut, moodCounts, dailyRows };
}
export const legacyBmiOf = (w, PROFILE) => { if (!w || !PROFILE.height) return null; const hM = PROFILE.height / 100; return w / (hM * hM); };
export function legacyBmiCategory(bmi) { if (bmi == null) return null; if (bmi < 18.5) return { label: 'Underweight', cls: 'under' }; if (bmi < 25) return { label: 'Normal', cls: 'normal' }; if (bmi < 30) return { label: 'Overweight', cls: 'over' }; return { label: 'Obese', cls: 'obese' }; }
export function legacyBpCategory(sys, dia) { if (sys == null || dia == null) return null; if (sys < 120 && dia < 80) return { label: 'Normal', cls: 'normal' }; if (sys < 130 && dia < 80) return { label: 'Elevated', cls: 'over' }; if (sys < 140 || dia < 90) return { label: 'Stage 1', cls: 'over' }; return { label: 'Stage 2', cls: 'obese' }; }
// renderGuideTab numbers
export function legacyGuide(w0, PROFILE) {
  const w = w0 || 70;
  const o = { pLow: Math.round(w * 1.6), pHigh: Math.round(w * 2.2), fLow: Math.round(w * 0.5), fHigh: Math.round(w * 1.5), cLow: Math.round(w * 3), cHigh: Math.round(w * 5), gainLow: (w * 0.0025).toFixed(2), gainHigh: (w * 0.005).toFixed(2) };
  if (PROFILE.height > 0 && PROFILE.age > 0) {
    const bmr = PROFILE.sex === 'female' ? (10 * w + 6.25 * PROFILE.height - 5 * PROFILE.age - 161) : (10 * w + 6.25 * PROFILE.height - 5 * PROFILE.age + 5);
    const tdee = bmr * (PROFILE.activity || 1.375); o.tdee = tdee; o.surLow = Math.round(tdee * 1.10); o.surHigh = Math.round(tdee * 1.20);
  }
  return o;
}
export function legacyLatestWeight(entries) {
  let best = null;
  entries.forEach(e => { if (e.data && e.data.weight > 0) { if (!best || e.y > best.y || (e.y === best.y && e.m > best.m) || (e.y === best.y && e.m === best.m && e.d > best.d)) best = { y: e.y, m: e.m, d: e.d, v: e.data.weight }; } });
  return best;
}
// What the OLD app does when it saves a day: rebuilds the doc from the known fields only (any unknown field is dropped).
export const oldVersionSave = (metrics, els, items, existing) => legacyCollectDay(metrics, els, items, existing, new Set());

// ---------- ht-insights.js (legacy), globals turned into parameters ----------
const dateKey = (y, m, d) => y * 10000 + m * 100 + d;
const keyToDate = k => { const y = Math.floor(k / 10000), m = Math.floor((k % 10000) / 100), d = k % 100; return new Date(y, m, d); };
export function legacyLoggingStreak(entries, METRICS, today) {
  const es = entries.filter(e => legacyDayHasData(METRICS, e.data)); if (!es.length) return { current: 0, best: 0 };
  const keys = new Set(es.map(e => dateKey(e.y, e.m, e.d))); let cur = 0; let d = new Date(today);
  while (true) { const k = dateKey(d.getFullYear(), d.getMonth(), d.getDate()); if (keys.has(k)) { cur++; d.setDate(d.getDate() - 1); } else break; }
  const sortedKeys = Array.from(keys).sort((a, b) => a - b); let best = 1, run = 1;
  for (let i = 1; i < sortedKeys.length; i++) { const diff = Math.round((keyToDate(sortedKeys[i]) - keyToDate(sortedKeys[i - 1])) / 86400000); run = diff === 1 ? run + 1 : 1; if (run > best) best = run; }
  return { current: cur, best: Math.max(best, cur) };
}
export function legacyWaterStreak(entries, goal, today) {
  if (!goal) return { current: 0, best: 0, hasGoal: false };
  const es = entries.filter(e => (e.data.water || 0) >= goal); if (!es.length) return { current: 0, best: 0, hasGoal: true };
  const keys = new Set(es.map(e => dateKey(e.y, e.m, e.d))); let cur = 0, d = new Date(today);
  while (true) { const k = dateKey(d.getFullYear(), d.getMonth(), d.getDate()); if (keys.has(k)) { cur++; d.setDate(d.getDate() - 1); } else break; }
  const sortedKeys = Array.from(keys).sort((a, b) => a - b); let best = 1, run = 1;
  for (let i = 1; i < sortedKeys.length; i++) { const diff = Math.round((keyToDate(sortedKeys[i]) - keyToDate(sortedKeys[i - 1])) / 86400000); run = diff === 1 ? run + 1 : 1; if (run > best) best = run; }
  return { current: cur, best: Math.max(best, cur), hasGoal: true };
}
export function legacyActiveDays(entries, today) {
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 29); const cutoffKey = dateKey(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()), nowKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  return entries.filter(e => { const k = dateKey(e.y, e.m, e.d); return k >= cutoffKey && k <= nowKey && (e.data.steps || 0) > 0; }).length;
}
export function legacyMeds(entries) {
  const es = entries.filter(e => Array.isArray(e.data.meds_items) && e.data.meds_items.length > 0); if (!es.length) return null;
  let total = 0, taken = 0; es.forEach(e => { e.data.meds_items.forEach(it => { total++; if (it.checked) taken++; }); }); return total ? Math.round((taken / total) * 100) : null;
}
export const legacyGoalPct = (have, target, lowerIsBetter) => target > 0 ? Math.min(100, Math.round((lowerIsBetter ? (1 - Math.min(1, Math.abs(have - target) / Math.max(target, 1))) : have / target) * 100)) : 0;
export function legacyMoodFreq(entries, MOODS) {
  const counts = {}; let total = 0; entries.forEach(e => { if (e.data.mood) { counts[e.data.mood] = (counts[e.data.mood] || 0) + 1; total++; } });
  return MOODS.filter(mo => counts[mo.id]).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)).map(mo => [mo.id, counts[mo.id], Math.round((counts[mo.id] / total) * 100)]);
}
export const legacyRolling = (values, window) => values.map((v, i) => { const start = Math.max(0, i - window + 1); const slice = values.slice(start, i + 1).filter(x => x != null); return slice.length ? slice.reduce((s, x) => s + x, 0) / slice.length : null; });
export const legacyLast90 = (entries, id) => entries.map(e => ({ y: e.y, m: e.m, d: e.d, v: e.data[id] || null })).filter(p => p.v != null && p.v > 0).slice(-90);
export function legacyBestWorst(getDay, y, m, METRICS) {
  const list = []; const avgL = arr => arr.length ? arr.reduce((s, x) => s + (typeof x === 'object' ? x.v : x), 0) / arr.length : null;
  for (let yy = y - 1; yy <= y; yy++) for (let mo = 0; mo < 12; mo++) { if (yy === y && mo > m) continue; const mc = legacyCalcMonth(getDay, yy, mo, METRICS); const aw = avgL(mc.weights); if (aw != null) list.push({ y: yy, mo, aw, steps: avgL(mc.steps), sleep: avgL(mc.sleeps) }); }
  if (list.length < 2) return null;
  const bySteps = list.filter(x => x.steps != null).sort((a, b) => b.steps - a.steps), bySleep = list.filter(x => x.sleep != null).sort((a, b) => b.sleep - a.sleep);
  return { mostActive: bySteps[0] ? [bySteps[0].y, bySteps[0].mo, bySteps[0].steps] : null, bestSleep: bySleep[0] ? [bySleep[0].y, bySleep[0].mo, bySleep[0].sleep] : null };
}
export function legacyForecast(entries, target, today) {   // slope per ENTRY (the legacy behaviour)
  const points = entries.map(e => ({ v: e.data.weight || null })).filter(p => p.v); if (points.length < 3) return null;
  const recent = points.slice(-30), n = recent.length, xs = recent.map((_, i) => i), ys = recent.map(p => p.v);
  const xMean = xs.reduce((s, x) => s + x, 0) / n, yMean = ys.reduce((s, y) => s + y, 0) / n; let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); den += (xs[i] - xMean) ** 2; }
  const slope = den !== 0 ? num / den : 0, current = ys[n - 1], diff = target - current;
  if (Math.abs(diff) < 0.2) return { state: 'at-goal' };
  if (Math.sign(slope) !== 0 && Math.sign(slope) === Math.sign(diff)) { const daysToGoal = Math.abs(diff / slope); const p = new Date(today); p.setDate(p.getDate() + Math.round(daysToGoal)); return { state: 'on-track', perWeek: slope * 7, days: Math.round(daysToGoal), proj: p.getTime() }; }
  return { state: 'off-track' };
}
function legacyPearson(xs, ys) { const n = xs.length; if (n < 3) return null; const xMean = xs.reduce((s, x) => s + x, 0) / n, yMean = ys.reduce((s, y) => s + y, 0) / n; let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); dx += (xs[i] - xMean) ** 2; dy += (ys[i] - yMean) ** 2; } const den = Math.sqrt(dx * dy); return den === 0 ? null : num / den; }
export function legacyCorr(entries, a, aMood, b, bMood, MOODS) {
  const score = mood => { const i = MOODS.findIndex(m => m.id === mood); return i === -1 ? null : (MOODS.length - i); };
  const xs = [], ys = []; entries.forEach(e => { const x = aMood ? score(e.data[a]) : (e.data[a] || null), y = bMood ? score(e.data[b]) : (e.data[b] || null); if (x != null && x > 0 && y != null && y > 0) { xs.push(x); ys.push(y); } });
  return { r: legacyPearson(xs, ys), n: xs.length };
}
// exportAllDataCSV
const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function legacyCsv(entries, METRICS) {
  const header = ['Date']; METRICS.forEach(m => { if (m.type === 'bp') header.push(m.label + ' (Sys)', m.label + ' (Dia)'); else if (m.type === 'checklist') header.push(m.label); else header.push(m.label + (m.unit ? ` (${m.unit})` : '')); }); header.push('Mood/Notes');
  const rows = [header];
  entries.slice().sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d)).forEach(({ y, m, d, data }) => {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; const row = [dateStr]; let notes = [];
    METRICS.forEach(met => {
      if (met.type === 'bp') row.push(data[met.id + '_sys'] || '', data[met.id + '_dia'] || '');
      else if (met.type === 'checklist') { const items = data[met.id + '_items']; row.push(Array.isArray(items) ? items.map(i => `${i.name}${i.checked ? ' ✓' : ''}`).join('; ') : ''); }
      else if (met.type === 'mood') row.push(data.mood || ''); else row.push(data[met.id] || '');
      if (data['note_' + met.id]) notes.push(`${met.label}: ${data['note_' + met.id]}`);
    });
    row.push(notes.join(' | ')); rows.push(row);
  });
  return rows.map(r => r.map(csvEsc).join(',')).join('\r\n');
}
