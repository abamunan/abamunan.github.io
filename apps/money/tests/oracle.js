// Legacy algorithms ported from mt.js, used as the reference ("oracle") in tests and check-backup.
export function legacyBalances({ accounts, days, ledger = [], debts = [], expIds, incIds }) {
  const bal = {}; accounts.forEach(a => { bal[a.id] = a.opening || 0; });
  const def = accounts.some(a => a.id === 'cash') ? 'cash' : (accounts[0]?.id ?? null);
  days.forEach(data => {
    expIds.forEach(id => { const amt = data[id]; if (amt > 0) { const a = data['acct_' + id] || def; if (a != null) bal[a] = (bal[a] || 0) - amt; } });
    incIds.forEach(id => { const amt = data[id]; if (amt > 0) { const a = data['acct_' + id] || def; if (a != null) bal[a] = (bal[a] || 0) + amt; } });
  });
  ledger.forEach(ev => { if (ev.type === 'add') bal[ev.accountId] = (bal[ev.accountId] || 0) + ev.amount; else if (ev.type === 'transfer') { bal[ev.fromId] = (bal[ev.fromId] || 0) - ev.amount; bal[ev.toId] = (bal[ev.toId] || 0) + ev.amount; } });
  debts.forEach(d => { if (d.settled || !d.accountId) return; if (d.type === 'lent') bal[d.accountId] = (bal[d.accountId] || 0) - d.amount; else if (d.type === 'borrowed') bal[d.accountId] = (bal[d.accountId] || 0) + d.amount; });
  for (const k in bal) bal[k] = Math.round(bal[k] * 100) / 100;
  return bal;
}
// What the OLD app does when it saves a day: rebuilds the doc from known fields only (entries are dropped).
export function oldVersionSave(doc, edits, catIds) {
  const data = {};
  catIds.forEach(id => { const v = id in edits ? edits[id] : (doc[id] || 0); data[id] = v; if (v) data['ts_' + id] = doc['ts_' + id] || 1;
    if (doc['note_' + id]) data['note_' + id] = doc['note_' + id]; data['acct_' + id] = doc['acct_' + id] || 'cash'; });
  if (typeof doc.locked === 'boolean') data.locked = doc.locked;
  return data;
}
// Legacy "Savings Goal" projection, ported literally from renderSavingsGoalCard / getElapsedDaysInMonth in mt.js.
export function legacyGoalSaved({ expense, catTotals, y, m, today }) {
  const total = new Date(y, m + 1, 0).getDate(); let elapsed;
  if (y === today.getFullYear() && m === today.getMonth()) elapsed = today.getDate();
  else if (new Date(y, m, 1) < new Date(today.getFullYear(), today.getMonth(), 1)) elapsed = total; else elapsed = 0;
  const budgeted = expense.filter(f => f.budget > 0); let saved = 0;
  if (elapsed > 0) { const diffSoFar = budgeted.reduce((s, f) => s + ((f.budget / total) * elapsed - (catTotals[f.id] || 0)), 0); saved = (diffSoFar / elapsed) * total; }
  return saved;
}
