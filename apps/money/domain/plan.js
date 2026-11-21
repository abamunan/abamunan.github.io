// Plan-tab operations on budgets, goal, accounts, ledger and debts. Pure: each takes the current arrays and returns new ones
// (or throws Error with a message fit for a toast). Shapes are identical to the legacy app (mt.js), so old and new stay compatible.
import { round2, isoLocal } from '../../shared/fmt.js';
import { newId } from '../../shared/dom.js';

const money = v => round2(Math.max(0, Number(v) || 0));
const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const isoDay = isoLocal;
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const validIso = v => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const [y, m, d] = v.split('-').map(Number), t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };

// ── budgets + goal ──
export function setBudgets(expense, changes) {                       // changes = { categoryId: amount }  (0 clears a budget)
  for (const id of Object.keys(changes)) need(expense.some(f => f.id === id), 'Unknown category');
  return expense.map(f => (f.id in changes ? { ...f, budget: money(changes[f.id]) } : f));
}
export const normGoal = v => money(v);

// ── accounts ──
export function addAccount(accounts, { label, icon } = {}, id = newId('a')) {
  label = String(label ?? '').trim(); need(label, 'Enter an account name');
  need(!accounts.some(a => sameName(a.label, label)), `You already have an account called "${label}"`);
  return [...accounts, { id, label, icon: String(icon ?? '').trim() || '\u{1F4B0}', opening: 0 }];
}
export function updateAccount(accounts, id, patch) {
  const a = accounts.find(x => x.id === id); need(a, 'Account not found');
  const next = { ...a };
  if (patch.label !== undefined) { const v = String(patch.label).trim(); need(v, 'Enter an account name'); need(!accounts.some(x => x.id !== id && sameName(x.label, v)), `You already have an account called "${v}"`); next.label = v; }
  if (patch.icon !== undefined) next.icon = String(patch.icon).trim() || a.icon;
  if (patch.opening !== undefined) next.opening = round2(Number(patch.opening) || 0);      // opening may be negative (overdraft)
  return accounts.map(x => (x.id === id ? next : x));
}
export function setAccountArchived(accounts, id, archived) {
  const a = accounts.find(x => x.id === id); need(a, 'Account not found');
  need(!archived || accounts.some(x => x.id !== id && !x.archived), 'At least one active account is required');
  return accounts.map(x => (x.id === id ? { ...x, archived: !!archived } : x));
}
export const linkedDebtCount = (debts, id) => debts.filter(d => d.accountId === id && !d.settled).length;
// Deleting an account never loses money. Its debts and ledger events (Add money / Transfer) move to `moveTo`, and its
// opening balance is added to moveTo's opening balance, so the total stays exactly the same. A transfer between the
// deleted account and moveTo would become moveTo -> moveTo (no effect on any balance), so it is dropped.
// Day entries are moved separately with moveDayAccount(). Returns new arrays; the inputs are not touched.
const LEDGER_ACCT_KEYS = ['accountId', 'fromId', 'toId'];
export function deleteAccount(accounts, debts, id, moveTo, ledger = []) {
  const gone = accounts.find(a => a.id === id);
  need(gone, 'Account not found'); need(accounts.length > 1, 'At least one account is required');
  need(moveTo && moveTo !== id && accounts.some(a => a.id === moveTo), 'Pick another account to move its history to');
  need(accounts.some(a => a.id === moveTo && !a.archived), 'Pick an active (not archived) account to move its history to, so at least one active account is always left');
  const moved = { debts: 0, ledger: 0, dropped: 0 }, nextLedger = [];
  for (const ev of ledger) {
    if (!LEDGER_ACCT_KEYS.some(k => ev[k] === id)) { nextLedger.push(ev); continue; }
    const n = { ...ev }; LEDGER_ACCT_KEYS.forEach(k => { if (n[k] === id) n[k] = moveTo; });
    if (n.type === 'transfer' && n.fromId === n.toId) { moved.dropped++; continue; }
    moved.ledger++; nextLedger.push(n);
  }
  return {
    accounts: accounts.filter(a => a.id !== id).map(a => (a.id === moveTo ? { ...a, opening: round2((a.opening || 0) + (gone.opening || 0)) } : a)),
    debts: debts.map(d => { if (d.accountId !== id) return d; moved.debts++; return { ...d, accountId: moveTo }; }),
    ledger: nextLedger, moved
  };
}
// One day document: every entry (and the legacy flat acct_<cat> field) that points at `id` now points at `moveTo`.
// Amounts, notes, dates and the day's locked flag are untouched.
export function moveDayAccount(doc, id, moveTo) {
  let entries = 0, flat = 0; const next = { ...doc };
  if (Array.isArray(doc.entries)) next.entries = doc.entries.map(e => (e && e.acct === id ? (entries++, { ...e, acct: moveTo }) : e));
  for (const k of Object.keys(doc)) if (k.startsWith('acct_') && doc[k] === id) { next[k] = moveTo; flat++; }
  return { doc: next, changed: entries + flat > 0, entries: Array.isArray(doc.entries) ? entries : flat };   // old-format day (no entries[]): one per category
}

