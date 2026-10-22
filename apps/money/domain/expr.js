// Safe arithmetic for the amount field ("100+50*2", "(20+5)/2"). No eval. Returns a number rounded to 2 dp, or null.
export function evalExpr(input) {
  const s = String(input ?? '').replace(/[\u00D7x]/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-').replace(/[,\s]/g, '');
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
