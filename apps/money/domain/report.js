// Month / year report: pure numbers for the Excel and PDF exports. Reads the flat day fields (the source of truth, same as
// Today/History/Insights), so a report always equals what the app shows. Deleted categories are not in the lists, so they do not count.
import { round2 } from '../../shared/fmt.js';
import { monthTotals } from './totals.js';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTH_NAMES.map(m => m.slice(0, 3));

// getDoc(y, m0, d) → day doc. m0 = null → whole year (one row per month), otherwise one month (one row per day with activity).
export function buildReport({ getDoc, expense, income, y, m0 = null }) {
  const expIds = expense.map(f => f.id), incIds = income.map(f => f.id), ids = [...expIds, ...incIds];
  const sums = Object.fromEntries(ids.map(id => [id, 0])), rows = [], values = [];
  for (const mm of (m0 == null ? [...Array(12).keys()] : [m0])) {
    const t = monthTotals(getDoc, y, mm, expIds, incIds);
    ids.forEach(id => { sums[id] += t.catTotals[id]; });
    if (m0 == null) { rows.push({ label: MON[mm], exp: t.totalExp, inc: t.totalInc, net: t.net }); values.push(t.catTotals); }
    else for (const d of t.daily) { rows.push({ label: `Day ${d.day}`, exp: d.exp, inc: d.inc, net: d.net }); values.push(Object.fromEntries(ids.map(id => [id, Number(d.doc[id]) || 0]))); }
  }
  const used = list => list.filter(f => round2(sums[f.id]) !== 0);
  const ue = used(expense), ui = used(income);
  const categories = [...ue.map(f => ({ id: f.id, label: f.label, icon: f.icon || '', type: 'Expense', amount: round2(sums[f.id]) })), ...ui.map(f => ({ id: f.id, label: f.label, icon: f.icon || '', type: 'Income', amount: round2(sums[f.id]) }))];
  const exp = round2(rows.reduce((s, r) => s + r.exp, 0)), inc = round2(rows.reduce((s, r) => s + r.inc, 0));
  const first = m0 == null ? 'Month' : 'Day';
  const detail = { head: [first, ...ue.map(f => f.label), 'Total Exp', ...ui.map(f => f.label), 'Total Inc', 'Net'],
    rows: rows.map((r, i) => [r.label, ...ue.map(f => round2(values[i][f.id])), r.exp, ...ui.map(f => round2(values[i][f.id])), r.inc, r.net]) };
  return { period: m0 == null ? 'year' : 'month', y, m0, title: m0 == null ? String(y) : `${MONTH_NAMES[m0]} ${y}`, totals: { exp, inc, net: round2(inc - exp) },
    categories, rowsTitle: m0 == null ? 'Month by month' : 'Day by day', rows, detail, hasData: categories.length > 0 };
}
