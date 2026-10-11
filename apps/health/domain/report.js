// Month / year reports and the all-data CSV. Pure: no DOM, no storage, no clock.
import { MONTHS, MOODS } from '../data/defaults.js';
import { calcMonth, avg, first, last } from './stats.js';
import { dayHasData, summaryLine } from './day.js';
import { daysInMonth } from './calendar.js';

const r1 = n => Math.round(n * 10) / 10;
const unitOf = m => (m.unit ? ` (${m.unit})` : '');
const pad = n => String(n).padStart(2, '0');
export const isoDate = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const dateLabel = (y, m0, d) => new Date(y, m0, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const hasNote = data => Object.keys(data).some(k => k.startsWith('note_') && String(data[k]).trim());

// One table cell for a metric on one day. Numbers stay numbers (Excel), everything else is text.
export function metricCell(m, data) {
  if (m.type === 'number' || m.type === 'scale') return data[m.id] > 0 ? data[m.id] : '';
  if (m.type === 'bp') { const s = data[m.id + '_sys'], d = data[m.id + '_dia']; return s || d ? `${s || '\u2013'}/${d || '\u2013'}` : ''; }
  if (m.type === 'mood') { const mo = MOODS.find(x => x.id === data.mood); return data.mood ? (mo ? mo.label : data.mood) : ''; }
  if (m.type === 'checklist') { const it = data[m.id + '_items']; return Array.isArray(it) && it.length ? `${it.filter(i => i.checked).length}/${it.length}` : ''; }
  return '';
}
const noteText = (metrics, data) => metrics.filter(m => data['note_' + m.id]).map(m => `${m.label}: ${data['note_' + m.id]}`).join(' | ');

function topMood(counts) {
  const e = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; if (!e) return null;
  const mo = MOODS.find(x => x.id === e[0]); return `${mo ? mo.label : e[0]} (${e[1]} ${e[1] === 1 ? 'day' : 'days'})`;
}
function overview(metrics, mc, total) {
  const items = [{ label: 'Days logged', value: `${mc.loggedDays} / ${total}` }];
  metrics.forEach(m => {
    const arr = { weight: mc.weights, hr: mc.hrs, sugar: mc.sugars, sleep: mc.sleeps, water: mc.waters, steps: mc.steps, calin: mc.calIn, calout: mc.calOut }[m.id];
    if (m.type === 'number' && arr && arr.length) items.push({ label: `${m.label} (average)`, value: `${r1(avg(arr))}${m.unit ? ' ' + m.unit : ''}` });
    if (m.type === 'bp' && mc.sys.length) items.push({ label: `${m.label} (average)`, value: `${Math.round(avg(mc.sys.filter(x => x.v)) || 0)}/${Math.round(avg(mc.dia.filter(x => x.v)) || 0)} mmHg` });
  });
  if (mc.weights.length > 1) { const ch = r1(last(mc.weights) - first(mc.weights)); items.push({ label: 'Weight change', value: `${ch > 0 ? '+' : ''}${ch} kg` }); }
  const tm = topMood(mc.moodCounts); if (tm) items.push({ label: 'Most common mood', value: tm });
  return items;
}

// m0 = null -> whole year. getDay(y, m0, d) -> day doc.
export function buildReport({ getDay, metrics, y, m0 = null }) {
  const cols = metrics;
  if (m0 != null) {
    const mc = calcMonth(getDay, y, m0, metrics), rows = [];
    mc.dailyRows.forEach(({ d, data, has }) => { if (has || hasNote(data)) rows.push([dateLabel(y, m0, d), ...cols.map(m => metricCell(m, data)), noteText(metrics, data)]); });
    return { period: 'month', title: `${MONTHS[m0]} ${y}`, rowsTitle: 'Daily log', hasData: mc.loggedDays > 0, summary: overview(metrics, mc, mc.days),
      head: ['Date', ...cols.map(m => m.label + unitOf(m)), 'Notes'], rows };
  }
  const months = [], rows = []; let total = 0, days = 0; const all = { weights: [], hrs: [], sugars: [], sleeps: [], waters: [], steps: [], calIn: [], calOut: [], sys: [], dia: [], moodCounts: {}, loggedDays: 0 };
  for (let mo = 0; mo < 12; mo++) {
    const mc = calcMonth(getDay, y, mo, metrics); months.push(mc); total += mc.loggedDays; days += mc.days;
    for (const k of ['weights', 'hrs', 'sugars', 'sleeps', 'waters', 'steps', 'calIn', 'calOut', 'sys', 'dia']) all[k].push(...mc[k]);
    for (const [k, v] of Object.entries(mc.moodCounts)) all.moodCounts[k] = (all.moodCounts[k] || 0) + v;
    if (mc.loggedDays) {
      const key = { weight: 'weights', hr: 'hrs', sugar: 'sugars', sleep: 'sleeps', water: 'waters', steps: 'steps', calin: 'calIn', calout: 'calOut' };
      rows.push([MONTHS[mo], mc.loggedDays, ...metrics.filter(m => m.type === 'number' || m.type === 'bp').map(m => {
        if (m.type === 'bp') return mc.sys.length ? `${Math.round(avg(mc.sys.filter(x => x.v)) || 0)}/${Math.round(avg(mc.dia.filter(x => x.v)) || 0)}` : '';
        const arr = mc[key[m.id]]; return arr && arr.length ? r1(avg(arr)) : '';
      })]);
    }
  }
  all.loggedDays = total;
  return { period: 'year', title: String(y), rowsTitle: 'Monthly averages', hasData: total > 0, summary: overview(metrics, all, days),
    head: ['Month', 'Days logged', ...metrics.filter(m => m.type === 'number' || m.type === 'bp').map(m => m.label + unitOf(m))], rows };
}

// Every logged day, one row each. Same columns and escaping as the legacy "Export CSV".
export const csvEscape = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function buildCsv(days, metrics) {
  const header = ['Date'];
  metrics.forEach(m => { if (m.type === 'bp') header.push(m.label + ' (Sys)', m.label + ' (Dia)'); else if (m.type === 'checklist') header.push(m.label); else header.push(m.label + (m.unit ? ` (${m.unit})` : '')); });
  header.push('Mood/Notes');
  const rows = [header];
  days.slice().sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d)).forEach(({ y, m, d, data }) => {
    const row = [isoDate(y, m, d)], notes = [];
    metrics.forEach(met => {
      if (met.type === 'bp') row.push(data[met.id + '_sys'] || '', data[met.id + '_dia'] || '');
      else if (met.type === 'checklist') { const it = data[met.id + '_items']; row.push(Array.isArray(it) ? it.map(i => `${i.name}${i.checked ? ' \u2713' : ''}`).join('; ') : ''); }
      else if (met.type === 'mood') row.push(data.mood || '');
      else row.push(data[met.id] || '');
      if (data['note_' + met.id]) notes.push(`${met.label}: ${data['note_' + met.id]}`);
    });
    row.push(notes.join(' | ')); rows.push(row);
  });
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
}

// One day as printable lines (for "PDF of this day").
export function buildDayReport({ y, m0, d, doc, metrics }) {
  return { title: new Date(y, m0, d).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), lines: metrics.map(m => summaryLine(m, doc, MOODS)).filter(Boolean) };
}
