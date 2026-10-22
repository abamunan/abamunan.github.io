#!/usr/bin/env node
// Dry-run of the migration on a COPY of your data. Reads a JSON backup, writes nothing.
//   node apps/money/tools/check-backup.mjs my-backup.json
import { readFileSync } from 'node:fs';
import { parseBackup } from '../data/backup.js';
import { reconcile } from '../domain/reconcile.js';
import { accountBalances } from '../domain/totals.js';
import { legacyBalances } from '../tests/oracle.js';
import { DEFAULT_EXPENSE_FIELDS, DEFAULT_INCOME_FIELDS, DEFAULT_ACCOUNTS } from '../data/defaults.js';

const file = process.argv[2]; if (!file) { console.error('usage: node check-backup.mjs <backup.json>'); process.exit(2); }
const p = parseBackup(readFileSync(file, 'utf8')); if (!p.ok) { console.error('FAIL:', p.error); process.exit(2); }
const { payload } = p, c = payload.categories || {};
const exp = (c.expense?.length ? c.expense : DEFAULT_EXPENSE_FIELDS).map(f => f.id), inc = (c.income?.length ? c.income : DEFAULT_INCOME_FIELDS).map(f => f.id);
const accounts = payload.accounts?.length ? payload.accounts : DEFAULT_ACCOUNTS, ids = [...exp, ...inc];
const def = accounts.some(a => a.id === 'cash') ? 'cash' : accounts[0]?.id;
const r2 = n => Math.round(n * 100) / 100; const problems = []; let adjDays = 0, adjCount = 0, flatSum = 0, entSum = 0, unknownCats = 0;
const docs = Object.entries(payload.days);
for (const [k, doc] of docs) {
  const r = reconcile(doc, ids, { defaultAcct: def, now: 0 }); const again = reconcile(r.doc, ids, { defaultAcct: def, now: 0 });
  if (again.changed) problems.push(`${k}: reconcile is not idempotent`);
  for (const id of ids) { if (r2(r.doc[id] || 0) !== r2(doc[id] || 0)) problems.push(`${k}: flat total of "${id}" changed`);
    const s = r2((r.doc.entries || []).filter(e => e.cat === id).reduce((a, e) => a + e.amt, 0)); if (s !== r2(doc[id] || 0)) problems.push(`${k}: entries(${s}) != flat(${doc[id] || 0}) for "${id}"`); flatSum += doc[id] || 0; entSum += s; }
  if (r.adjusted.length) { adjDays++; adjCount += r.adjusted.length; }
  for (const key of Object.keys(doc)) if (!ids.includes(key) && !/^(note_|acct_|ts_|shown_)/.test(key) && !['locked', 'entries'].includes(key)) unknownCats++;
}
const days = docs.map(([, d]) => d), args = { accounts, ledger: payload.ledger || [], debts: payload.debts || [], expIds: exp, incIds: inc };
const a = accountBalances({ ...args, days, defaultAcct: def }), b = legacyBalances({ ...args, days });
for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[id] || 0) !== (b[id] || 0)) problems.push(`account "${id}": new ${a[id]} vs legacy ${b[id]}`);
console.log(`days in backup:        ${docs.length}\ndays needing migration: ${adjDays} (${adjCount} legacy-adjustment entries)\nflat total ${r2(flatSum)} = entries total ${r2(entSum)}\nunknown fields kept untouched in ${unknownCats} day(s)\naccount balances (new vs legacy): ${Object.entries(a).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (problems.length) { console.log('\nMISMATCH:'); problems.slice(0, 30).forEach(x => console.log(' -', x)); process.exit(1); }
console.log('\nOK: no data would be lost or changed by the migration.');
