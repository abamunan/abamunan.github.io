// Screen data, computed from the repo. Views render these and never touch storage.
import { reconcile } from './reconcile.js';
import { dayTotals, monthTotals, accountBalances, budgetRows, goalProgress } from './totals.js';
import { debtTotals, sortDebts } from './plan.js';
import { buildInsights, categoryDrill } from './insights.js';
import { searchEntries, collectTags } from './search.js';
import { isDayLocked } from '../../shared/lock.js';
import { round2 } from '../../shared/fmt.js';

const catMap = repo => { const m = new Map(); repo.settings.expense.forEach(f => m.set(f.id, { ...f, kind: 'out' })); repo.settings.income.forEach(f => m.set(f.id, { ...f, kind: 'in' })); return m; };
const acctMap = repo => new Map(repo.settings.accounts.map(a => [a.id, a]));

export function entryRows(repo, doc, cats = catMap(repo), accts = acctMap(repo)) {
  const ctx = { defaultAcct: repo.defaultAcct(), now: 0 };
  return (reconcile(doc, repo.catIds(), ctx).doc.entries || []).filter(e => cats.has(e.cat)).map(e => {
    const c = cats.get(e.cat), a = accts.get(e.acct) || accts.get(ctx.defaultAcct);
    return { id: e.id, cat: e.cat, label: c.label, icon: c.icon, kind: c.kind, amt: e.amt, signed: c.kind === 'in' ? e.amt : -e.amt, acct: a?.id ?? null, acctLabel: a?.label ?? '', note: e.note || '', adj: !!e.adj, ts: e.ts || 0 };
  }).sort((x, y) => y.ts - x.ts);
}
const ids = repo => ({ exp: repo.settings.expense.map(f => f.id), inc: repo.settings.income.map(f => f.id) });

export function todayModel(repo, today = new Date()) {
  const { exp, inc } = ids(repo), y = today.getFullYear(), m0 = today.getMonth(), d = today.getDate();
  const days = repo.listDays(), docs = days.map(x => x.doc);
  const bal = accountBalances({ accounts: repo.settings.accounts, days: docs, ledger: repo.settings.ledger, debts: repo.settings.debts, expIds: exp, incIds: inc, defaultAcct: repo.defaultAcct() });
  const byDay = new Map(days.map(x => [x.key, x.doc])); const get = (yy, mm, dd) => byDay.get(`mt_${yy}_${mm + 1}_${dd}`) || {};
  const month = monthTotals(get, y, m0, exp, inc);
  const rows = budgetRows({ expenseCats: repo.settings.expense, catTotals: month.catTotals, y, m0, today });
  const doc = get(y, m0, d);
  return { net: round2(repo.settings.accounts.reduce((s, a) => s + (bal[a.id] || 0), 0)), accounts: repo.settings.accounts.map(a => ({ id: a.id, label: a.label, icon: a.icon, balance: bal[a.id] || 0 })),
    budgets: rows, worstBudget: [...rows].sort((a, b) => b.used / b.budget - a.used / a.budget)[0] || null /* uncapped ratio: pct stops at 100, so two over-budget rows would tie */, month, today: { ...dayTotals(doc, exp, inc), locked: isDayLocked(y, m0, d, doc, today), entries: entryRows(repo, doc) } };
}

// filter: {kind:'all'|'in'|'out', cat:string|null}
export function monthModel(repo, y, m0, filter = {}, today = new Date()) {
  const { exp, inc } = ids(repo), cats = catMap(repo), accts = acctMap(repo), all = repo.listDays().filter(x => x.y === y && x.m === m0);
  const byDay = new Map(all.map(x => [x.d, x.doc])); const totals = monthTotals((yy, mm, dd) => byDay.get(dd) || {}, y, m0, exp, inc);
  const days = all.map(x => {
    const entries = entryRows(repo, x.doc, cats, accts).filter(e => (!filter.kind || filter.kind === 'all' || e.kind === filter.kind) && (!filter.cat || e.cat === filter.cat));
    return { d: x.d, y, m0, locked: isDayLocked(y, m0, x.d, x.doc, today), totals: dayTotals(x.doc, exp, inc), entries };
  }).filter(g => g.entries.length).sort((a, b) => b.d - a.d);
  return { totals, days };
}
export function yearModel(repo, y) {
  const { exp, inc } = ids(repo), all = repo.listDays().filter(x => x.y === y);
  return { months: Array.from({ length: 12 }, (_, m0) => { const byDay = new Map(all.filter(x => x.m === m0).map(x => [x.d, x.doc]));
    const t = monthTotals((yy, mm, dd) => byDay.get(dd) || {}, y, m0, exp, inc); return { m0, days: byDay.size, exp: t.totalExp, inc: t.totalInc, net: t.net }; }) };
}