// ── ledger (manual Add / Transfer events) ──
const lgEvent = (type, extra, { now = new Date(), id = newId('lg') } = {}) => ({ id, ts: now.toISOString(), type, ...extra });
export function addBalance(ledger, accounts, accountId, amount, o) {
  need(accounts.some(a => a.id === accountId), 'Account not found'); amount = round2(amount); need(amount > 0, 'Enter a valid amount');
  return [...ledger, lgEvent('add', { accountId, amount }, o)];
}
export function addTransfer(ledger, accounts, fromId, toId, amount, o) {
  need(accounts.some(a => a.id === fromId) && accounts.some(a => a.id === toId), 'Pick a destination account');
  need(fromId !== toId, 'Pick a different destination account'); amount = round2(amount); need(amount > 0, 'Enter a valid amount');
  return [...ledger, lgEvent('transfer', { fromId, toId, amount }, o)];
}

// A mistake in Add money / Transfer must be fixable. Only the amount can change; delete and add again to change accounts.
export function updateLedgerEvent(ledger, id, patch = {}) {
  const ev = ledger.find(x => x.id === id); need(ev, 'Entry not found');
  const amount = round2(patch.amount); need(amount > 0, 'Enter a valid amount');
  return ledger.map(x => (x.id === id ? { ...x, amount } : x));
}
export function removeLedgerEvent(ledger, id) { need(ledger.some(x => x.id === id), 'Entry not found'); return ledger.filter(x => x.id !== id); }

