// CSV of every entry (one row per entry). Pure: no DOM, no storage. Opens cleanly in Excel (BOM added by the caller).
import { reconcile } from '../domain/reconcile.js';
const FORMULA_RE = /^[=+\-@\t\r]/;
const q = (v, text = true) => {                              // text=false for the numeric Amount column: a negative adjustment must stay a number
  let s = String(v ?? '');
  if (text && FORMULA_RE.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function entriesToCsv({ days, expense, income, accounts, catIds, defaultAcct, now }) {
  const label = new Map([...expense.map(f => [f.id, ['Expense', f.label]]), ...income.map(f => [f.id, ['Income', f.label]])]);
  const acct = new Map(accounts.map(a => [a.id, a.label]));
  const rows = [['Date', 'Type', 'Category', 'Amount', 'Account', 'Note']];
  for (const { y, m, d, doc } of days) {
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    for (const e of reconcile(doc, catIds, { catIds, defaultAcct, now }).doc.entries || []) {
      if (!label.has(e.cat)) continue;                  // same rule as reports, balances and Insights: a category that is no longer in the list does not count (Restore it in Categories to bring it back)
      const [type, cat] = label.get(e.cat);
      rows.push([date, type, cat, e.amt, acct.get(e.acct) ?? acct.get(defaultAcct) ?? (e.acct || ''), e.note || '']);
    }
  }
  return rows.map((r, i) => r.map((v, c) => q(v, !(i > 0 && c === 3))).join(',')).join('\r\n');   // c === 3 is Amount
}
