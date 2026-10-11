// CSV of every entry (one row per entry). Pure: no DOM, no storage. Opens cleanly in Excel (BOM added by the caller).
import { reconcile } from '../domain/reconcile.js';
const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function entriesToCsv({ days, expense, income, accounts, catIds, defaultAcct, now }) {
  const label = new Map([...expense.map(f => [f.id, ['Expense', f.label]]), ...income.map(f => [f.id, ['Income', f.label]])]);
  const acct = new Map(accounts.map(a => [a.id, a.label]));
  const rows = [['Date', 'Type', 'Category', 'Amount', 'Account', 'Note']];
  for (const { y, m, d, doc } of days) {
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    for (const e of reconcile(doc, catIds, { catIds, defaultAcct, now }).doc.entries || []) {
      const [type, cat] = label.get(e.cat) || ['', e.cat];
      rows.push([date, type, cat, e.amt, acct.get(e.acct) || e.acct || '', e.note || '']);
    }
  }
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
