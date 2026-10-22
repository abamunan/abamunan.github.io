// Floating calculator logic. Pure: press(state, key) → new state. Arithmetic goes through evalExpr (no eval()).
// State: { expr, done, error, entry }. expr uses the display symbols + − × ÷. done = expr is a finished result. entry = {e, r} set only by a successful "=".
import { evalExpr, hasOperator } from './expr.js';

export const MAX_DIGITS = 12;
export const initial = () => ({ expr: '', done: false, error: false, entry: null });
const OPS = '+\u2212\u00D7\u00F7', isOp = c => !!c && OPS.includes(c), isDigit = c => !!c && c >= '0' && c <= '9';
const ALIAS = { '-': '\u2212', '*': '\u00D7', x: '\u00D7', X: '\u00D7', '/': '\u00F7', ',': '.', Enter: '=', Backspace: '\u232B', Delete: 'C', c: 'C' };
export const normalizeKey = k => ALIAS[k] ?? k;
const lastNum = e => /[0-9.]*$/.exec(e)[0];
const open = e => (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
const closed = e => { let s = e.replace(/[.+\u2212\u00D7\u00F7]+$/, ''); while (s.endsWith('(')) s = s.slice(0, -1).replace(/[+\u2212\u00D7\u00F7]+$/, ''); return s + ')'.repeat(Math.max(0, open(s))); };
export const fmtNum = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n).replace('-', '\u2212');
export const show = e => e.replace(/([+\u2212\u00D7\u00F7])/g, ' $1 ').replace(/^ \u2212 /, '\u2212').replace(/\( \u2212 /g, '(\u2212');

export function press(st, rawKey) {
  const key = normalizeKey(rawKey); let { expr, done } = st; const next = (e, d = false, error = false, entry = null) => ({ expr: e, done: d, error, entry }), last = expr.slice(-1);
  if (key === 'C') return initial();
  if (key === '\u232B') return next(expr.slice(0, -1));
  if (isDigit(key)) {
    if (done) { expr = ''; } const n = lastNum(expr), l = expr.slice(-1);
    if (n.replace('.', '').length >= MAX_DIGITS) return next(expr);
    if (n === '0') return next(expr.slice(0, -1) + key);
    return next(l === ')' ? expr + '\u00D7' + key : expr + key);
  }
  if (key === '.') {
    if (done) expr = ''; const n = lastNum(expr);
    if (n.includes('.')) return next(expr);
    return next(n ? expr + '.' : expr + (expr.slice(-1) === ')' ? '\u00D7' : '') + '0.');
  }
  if (isOp(key)) {
    if (!expr) return key === '\u2212' ? next('\u2212') : next('');
    if (expr === '\u2212') return next(expr);
    if (last === '(') return key === '\u2212' ? next(expr + key) : next(expr);
    let e = expr.replace(/\.$/, '');
    if (isOp(e.slice(-1))) { e = e.slice(0, -1); if (isOp(e.slice(-1)) || e === '' || e.endsWith('(')) e = e.replace(/[+\u2212\u00D7\u00F7]+$/, ''); }
    return next(e + key);
  }
  if (key === '(') {
    if (done) expr = ''; const l = expr.slice(-1);
    return next(isDigit(l) || l === '.' || l === ')' ? expr + '\u00D7(' : expr + '(');
  }
  if (key === ')') {
    if (open(expr) <= 0 || !last || isOp(last) || last === '(') return next(expr, done);
    return next(expr + ')');
  }
  if (key === '=') {
    if (!expr || done) return next(expr, done);
    const e = closed(expr), v = e ? evalExpr(e) : null;
    if (v == null || Math.abs(v) >= 1e15) return next(expr, false, true);
    const r = String(v).replace('-', '\u2212');
    return next(r, true, false, { e: show(e), r });
  }
  return next(expr, done);
}
// Live result while typing. Only when the expression has an operator (a lone number needs no preview).
export function preview(st) {
  if (st.done || !st.expr || !hasOperator(st.expr.replace(/^\u2212/, ''))) return null;
  const e = closed(st.expr); const v = e ? evalExpr(e) : null; return v == null || Math.abs(v) >= 1e15 ? null : v;
}
export const resultValue = st => (st.done ? evalExpr(st.expr) : null);
