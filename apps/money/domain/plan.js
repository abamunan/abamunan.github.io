// Plan-tab operations on budgets, goal, accounts, ledger and debts. Pure: each takes the current arrays and returns new ones
// (or throws Error with a message fit for a toast). Shapes are identical to the legacy app (mt.js), so old and new stay compatible.
import { round2 } from '../../shared/fmt.js';
import { newId } from '../../shared/dom.js';

const money = v => round2(Math.max(0, Number(v) || 0));
const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
export const linkedDebtCount = (debts, id) => debts.filter(d => d.accountId === id && !d.settled).length;
// Debts keep existing but are unlinked from the deleted account (legacy behaviour).
export function deleteAccount(accounts, debts, id) {
  need(accounts.some(a => a.id === id), 'Account not found'); need(accounts.length > 1, 'At least one account is required');
  return { accounts: accounts.filter(a => a.id !== id), debts: debts.map(d => (d.accountId === id ? { ...d, accountId: null } : d)), unlinked: linkedDebtCount(debts, id) };
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
