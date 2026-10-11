// Money/number formatting. ৳ with en-IN grouping (lakh/crore), true minus sign.
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const fmt = (n, { sign = false } = {}) => {
  n = Number(n) || 0; const a = nf.format(Math.abs(n));
  if (sign) return `${n >= 0 ? '+' : '\u2212'} \u09F3 ${a}`;
  return `${n < 0 ? '\u2212' : ''}\u09F3 ${a}`;
};
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
