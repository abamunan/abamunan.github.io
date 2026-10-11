// Insights maths, ported from ht-insights.js. Pure: callers pass `days` (sorted [{y, m (0-based), d, data}]), `today`, goals.
// Two deliberate differences from the legacy file: the weight forecast uses real calendar days (the old one counted entries, so a
// weight logged every 3 days was projected 3x too fast), and everything takes `today` instead of reading the clock.
import { MOODS } from '../data/defaults.js';
import { dayHasData } from './day.js';
import { calcMonth, avg, last } from './stats.js';
import { daysInMonth } from './calendar.js';

const dk = (y, m, d) => y * 10000 + m * 100 + d;
const keyToDate = k => new Date(Math.floor(k / 10000), Math.floor((k % 10000) / 100), k % 100);
const dayDiff = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 86400000);

function streakOf(keys, today) {
  if (!keys.size) return { current: 0, best: 0 };
  let cur = 0; const d = new Date(today);
  while (keys.has(dk(d.getFullYear(), d.getMonth(), d.getDate()))) { cur++; d.setDate(d.getDate() - 1); }
  const sorted = [...keys].sort((a, b) => a - b); let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) { run = dayDiff(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1; if (run > best) best = run; }
  return { current: cur, best: Math.max(best, cur) };
}
// Current streak counts back from TODAY: if today is not logged yet it is 0 (same as the legacy app).
export const loggingStreak = (days, metrics, today) => streakOf(new Set(days.filter(e => dayHasData(metrics, e.data)).map(e => dk(e.y, e.m, e.d))), today);
export function waterStreak(days, goal, today) {
  if (!goal) return { current: 0, best: 0, hasGoal: false };
  return { ...streakOf(new Set(days.filter(e => (e.data.water || 0) >= goal).map(e => dk(e.y, e.m, e.d))), today), hasGoal: true };
}
export function activeDays(days, today) {            // days with steps logged in the last 30 days (today included)
  const c = new Date(today); c.setDate(c.getDate() - 29);
  const from = dk(c.getFullYear(), c.getMonth(), c.getDate()), to = dk(today.getFullYear(), today.getMonth(), today.getDate());
  return days.filter(e => { const k = dk(e.y, e.m, e.d); return k >= from && k <= to && (e.data.steps || 0) > 0; }).length;
}
export function medsAdherence(days) {                // all-time % of checklist items ticked; null when nothing tracked
  let total = 0, taken = 0, any = false;
  days.forEach(e => { const it = e.data.meds_items; if (Array.isArray(it) && it.length) { any = true; it.forEach(i => { total++; if (i.checked) taken++; }); } });
  return any && total ? Math.round(taken / total * 100) : null;
}

export function tips({ streak, latestWeight, avgSleep, goals }) {
  const out = [];
  if (streak.current === 0) out.push({ kind: 'start', text: 'No logging streak right now \u2014 log today to start one.' });
  else if (streak.current >= 7) out.push({ kind: 'streak', text: `You're on a ${streak.current}-day logging streak \u2014 keep it up!` });
  if (goals.weight > 0 && latestWeight && Math.abs(latestWeight - goals.weight) < 0.3) out.push({ kind: 'goal', text: "You're right at your weight goal \u2014 nice work." });
  if (goals.sleep > 0 && avgSleep != null && avgSleep < goals.sleep - 1) out.push({ kind: 'sleep', text: `Averaging ${avgSleep.toFixed(1)}h sleep this month \u2014 below your ${goals.sleep}h goal.` });
  if (!out.length) out.push({ kind: 'keep', text: 'Keep logging daily to unlock more personalized insights.' });
  return out.slice(0, 2);
}

export function goalProgress(mc, goals) {            // mc = calcMonth result for the chosen month
  const spec = [['weight', '\u2696\uFE0F', 'Weight', last(mc.weights), 'kg', true], ['water', '\uD83D\uDCA7', 'Avg Water', avg(mc.waters), 'L', false],
    ['steps', '\uD83D\uDC63', 'Avg Steps', avg(mc.steps), '', false], ['sleep', '\uD83D\uDE34', 'Avg Sleep', avg(mc.sleeps), 'hrs', false]];
  return spec.filter(([id]) => goals[id] > 0).map(([id, icon, label, have, unit, lowerIsBetter]) => {
    const target = goals[id];
    const pct = have == null ? null : Math.min(100, Math.round((lowerIsBetter ? (1 - Math.min(1, Math.abs(have - target) / Math.max(target, 1))) : have / target) * 100));
    return { id, icon, label, have, target, unit, pct };
  });
}
export function monthComparison(cur, prev) {
  const spec = [['Weight', '\u2696\uFE0F', 'weights', 'kg', true], ['Sleep', '\uD83D\uDE34', 'sleeps', 'h', false], ['Water', '\uD83D\uDCA7', 'waters', 'L', false], ['Steps', '\uD83D\uDC63', 'steps', '', false]];
  const rows = [];
  spec.forEach(([label, icon, key, unit, lowerBetter]) => {
    const c = avg(cur[key]), p = avg(prev[key]); if (c == null && p == null) return;
    const diff = c != null && p != null ? c - p : null;
    rows.push({ label, icon, cur: c, prev: p, diff, unit, good: diff == null ? null : lowerBetter ? diff <= 0 : diff >= 0 });
  });
  return rows;
}
export function moodFrequency(days) {                // all-time, most frequent first (ties keep the MOODS order)
  const counts = {}; let total = 0;
  days.forEach(e => { if (e.data.mood) { counts[e.data.mood] = (counts[e.data.mood] || 0) + 1; total++; } });
  return { total, rows: MOODS.filter(m => counts[m.id]).sort((a, b) => counts[b.id] - counts[a.id]).map(m => ({ ...m, count: counts[m.id], pct: Math.round(counts[m.id] / total * 100) })) };
}
export function heatmap(getDay, metrics, y, m0, today) {
  const n = daysInMonth(y, m0), lead = new Date(y, m0, 1).getDay(), same = y === today.getFullYear() && m0 === today.getMonth(), td = same ? today.getDate() : -1;
  const cells = []; let any = false;
  for (let d = 1; d <= n; d++) {
    const has = dayHasData(metrics, getDay(y, m0, d) || {}); if (has) any = true; const dow = new Date(y, m0, d).getDay();
    cells.push({ d, has, weekend: dow === 0 || dow === 6, today: d === td, future: td === -1 ? new Date(y, m0, d) > today : d > td });
  }
  return { lead, cells, any };
}

