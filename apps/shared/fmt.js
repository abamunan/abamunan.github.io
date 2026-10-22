// Shared number/currency formatting. Defaults to ৳ with en-IN grouping (lakh/crore) and true minus sign.
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const fmt = (n, { sign = false, currency = '\u09F3' } = {}) => {
  n = Number(n) || 0; const a = nf.format(Math.abs(n));
  const c = currency ? `${currency} ` : '';
  if (sign) return `${n >= 0 ? '+' : '\u2212'} ${c}${a}`;
  return `${n < 0 ? '\u2212' : ''}${c}${a}`;
};
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
