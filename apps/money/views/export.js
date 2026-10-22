import { toast } from '../../shared/toast.js';
import { formSheet } from '../components/form-sheet.js';
import { saveBlob } from '../../shared/download.js';
import { buildReport, MONTH_NAMES } from '../domain/report.js';
import { reportToXlsx, reportToHtml, reportFileName } from '../data/report-files.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Report for one month or a whole year, as an Excel file or a printable page (use "Save as PDF" in the print dialog).
export function openExportSheet(app, now = new Date()) {
  const { repo } = app, s = repo.settings, years = [...new Set([...repo.listDays().map(d => d.y), now.getFullYear()])].sort((a, b) => b - a);
  return formSheet({ title: 'Export report', submit: 'Export', fields: [
    { name: 'format', label: 'Format', kind: 'chips', value: 'xlsx', options: [{ value: 'xlsx', label: 'Excel (.xlsx)' }, { value: 'pdf', label: 'PDF (print)' }] },
    { name: 'type', label: 'Report', kind: 'chips', value: 'month', options: [{ value: 'month', label: 'One month' }, { value: 'year', label: 'Whole year' }] },
    { name: 'year', label: 'Year', kind: 'chips', value: String(now.getFullYear()), options: years.map(y => ({ value: String(y), label: String(y) })) },
    { name: 'month', label: 'Month (not used for a whole year)', kind: 'chips', value: String(now.getMonth()), options: MONTH_NAMES.map((m, i) => ({ value: String(i), label: m.slice(0, 3) })) }],
  onSubmit: v => {
    const r = buildReport({ getDoc: (y, m0, d) => repo.getDay(y, m0, d), expense: s.expense, income: s.income, y: Number(v.year), m0: v.type === 'year' ? null : Number(v.month) });
    if (!r.hasData) throw new Error(`Nothing saved for ${r.title}`);
    if (v.format === 'xlsx') { saveBlob(reportFileName(r, 'xlsx'), reportToXlsx(r), XLSX); return toast('Excel downloaded'); }
    const w = window.open('', '_blank');                                      // opened inside the click, so pop-up blockers allow it
    if (!w) throw new Error('Pop-up blocked. Allow pop-ups for this site and try again.');
    w.document.open(); w.document.write(reportToHtml(r)); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 400);
    toast('Choose "Save as PDF" in the print dialog');
  } });
}