export function rollingAvg(values, window) {
  return values.map((v, i) => { const s = values.slice(Math.max(0, i - window + 1), i + 1).filter(x => x != null); return s.length ? s.reduce((a, x) => a + x, 0) / s.length : null; });
}
export function metricSeries(days, id, n = 90) {     // the last n LOGGED values (not n calendar days), like the legacy chart
  return days.map(e => ({ y: e.y, m: e.m, d: e.d, v: e.data[id] || null })).filter(p => p.v != null && p.v > 0).slice(-n);
}
export function bestWorstMonths(getDay, metrics, y, m0) {
  const list = [];
  for (let yy = y - 1; yy <= y; yy++) for (let mo = 0; mo < 12; mo++) {
    if (yy === y && mo > m0) continue;
    const mc = calcMonth(getDay, yy, mo, metrics), aw = avg(mc.weights);
    if (aw != null) list.push({ y: yy, mo, steps: avg(mc.steps), sleep: avg(mc.sleeps) });
  }
  if (list.length < 2) return { enough: false };
  const by = k => list.filter(x => x[k] != null).sort((a, b) => b[k] - a[k])[0] || null;
  return { enough: true, mostActive: by('steps'), bestSleep: by('sleep') };
}

const dayNo = e => Date.UTC(e.y, e.m, e.d) / 86400000;
export function weightForecast(days, target, today) {
  if (!target) return { state: 'need-goal' };
  const pts = days.filter(e => e.data.weight > 0);
  if (pts.length < 3) return { state: 'need-data' };
  const recent = pts.slice(-30), xs = recent.map(dayNo), ys = recent.map(e => e.data.weight), n = recent.length;
  const xm = xs.reduce((s, x) => s + x, 0) / n, ym = ys.reduce((s, y) => s + y, 0) / n; let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xm) * (ys[i] - ym); den += (xs[i] - xm) ** 2; }
  const slope = den !== 0 ? num / den : 0, current = ys[n - 1], diff = target - current;   // slope = kg per calendar day
  const base = { current, target, slopePerWeek: slope * 7 };
  if (Math.abs(diff) < 0.2) return { state: 'at-goal', ...base };
  if (Math.sign(slope) !== 0 && Math.sign(slope) === Math.sign(diff)) {
    const daysToGoal = Math.abs(diff / slope), proj = new Date(today); proj.setDate(proj.getDate() + Math.round(daysToGoal));
    return { state: 'on-track', ...base, daysToGoal: Math.round(daysToGoal), projDate: proj };
  }
  return { state: 'off-track', ...base };
}

export function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const xm = xs.reduce((s, x) => s + x, 0) / n, ym = ys.reduce((s, y) => s + y, 0) / n; let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xm) * (ys[i] - ym); dx += (xs[i] - xm) ** 2; dy += (ys[i] - ym) ** 2; }
  const den = Math.sqrt(dx * dy); return den === 0 ? null : num / den;
}
export const moodToScore = mood => { const i = MOODS.findIndex(m => m.id === mood); return i === -1 ? null : MOODS.length - i; };   // great = 5 ... bad = 1
export function correlation(days, aId, bId, { aMood = false, bMood = false } = {}) {
  const xs = [], ys = [];
  days.forEach(e => { const a = aMood ? moodToScore(e.data[aId]) : (e.data[aId] || null), b = bMood ? moodToScore(e.data[bId]) : (e.data[bId] || null); if (a != null && a > 0 && b != null && b > 0) { xs.push(a); ys.push(b); } });
  const r = pearson(xs, ys); if (r == null) return { r: null, n: xs.length };
  const ar = Math.abs(r); return { r, n: xs.length, strength: ar >= 0.5 ? 'strong' : ar >= 0.25 ? 'moderate' : 'weak', direction: r > 0 ? 'positive' : 'negative', pct: Math.round(ar * 100) };
}