// Plan tab: goal, budgets for the current month, accounts with balances, debts. Listed accounts only (like legacy Total Balance).
export function planModel(repo, today = new Date()) {
  const { exp, inc } = ids(repo), y = today.getFullYear(), m0 = today.getMonth(), st = repo.settings;
  const days = repo.listDays(), byDay = new Map(days.map(x => [x.key, x.doc])), get = (yy, mm, dd) => byDay.get(`mt_${yy}_${mm + 1}_${dd}`) || {};
  const bal = accountBalances({ accounts: st.accounts, days: days.map(x => x.doc), ledger: st.ledger, debts: st.debts, expIds: exp, incIds: inc, defaultAcct: repo.defaultAcct() });
  const month = monthTotals(get, y, m0, exp, inc);
  const budgets = budgetRows({ expenseCats: st.expense, catTotals: month.catTotals, y, m0, today });
  const accounts = st.accounts.map(a => ({ id: a.id, label: a.label, icon: a.icon, opening: a.opening || 0, balance: bal[a.id] || 0 }));
  const accts = new Map(st.accounts.map(a => [a.id, a])), row = d => ({ ...d, acctLabel: accts.get(d.accountId)?.label || '', acctIcon: accts.get(d.accountId)?.icon || '' });
  const sorted = sortDebts(st.debts).map(row);
  return { y, m0, goal: goalProgress({ expenseCats: st.expense, catTotals: month.catTotals, goal: st.goal, y, m0, today }),
    budgets, budgetUsed: round2(budgets.reduce((t, b) => t + b.used, 0)), budgetTotal: round2(budgets.reduce((t, b) => t + b.budget, 0)),
    expenseCats: st.expense.filter(f => !f.archived || f.budget > 0).map(f => ({ id: f.id, label: f.label, icon: f.icon, budget: f.budget || 0 })),
    accounts, total: round2(accounts.reduce((t, a) => t + a.balance, 0)),
    debts: { ...debtTotals(st.debts), borrowed: sorted.filter(d => d.type === 'borrowed'), lent: sorted.filter(d => d.type === 'lent') } };
}

// Insights tab: one month of summary, per-day spending, categories, 6-month trend and biggest expenses.
export function insightsModel(repo, y, m0, today = new Date()) {
  const cats = catMap(repo), accts = acctMap(repo);
  return buildInsights({ days: repo.listDays(), expense: repo.settings.expense, income: repo.settings.income, y, m0, today, entriesOf: doc => entryRows(repo, doc, cats, accts) });
}
export function categoryDrillModel(repo, y, m0, catId) {
  const cats = catMap(repo), accts = acctMap(repo);
  return categoryDrill({ days: repo.listDays(), y, m0, catId, entriesOf: doc => entryRows(repo, doc, cats, accts) });
}

// History > Search: groups look like monthModel's days so the same row/edit/delete code works.
export function searchModel(repo, query, kind = 'all', today = new Date(), limit = 100) {
  const { exp, inc } = ids(repo), cats = catMap(repo), accts = acctMap(repo);
  const r = searchEntries({ days: repo.listDays(), query, kind, limit, entriesOf: doc => entryRows(repo, doc, cats, accts) });
  return { ...r, groups: r.groups.map(g => ({ y: g.y, m0: g.m0, d: g.d, locked: isDayLocked(g.y, g.m0, g.d, g.doc, today), totals: dayTotals(g.doc, exp, inc), entries: g.entries })) };
}

export function searchTagsModel(repo) {
  const cats = catMap(repo), accts = acctMap(repo);
  return collectTags(repo.listDays(), doc => entryRows(repo, doc, cats, accts));
}