// ── debts: 'borrowed' = you owe them, 'lent' = they owe you ──
const payList = d => (Array.isArray(d?.payments) ? d.payments.filter(p => p && Number(p.amount) > 0) : []);
export const debtPaid = d => round2(payList(d).reduce((t, p) => t + Number(p.amount), 0));
export const debtRemaining = d => round2(Math.max(0, (d?.amount || 0) - debtPaid(d)));
// Money movements a debt causes in accounts: the loan itself plus every dated repayment. A settled debt with no recorded repayments (the
// old model) nets to zero. Used by balances AND by the account history so the two always agree.
export function debtEffects(d) {
  if (!d || (d.type !== 'lent' && d.type !== 'borrowed')) return [];
  const pays = payList(d), out = [];
  if (!pays.length && d.settled) return out;
  if (d.accountId) out.push({ accountId: d.accountId, delta: d.type === 'lent' ? -d.amount : d.amount, date: d.date, payment: false });
  for (const p of pays) { const a = p.accountId || d.accountId; if (a) out.push({ accountId: a, delta: d.type === 'lent' ? Number(p.amount) : -Number(p.amount), date: p.date || d.date, payment: true }); }
  return out;
}
export function addDebt(debts, accounts, { type, person, amount, date, accountId, note } = {}, { id = newId('dt'), today = new Date() } = {}) {
  need(type === 'borrowed' || type === 'lent', 'Pick borrowed or lent');
  person = String(person ?? '').trim(); need(person, 'Enter a name');
  need(accounts.some(a => a.id === accountId && !a.archived), 'Pick an active account');
  amount = round2(amount); need(amount > 0, 'Enter a valid amount');
  date = date || isoDay(today); need(validIso(date), 'Enter a valid date');
  const d = { id, type, person, amount, date, accountId, settled: false };
  const n = String(note ?? '').trim(); if (n) d.note = n;
  return [...debts, d];
}
export function updateDebt(debts, accounts, id, patch = {}) {
  const d = debts.find(x => x.id === id); need(d, 'Entry not found'); const next = { ...d };
  if (patch.person !== undefined) { const v = String(patch.person).trim(); need(v, 'Enter a name'); next.person = v; }
  if (patch.amount !== undefined) { const v = round2(patch.amount); need(v > 0, 'Enter a valid amount'); need(v >= debtPaid(d), `Amount cannot be below what is already paid (${debtPaid(d)})`); next.amount = v; }
  if (patch.date !== undefined) { need(validIso(patch.date), 'Enter a valid date'); next.date = patch.date; }
  if (patch.note !== undefined) { const n = String(patch.note).trim(); n ? (next.note = n) : delete next.note; }
  if (patch.accountId !== undefined && patch.accountId !== d.accountId) { need(!payList(d).length, 'The account cannot change after a repayment was recorded'); need(accounts.some(a => a.id === patch.accountId && !a.archived), 'Pick an active account'); next.accountId = patch.accountId; }
  return debts.map(x => (x.id === id ? next : x));
}
// Part (or full) repayment. The debt settles itself when nothing is left.
export function addDebtPayment(debts, accounts, id, { amount, date, accountId } = {}, { today = new Date(), payId = newId('dp') } = {}) {
  const d = debts.find(x => x.id === id); need(d, 'Entry not found'); need(!d.settled, 'This entry is already settled');
  amount = round2(amount); need(amount > 0, 'Enter a valid amount'); need(amount <= debtRemaining(d) + 0.0049, `Only ${debtRemaining(d)} is left to pay`);
  date = date || isoDay(today); need(validIso(date), 'Enter a valid date');
  const acc = accountId || d.accountId; need(accounts.some(a => a.id === acc), 'Account not found');
  const payments = [...payList(d), { id: payId, date, amount, accountId: acc }], done = round2(d.amount - payments.reduce((t, p) => t + p.amount, 0)) <= 0;
  return debts.map(x => (x.id === id ? { ...x, payments, settled: done, settledDate: done ? isoDay(today) : null } : x));
}
export function setDebtSettled(debts, id, settled, today = new Date()) {
  const d = debts.find(x => x.id === id); need(d, 'Entry not found');
  if (!settled) {                                       // reopen: drop automatic payments, and if nothing is left to pay, the last one
    let pays = payList(d).filter(p => !p.auto); if (pays.length && round2(d.amount - pays.reduce((t, p) => t + p.amount, 0)) <= 0) pays = pays.slice(0, -1);
    return debts.map(x => { if (x.id !== id) return x; const n = { ...x, settled: false, settledDate: null }; pays.length ? (n.payments = pays) : delete n.payments; return n; });
  }
  const left = debtRemaining(d), pays = payList(d);
  return debts.map(x => (x.id !== id ? x : { ...x, settled: true, settledDate: isoDay(today), ...(pays.length && left > 0 ? { payments: [...pays, { id: newId('dp'), date: isoDay(today), amount: left, accountId: d.accountId, auto: true }] } : {}) }));
}
export function removeDebt(debts, id) { need(debts.some(d => d.id === id), 'Entry not found'); return debts.filter(d => d.id !== id); }
export function debtTotals(debts) {
  let owe = 0, receive = 0;
  for (const d of debts) { if (d.settled) continue; const r = debtRemaining(d); if (d.type === 'borrowed') owe += r; else receive += r; }
  return { owe: round2(owe), receive: round2(receive) };
}
export const sortDebts = list => list.slice().sort((a, b) => (a.settled !== b.settled ? (a.settled ? 1 : -1) : (b.date || '').localeCompare(a.date || '')));   // unsettled first, newest first
