// Shared number/currency formatting. Defaults to ৳ with en-IN grouping (lakh/crore) and true minus sign.
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const fmt = (n, { sign = false, currency = '\u09F3' } = {}) => {
  n = Number(n) || 0; const a = nf.format(Math.abs(n));
  const c = currency ? `${currency} ` : '';
  if (sign) return `${n >= 0 ? '+' : '\u2212'} ${c}${a}`;
  return `${n < 0 ? '\u2212' : ''}${c}${a}`;
};
// Local calendar date YYYY-MM-DD. new Date().toISOString() is UTC: in Dhaka it is still *yesterday* between 00:00 and 06:00.
export const isoLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
