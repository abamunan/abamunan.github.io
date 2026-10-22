// Turns a report (domain/report.js) into an .xlsx file or a printable HTML page ("Save as PDF" in the print dialog). Pure: no DOM, no storage.
import { buildXlsx } from '../../shared/xlsx.js';
import { esc } from '../../shared/dom.js';

const when = d => d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
export const reportFileName = (r, ext) => `HealthTracker_${r.title.replace(/\s+/g, '_')}.${ext}`;
export const csvFileName = (date = new Date()) => `health-tracker-export-${date.toISOString().slice(0, 10)}.csv`;

export function reportToXlsx(r, { date = new Date() } = {}) {
  const width = Math.max(4, r.head.length), banner = (text, s) => [{ v: text, s }, ...Array(width - 1).fill({ v: '', s })], rows = [];
  rows.push(banner(`Health Tracker \u2014 ${r.title}`, 'title'), [{ v: `Generated: ${when(date)}`, s: 'sub' }], [], banner('OVERVIEW', 'section'),
    ...r.summary.map(x => [x.label, { v: x.value, s: 'bold' }]), [], banner(r.rowsTitle.toUpperCase(), 'section'), r.head.map(v => ({ v, s: 'head' })), ...r.rows);
  return buildXlsx({ sheets: [{ name: r.period === 'year' ? 'Yearly Report' : 'Monthly Report', rows, widths: [20, ...Array(width - 1).fill(14)] }], date });
}

const STYLE = `<style>
@page{size:A4 landscape;margin:12mm}body{font:12px/1.4 system-ui,"Segoe UI",Roboto,"Noto Sans Bengali","Hind Siliguri",sans-serif;color:#11221D;margin:0}
h1{font-size:20px;margin:0 0 2px;color:#0A6F48}h2{font-size:14px;margin:18px 0 6px;color:#0A6F48;break-after:avoid}.sub{color:#5B6C64;margin:0 0 12px}
.sum{display:flex;flex-wrap:wrap;gap:10px}.box{border:1px solid #D3DBD0;border-radius:6px;padding:8px 14px;min-width:140px}.box b{display:block;font-size:15px}
table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border-bottom:1px solid #D3DBD0;padding:4px 8px;text-align:left}th{background:#DDEBE1}tr{break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums}.wide{font-size:10px}.wide th,.wide td{padding:3px 5px}</style>`;
const page = (title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>${STYLE}</head><body>${body}</body></html>`;

export function reportToHtml(r, { date = new Date() } = {}) {
  const th = r.head.map((h, i) => `<th${i > 0 && i < r.head.length - (r.period === 'month' ? 1 : 0) ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
  const body = r.rows.map(row => `<tr>${row.map((v, i) => `<td${typeof v === 'number' ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('');
  return page(reportFileName(r, 'pdf').replace(/\.pdf$/, ''), `<h1>Health Tracker \u2014 ${esc(r.title)}</h1><p class="sub">Generated ${esc(when(date))}</p>
<div class="sum">${r.summary.map(x => `<div class="box">${esc(x.label)}<b>${esc(x.value)}</b></div>`).join('')}</div>
<h2>${esc(r.rowsTitle)}</h2><div class="wide"><table><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${r.head.length}">Nothing logged</td></tr>`}</tbody></table></div>`);
}
export function dayToHtml(day, { date = new Date() } = {}) {
  const body = day.lines.map(l => `<tr><td>${esc(l.icon)} ${esc(l.label)}</td><td class="num">${esc(l.val)}</td><td>${esc(l.note)}</td></tr>`).join('') || '<tr><td colspan="3">No metrics logged</td></tr>';
  return page(`Health Tracker \u2014 ${day.title}`, `<h1>Health Tracker</h1><p class="sub">${esc(day.title)} \u00B7 generated ${esc(when(date))}</p><table><thead><tr><th>Metric</th><th class="num">Value</th><th>Note</th></tr></thead><tbody>${body}</tbody></table>`);
}
