// Safe arithmetic for the amount field ("100+50*2", "(20+5)/2"). No eval. Returns a number rounded to 2 dp, or null.
const GROUPED = /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})$/;   // western (1,234,567) or lakh/crore (12,34,567) digit grouping
export function evalExpr(input) {
  const s = String(input ?? '')
    .replace(/[\u09E6-\u09EF]/g, c => String(c.charCodeAt(0) - 0x09E6))      // Bengali digits ০–৯ → 0–9
    .replace(/\u09F3/g, '')                                                  // ৳ sign
    .replace(/\d[\d,]*/g, m => (!m.includes(',') || GROUPED.test(m) ? m.replace(/,/g, '') : m))   // 1,200 and 1,20,000 are fine; 1,5 stays invalid
    .replace(/[\u00D7x]/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-').replace(/\s/g, '');
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const num = () => { const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
  const factor = () => { if (s[i] === '-') { i++; return -factor(); } if (s[i] === '+') { i++; return factor(); }
    if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') throw 0; return v; } return num(); };
  const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  try { const v = expr(); if (i !== s.length || !Number.isFinite(v)) return null; return Math.round(v * 100) / 100; } catch { return null; }
}
export const hasOperator = s => /[+\-*/\u00D7\u00F7\u2212]/.test(String(s).replace(/^-/, ''));
