// Pure calculations ported from legacy mt.js (calcMonth, computeAccountBalances, renderBudgets).
import { round2 } from '../../shared/fmt.js';
import { reconcile } from './reconcile.js';
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m0) => m0 === 1 && isLeap(y) ? 29 : DIM[m0];

export function dayTotals(doc, expIds, incIds) {                       // flat fields = source of truth
  const sum = ids => ids.reduce((s, id) => s + (Number(doc?.[id]) || 0), 0);
  const exp = round2(sum(expIds)), inc = round2(sum(incIds));
  return { exp, inc, net: round2(inc - exp) };
}
export function monthTotals(getDoc, y, m0, expIds, incIds, upToDay = 99) {
  let totalExp = 0, totalInc = 0; const catTotals = {}, daily = [];
  [...expIds, ...incIds].forEach(id => { catTotals[id] = 0; });
  for (let d = 1; d <= Math.min(upToDay, daysInMonth(y, m0)); d++) {
    const doc = getDoc(y, m0, d), t = dayTotals(doc, expIds, incIds);
    totalExp += t.exp; totalInc += t.inc;
    [...expIds, ...incIds].forEach(id => { catTotals[id] += Number(doc?.[id]) || 0; });
    if (t.exp > 0 || t.inc > 0) daily.push({ day: d, ...t, doc });
  }
  return { totalExp: round2(totalExp), totalInc: round2(totalInc), net: round2(totalInc - totalExp), catTotals, daily };
}
// opening + income entries − expense entries ± ledger ± unsettled debts. Uses entries (per-entry account).
export function accountBalances({ accounts, days, ledger = [], debts = [], expIds, incIds, defaultAcct }) {
  const bal = {}; accounts.forEach(a => { bal[a.id] = a.opening || 0; });
  const ids = [...expIds, ...incIds];
  for (const src of days) {
    for (const e of reconcile(src, ids, { defaultAcct }).doc.entries || []) {
      const a = e.acct || defaultAcct; if (a == null) continue;
      bal[a] = (bal[a] || 0) + (incIds.includes(e.cat) ? e.amt : expIds.includes(e.cat) ? -e.amt : 0);
    }
  }
  for (const ev of ledger) {
    if (ev.type === 'add') bal[ev.accountId] = (bal[ev.accountId] || 0) + ev.amount;
    else if (ev.type === 'transfer') { bal[ev.fromId] = (bal[ev.fromId] || 0) - ev.amount; bal[ev.toId] = (bal[ev.toId] || 0) + ev.amount; }
  }
  for (const d of debts) {
    if (d.settled || !d.accountId) continue;
    bal[d.accountId] = (bal[d.accountId] || 0) + (d.type === 'lent' ? -d.amount : d.type === 'borrowed' ? d.amount : 0);
  }
  for (const k in bal) bal[k] = round2(bal[k]);
  return bal;
}
export function elapsedDays(y, m0, today = new Date()) {
  if (y === today.getFullYear() && m0 === today.getMonth()) return today.getDate();
  return new Date(y, m0, 1) < new Date(today.getFullYear(), today.getMonth(), 1) ? daysInMonth(y, m0) : 0;
}
export function budgetRows({ expenseCats, catTotals, y, m0, today = new Date() }) {
  const el = elapsedDays(y, m0, today), total = daysInMonth(y, m0);
  return expenseCats.filter(f => f.budget > 0).map(f => {
    const used = catTotals[f.id] || 0, pct = Math.min(100, used / f.budget * 100), over = used > f.budget;
    const expected = el > 0 ? f.budget / total * el : 0;
    return { id: f.id, label: f.label, icon: f.icon, used, budget: f.budget, pct, state: over ? 'over' : pct >= 80 ? 'warn' : 'ok', onPace: el <= 0 || used <= expected, expected };
  });
}
// Projected month-end savings, pace-based (ported from legacy renderSavingsGoalCard): for every budgeted category take
// (budget prorated to elapsed days − actual so far), sum it, average per elapsed day, project over the whole month.
export function goalProgress({ expenseCats, catTotals, goal, y, m0, today = new Date() }) {
  const target = Number(goal) > 0 ? Number(goal) : 0, el = elapsedDays(y, m0, today), total = daysInMonth(y, m0);
  let saved = 0;
  if (el > 0) {
    const diff = expenseCats.filter(f => f.budget > 0).reduce((s, f) => s + ((f.budget / total) * el - (catTotals[f.id] || 0)), 0);
    saved = (diff / el) * total;
  }
  saved = round2(saved);
  return { target, saved, hasGoal: target > 0, pct: target > 0 ? Math.max(0, Math.min(100, (saved / target) * 100)) : 0 };
}
