// Insights calculations (pure, no DOM, no storage). Fed by view-models; tested in tests/run.mjs.
// Totals come from the flat per-category fields (the source of truth, same as the rest of the app); entries are only used for "biggest" and drill-down lists.
import { round2 } from '../../shared/fmt.js';
import { monthTotals, dayTotals, daysInMonth, elapsedDays } from './totals.js';

export const shiftMonth = (y, m0, n) => { const t = y * 12 + m0 + n; return { y: Math.floor(t / 12), m0: ((t % 12) + 12) % 12 }; };
const isSameMonth = (y, m0, today) => y === today.getFullYear() && m0 === today.getMonth();
const dayMap = days => new Map(days.map(x => [`${x.y}-${x.m}-${x.d}`, x.doc]));

// days: [{y, m (0-based), d, doc}], expense/income: category lists, entriesOf(doc) → rows {cat,label,icon,kind,amt,note,acctLabel}
export function buildInsights({ days, expense, income, y, m0, today = new Date(), entriesOf = () => [], trendMonths = 6, biggestCount = 5 }) {
  const expIds = expense.map(f => f.id), incIds = income.map(f => f.id), byDay = dayMap(days);
  const get = (yy, mm, dd) => byDay.get(`${yy}-${mm}-${dd}`) || {}, stat = (yy, mm) => monthTotals(get, yy, mm, expIds, incIds);
  const cur = stat(y, m0), pm = shiftMonth(y, m0, -1), prev = stat(pm.y, pm.m0), dim = daysInMonth(y, m0), el = elapsedDays(y, m0, today);

  const daily = Array.from({ length: dim }, (_, i) => dayTotals(get(y, m0, i + 1), expIds, incIds).exp);
  const spendDays = daily.filter(v => v > 0).length, avgPerDay = el > 0 ? round2(cur.totalExp / el) : 0;
  const noSpendDays = daily.slice(0, el).filter(v => v === 0).length;
  const maxExp = Math.max(0, ...daily), top = maxExp > 0 ? { day: daily.indexOf(maxExp) + 1, amt: maxExp } : null;
  const forecast = isSameMonth(y, m0, today) && el >= 3 && cur.totalExp > 0 ? round2(cur.totalExp / el * dim) : null;

  const categories = expense.map(f => ({ id: f.id, label: f.label, icon: f.icon, total: round2(cur.catTotals[f.id] || 0), prev: round2(prev.catTotals[f.id] || 0) }))
    .filter(c => c.total > 0).sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, share: cur.totalExp > 0 ? c.total / cur.totalExp * 100 : 0, delta: round2(c.total - c.prev) }));

  const trend = Array.from({ length: trendMonths }, (_, i) => { const s = shiftMonth(y, m0, i - trendMonths + 1), t = stat(s.y, s.m0); return { y: s.y, m0: s.m0, inc: t.totalInc, exp: t.totalExp, net: t.net }; });

  const biggest = [];
  for (let d = 1; d <= dim; d++) { const doc = byDay.get(`${y}-${m0}-${d}`); if (!doc) continue;
    for (const e of entriesOf(doc)) if (e.kind === 'out' && e.amt > 0) biggest.push({ d, label: e.label, icon: e.icon, note: e.note || '', amt: e.amt }); }
  biggest.sort((a, b) => b.amt - a.amt || b.d - a.d);

  const hasPrev = prev.totalExp > 0 || prev.totalInc > 0, dExp = round2(cur.totalExp - prev.totalExp);
  return { y, m0, dim, elapsed: el, hasData: cur.totalExp > 0 || cur.totalInc > 0,
    inc: cur.totalInc, exp: cur.totalExp, net: cur.net, savingsRate: cur.totalInc > 0 ? cur.net / cur.totalInc : null,
    prev: { y: pm.y, m0: pm.m0, exp: prev.totalExp, inc: prev.totalInc, has: hasPrev },
    vsPrev: hasPrev ? { exp: dExp, pct: prev.totalExp > 0 ? dExp / prev.totalExp * 100 : null } : null,
    daily, spendDays, avgPerDay, noSpendDays, top, forecast, categories, trend, biggest: biggest.slice(0, biggestCount) };
}

// One expense category in one month: total, per-day amounts, and the entries behind them (largest first).
export function categoryDrill({ days, y, m0, catId, entriesOf = () => [] }) {
  const dim = daysInMonth(y, m0), byDay = dayMap(days), daily = Array.from({ length: dim }, (_, i) => Number(byDay.get(`${y}-${m0}-${i + 1}`)?.[catId]) || 0), entries = [];
  for (let d = 1; d <= dim; d++) { const doc = byDay.get(`${y}-${m0}-${d}`); if (!doc) continue;
    for (const e of entriesOf(doc)) if (e.cat === catId && e.amt > 0) entries.push({ d, note: e.note || '', amt: e.amt, acctLabel: e.acctLabel || '' }); }
  entries.sort((a, b) => b.d - a.d || b.amt - a.amt);
  const total = round2(daily.reduce((s, v) => s + v, 0));
  return { total, daily, entries, count: entries.length, activeDays: daily.filter(v => v > 0).length };
}
