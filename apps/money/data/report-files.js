// Turns a report (domain/report.js) into an .xlsx file or a printable HTML page. Pure: no DOM, no storage.
import { buildXlsx } from './xlsx.js';
import { esc } from '../../shared/dom.js';

const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const when = d => d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
export const reportFileName = (r, ext) => `MoneyTracker_${r.title.replace(/\s+/g, '_')}.${ext}`;

export function reportToXlsx(r, { date = new Date() } = {}) {
  const width = Math.max(4, r.detail.head.length), banner = (text, s) => [{ v: text, s }, ...Array(width - 1).fill({ v: '', s })];
  const sign = n => ({ v: n, s: n >= 0 ? 'moneyInc' : 'moneyExp' }), rows = [];
  rows.push(banner(`Money Tracker \u2014 ${r.title}`, 'title'), [{ v: `Generated: ${when(date)}`, s: 'sub' }], [],
    banner('OVERVIEW', 'section'), ['Total Expense', { v: r.totals.exp, s: 'moneyExp' }], ['Total Income', { v: r.totals.inc, s: 'moneyInc' }], [{ v: 'Net Balance', s: 'bold' }, { ...sign(r.totals.net) }], [],
    banner('CATEGORY BREAKDOWN', 'section'), ['Category', 'Type', 'Amount (BDT)'].map(v => ({ v, s: 'head' })),
    ...r.categories.map(c => [c.label, c.type, { v: c.amount, s: c.type === 'Expense' ? 'moneyExp' : 'moneyInc' }]), [],
    banner(r.rowsTitle.toUpperCase(), 'section'), [r.period === 'year' ? 'Month' : 'Day', 'Total Expense', 'Total Income', 'Net Balance'].map(v => ({ v, s: 'head' })),
    ...r.rows.map(x => [x.label, { v: x.exp, s: 'moneyExp' }, { v: x.inc, s: 'moneyInc' }, sign(x.net)]), [],
    banner('DETAILED BREAKDOWN', 'section'), r.detail.head.map(v => ({ v, s: 'head' })), ...r.detail.rows.map(row => row.map((v, i) => (i === 0 ? v : { v, s: 'money' }))));
  return buildXlsx({ sheets: [{ name: r.period === 'year' ? 'Yearly Report' : 'Monthly Report', rows, widths: [18, ...Array(width - 1).fill(14)] }], date });
}

export function reportToHtml(r, { date = new Date() } = {}) {
  const n = v => nf.format(v), cls = v => (v >= 0 ? 'inc' : 'exp');
  const table = (head, body, right = []) => `<table><thead><tr>${head.map((h, i) => `<th${right.includes(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  const tr = cells => `<tr>${cells.map(([t, c]) => `<td${c ? ` class="${c}"` : ''}>${t}</td>`).join('')}</tr>`;
  const cats = r.categories.map(c => tr([[`${esc(c.icon)} ${esc(c.label)}`], [c.type], [n(c.amount), `num ${c.type === 'Expense' ? 'exp' : 'inc'}`]])).join('');
  const rows = r.rows.map(x => tr([[esc(x.label)], [n(x.exp), 'num exp'], [n(x.inc), 'num inc'], [n(x.net), `num ${cls(x.net)}`]])).join('');
  const dh = r.detail.head, dr = r.detail.rows.map(row => `<tr>${row.map((v, i) => (i === 0 ? `<td>${esc(v)}</td>` : `<td class="num">${v ? n(v) : ''}</td>`)).join('')}</tr>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(reportFileName(r, 'pdf').replace(/\.pdf$/, ''))}</title><style>
@page{size:A4 landscape;margin:12mm}body{font:12px/1.4 system-ui,"Segoe UI",Roboto,"Noto Sans Bengali","Hind Siliguri",sans-serif;color:#1b1b1b;margin:0}
h1{font-size:20px;margin:0 0 2px;color:#0f3d2e}h2{font-size:14px;margin:18px 0 6px;color:#0a6f48;break-after:avoid}.sub{color:#666;margin:0 0 12px}
.sum{display:flex;gap:12px}.box{border:1px solid #ccc;border-radius:6px;padding:8px 14px;min-width:150px}.box b{display:block;font-size:16px}
table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left}th{background:#e6f2ec}tr{break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums}.exp{color:#c0392b}.inc{color:#0a6f48}.wide{font-size:10px}.wide th,.wide td{padding:3px 5px}</style></head><body>
<h1>Money Tracker \u2014 ${esc(r.title)}</h1><p class="sub">Generated ${esc(when(date))} \u00B7 amounts in BDT</p>
<div class="sum"><div class="box">Total Expense<b class="exp">${n(r.totals.exp)}</b></div><div class="box">Total Income<b class="inc">${n(r.totals.inc)}</b></div><div class="box">Net Balance<b class="${cls(r.totals.net)}">${n(r.totals.net)}</b></div></div>
<h2>Category breakdown</h2>${table(['Category', 'Type', 'Amount'], cats, [2])}
<h2>${esc(r.rowsTitle)}</h2>${table([r.period === 'year' ? 'Month' : 'Day', 'Expense', 'Income', 'Net'], rows, [1, 2, 3])}
<h2>Detailed breakdown</h2><div class="wide">${table(dh, dr, dh.map((_, i) => i).slice(1))}</div></body></html>`;
}
