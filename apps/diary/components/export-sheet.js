import { h } from '../../shared/dom.js';
import { openSheet } from '../../shared/sheet.js';
import { toast } from '../../shared/toast.js';
import { saveBlob } from '../../shared/download.js';
import { inRange, toMarkdown } from '../domain/export.js';
import { todayStr } from '../domain/dates.js';
import { printEntries } from './print.js';
import { icon } from '../icons.js';

export function openExport(app) {
  const all = app.repo.list();
  if (!all.length) { toast('Nothing to export yet.'); return; }
  const days = all.map(e => e.datetime.slice(0, 10)).sort();
  const from = h('input', { class: 'ui-input', type: 'date', value: days[0], 'aria-label': 'From date' });
  const to = h('input', { class: 'ui-input', type: 'date', value: days[days.length - 1], 'aria-label': 'To date' });
  const oldest = h('input', { type: 'checkbox', id: 'exOldest', checked: true });
  const count = h('p', { class: 'dm-note', role: 'status' });
  const pick = () => inRange(all, from.value, to.value, oldest.checked);
  let sheet;
  const pdfBtn = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', html: `${icon('download', 18)}<span>Print / Save as PDF</span>`,
    onclick: () => { const list = pick(); sheet.close(); setTimeout(() => printEntries(list), 150); toast('In the print dialog, choose “Save as PDF”.'); } });
  const mdBtn = h('button', { class: 'ui-btn ui-btn--ghost', type: 'button', html: `${icon('share', 18)}<span>Download Markdown</span>`,
    onclick: () => { const list = pick(); saveBlob(`munans-diary-${todayStr()}.md`, toMarkdown(list), 'text/markdown'); toast(`Markdown downloaded — ${list.length} ${list.length === 1 ? 'entry' : 'entries'}.`); } });
  const update = () => { const n = pick().length; count.textContent = `${n} ${n === 1 ? 'entry' : 'entries'} selected`; pdfBtn.disabled = mdBtn.disabled = !n; };
  [from, to, oldest].forEach(el => el.addEventListener('input', update));
  update();
  sheet = openSheet({ title: 'Export diary', content: h('div', { class: 'dx' },
    h('div', { class: 'dy-when' }, h('label', { class: 'dx-l' }, 'From', from), h('label', { class: 'dx-l' }, 'To', to)),
    h('label', { class: 'dx-check' }, oldest, ' Oldest first'),
    count, h('div', { class: 'dy-actions' }, pdfBtn, mdBtn)) });
  return sheet;
}