export function accountModel(repo, accountId, sort = 'newest') {
  const { exp, inc } = ids(repo), cats = catMap(repo), accts = acctMap(repo);
  const account = repo.settings.accounts.find(a => a.id === accountId) || repo.settings.accounts[0];
  if (!account) return { account: null, accounts: [], entries: [], income: 0, expense: 0, balance: 0 };
  const days = repo.listDays(), balances = accountBalances({
    accounts: repo.settings.accounts, days: days.map(x => x.doc), ledger: repo.settings.ledger, debts: repo.settings.debts,
    expIds: exp, incIds: inc, defaultAcct: repo.defaultAcct()
  });
  const entries = [];
  for (const day of days) {
    for (const entry of entryRows(repo, day.doc, cats, accts)) {
      if (entry.acct !== account.id) continue;
      entries.push({ ...entry, y: day.y, m0: day.m, d: day.d, locked: isDayLocked(day.y, day.m, day.d, day.doc) });
    }
  }
  // Money that moved without being a day entry: Add money, transfers and unsettled debts. They change the balance, so they must be in the
  // history and in Money in / Money out, otherwise opening + in - out would not add up to the balance.
  const dateOf = v => { const d = typeof v === 'string' && v.length === 10 ? new Date(v + 'T00:00:00') : new Date(v); return Number.isNaN(d.getTime()) ? new Date(0) : d; };
  const nameOf = id => repo.settings.accounts.find(a => a.id === id)?.label || 'another account';
  const moves = [], move = (key, kind, icon, label, amt, when, note = '') => {
    const d = dateOf(when); moves.push({ id: 'mv_' + key, move: true, kind, icon, label, amt, signed: kind === 'in' ? amt : -amt, acctLabel: account.label, note, y: d.getFullYear(), m0: d.getMonth(), d: d.getDate(), ts: d.getTime() });
  };
  (repo.settings.ledger || []).forEach((ev, i) => {
    if (ev.type === 'add' && ev.accountId === account.id) move('a' + i, 'in', '\uFF0B', 'Money added', ev.amount, ev.ts, ev.note || '');
    else if (ev.type === 'transfer') {
      if (ev.fromId === account.id) move('o' + i, 'out', '\u2194', `Transfer to ${nameOf(ev.toId)}`, ev.amount, ev.ts, ev.note || '');
      if (ev.toId === account.id) move('i' + i, 'in', '\u2194', `Transfer from ${nameOf(ev.fromId)}`, ev.amount, ev.ts, ev.note || '');
    }
  });
  (repo.settings.debts || []).forEach((x, i) => {
    if (x.settled || x.accountId !== account.id || (x.type !== 'lent' && x.type !== 'borrowed')) return;
    move('d' + i, x.type === 'lent' ? 'out' : 'in', '\u{1F91D}', x.type === 'lent' ? `Lent to ${x.person}` : `Borrowed from ${x.person}`, x.amount, x.date, x.note || '');
  });
  const rows = [...entries, ...moves];
  rows.sort((a, b) => sort === 'oldest'
    ? a.y - b.y || a.m0 - b.m0 || a.d - b.d || a.ts - b.ts
    : sort === 'amount-high'
      ? Math.abs(b.signed) - Math.abs(a.signed) || b.ts - a.ts
      : sort === 'amount-low'
        ? Math.abs(a.signed) - Math.abs(b.signed) || b.ts - a.ts
        : b.y - a.y || b.m0 - a.m0 || b.d - a.d || b.ts - a.ts);
  return {
    account,
    accounts: repo.settings.accounts.map(a => ({ ...a, balance: balances[a.id] || 0 })),
    entries,                                                          // day entries only (editable)
    moves,                                                            // Add money / transfers / unsettled debts (read-only)
    rows,                                                             // both, sorted: what the history list shows
    opening: round2(account.opening || 0),
    income: round2(rows.filter(e => e.kind === 'in').reduce((sum, e) => sum + e.amt, 0)),
    expense: round2(rows.filter(e => e.kind === 'out').reduce((sum, e) => sum + e.amt, 0)),   // opening + income - expense = balance
    balance: balances[account.id] || 0,
    total: round2(repo.settings.accounts.reduce((sum, a) => sum + (balances[a.id] || 0), 0))
  };
}
