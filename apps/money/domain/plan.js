// Plan-tab operations on budgets, goal, accounts, ledger and debts. Pure: each takes the current arrays and returns new ones
// (or throws Error with a message fit for a toast). Shapes are identical to the legacy app (mt.js), so old and new stay compatible.
import { round2, isoLocal } from '../../shared/fmt.js';
import { newId } from '../../shared/dom.js';

const money = v => round2(Math.max(0, Number(v) || 0));
const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const isoDay = isoLocal;

// ── budgets + goal ──
export function setBudgets(expense, changes) {                       // changes = { categoryId: amount }  (0 clears a budget)
  for (const id of Object.keys(changes)) need(expense.some(f => f.id === id), 'Unknown category');
  return expense.map(f => (f.id in changes ? { ...f, budget: money(changes[f.id]) } : f));
}
export const normGoal = v => money(v);

// ── accounts ──
export function addAccount(accounts, { label, icon } = {}, id = newId('a')) {
  label = String(label ?? '').trim(); need(label, 'Enter an account name');
  return [...accounts, { id, label, icon: String(icon ?? '').trim() || '\u{1F4B0}', opening: 0 }];
}
export function updateAccount(accounts, id, patch) {
  const a = accounts.find(x => x.id === id); need(a, 'Account not found');
  const next = { ...a };
  if (patch.label !== undefined) { const v = String(patch.label).trim(); need(v, 'Enter an account name'); next.label = v; }
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

// ── debts: 'borrowed' = you owe them, 'lent' = they owe you ──
export function addDebt(debts, accounts, { type, person, amount, date, accountId, note } = {}, { id = newId('dt'), today = new Date() } = {}) {
  need(type === 'borrowed' || type === 'lent', 'Pick borrowed or lent');
  person = String(person ?? '').trim(); need(person, 'Enter a name');
  need(accounts.some(a => a.id === accountId), 'Pick an account');
  amount = round2(amount); need(amount > 0, 'Enter a valid amount');
  const d = { id, type, person, amount, date: date || isoDay(today), accountId, settled: false };
  const n = String(note ?? '').trim(); if (n) d.note = n;
  return [...debts, d];
}
export function setDebtSettled(debts, id, settled, today = new Date()) {
  need(debts.some(d => d.id === id), 'Entry not found');
  return debts.map(d => (d.id === id ? { ...d, settled: !!settled, settledDate: settled ? isoDay(today) : null } : d));
}
export function removeDebt(debts, id) { need(debts.some(d => d.id === id), 'Entry not found'); return debts.filter(d => d.id !== id); }
export function debtTotals(debts) {
  let owe = 0, receive = 0;
  for (const d of debts) { if (d.settled) continue; if (d.type === 'borrowed') owe += d.amount; else receive += d.amount; }
  return { owe: round2(owe), receive: round2(receive) };
}
export const sortDebts = list => list.slice().sort((a, b) => (a.settled !== b.settled ? (a.settled ? 1 : -1) : (b.date || '').localeCompare(a.date || '')));   // unsettled first, newest first
