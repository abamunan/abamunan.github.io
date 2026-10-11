import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { openSheet } from '../../shared/sheet.js';
import { saveBlob } from '../../shared/download.js';
import { MONTHS } from '../data/defaults.js';
import { buildReport, buildDayReport } from '../domain/report.js';
import { reportToXlsx, reportToHtml, dayToHtml, reportFileName } from '../data/report-files.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Report for one month, a whole year, or the day open in Today: an Excel file, or a printable page ("Save as PDF" in the print dialog).
export function openExportSheet(app, now = new Date()) {
  const { repo } = app, metrics = repo.state.metrics, years = [...new Set([...repo.listDays().map(d => d.y), now.getFullYear()])].sort((a, b) => b - a);
  const sel = app.state.day || { y: now.getFullYear(), m0: now.getMonth(), d: now.getDate() };
  const v = { format: 'xlsx', type: 'month', year: now.getFullYear(), month: now.getMonth() }, body = h('div', { class: 'hpick' }), sheet = openSheet({ title: 'Export report', content: body });
  const chips = (label, items, key, after) => h('div', { class: 'xgroup' }, h('div', { class: 'add-label card__sub' }, label), h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': label },
    items.map(([val, text]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v[key] === val), onclick: () => { v[key] = val; if (key === 'type' && val === 'day') v.format = 'pdf'; paint(); } }, text))));
  function run() {
    try {
      const date = new Date();
      if (v.type === 'day') {
        const day = buildDayReport({ ...sel, doc: repo.getDay(sel.y, sel.m0, sel.d), metrics }); if (!day.lines.length) throw new Error('Nothing logged on that day');
        return printHtml(dayToHtml(day, { date }));
      }
      const r = buildReport({ getDay: (y, m, d) => repo.getDay(y, m, d), metrics, y: v.year, m0: v.type === 'year' ? null : v.month });
      if (!r.hasData) throw new Error(`Nothing saved for ${r.title}`);
      if (v.format === 'xlsx') { saveBlob(reportFileName(r, 'xlsx'), reportToXlsx(r, { date }), XLSX); toast('Excel downloaded'); sheet.close(); return; }
      printHtml(reportToHtml(r, { date }));
    } catch (e) { toast(e?.message || 'Export failed', { error: true }); }
  }
  function printHtml(html) {
    const w = window.open('', '_blank');                                       // opened inside the click, so pop-up blockers allow it
    if (!w) throw new Error('Pop-up blocked. Allow pop-ups for this site and try again.');
    w.document.open(); w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch { /* the person can print manually */ } }, 400);
    toast('Choose "Save as PDF" in the print dialog'); sheet.close();
  }
  function paint() {
    const day = v.type === 'day';
    body.replaceChildren(
      chips('Report', [['month', 'One month'], ['year', 'Whole year'], ['day', 'Day open in Today']], 'type'),
      day ? h('p', { class: 'card__sub' }, `Day report for ${new Date(sel.y, sel.m0, sel.d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. It opens as a printable page.`)
        : chips('Format', [['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF (print)']], 'format'),
      !day && chips('Year', years.map(y => [y, String(y)]), 'year'),
      !day && v.type === 'month' && chips('Month', MONTHS.map((m, i) => [i, m.slice(0, 3)]), 'month'),
      h('button', { type: 'button', class: 'ui-btn ui-btn--primary add-save', onclick: run }, day ? 'Open printable page' : 'Export'));
  }
  paint(); return sheet;
}
