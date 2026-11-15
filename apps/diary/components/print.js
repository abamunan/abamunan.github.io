// Export through the browser's print engine ("Save as PDF"): real selectable text, no canvas limit,
// long entries flow across pages. Print-only markup lives in #diary-print-root (hidden on screen).
import { h, esc } from '../../shared/dom.js';
import { dateLabel, timeLabel, todayStr } from '../domain/dates.js';
import { moodOf } from '../domain/moods.js';

export function buildPrintHtml(entries, now = new Date()) {
  const exported = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const cards = entries.map(e => {
    const mood = moodOf(e.mood);
    const secs = e.sections.map(s => `<section class="dp-section">${s.title.trim() ? `<h3 class="dp-sec-title">${esc(s.title)}</h3>` : ''}<div class="dp-sec-body">${esc(s.content)}</div></section>`).join('');
    return `<article class="dp-entry"><header class="dp-entry-head"><span class="dp-date">${esc(dateLabel(e.datetime))}</span><span class="dp-time">${esc(timeLabel(e.datetime))}${mood ? ` · ${esc(mood.emoji + ' ' + mood.label)}` : ''}</span></header>${e.tags?.length ? `<div class="dp-tags">${e.tags.map(t => '#' + esc(t)).join(' ')}</div>` : ''}${secs}</article>`;
  }).join('');
  return `<div class="dp-head"><div class="dp-title">Munan's <span>Diary</span></div><div class="dp-sub">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · exported ${esc(exported)}</div></div>${cards}`;
}

export function printEntries(entries, label = 'Diary') {
  document.getElementById('diary-print-root')?.remove();
  const root = h('div', { id: 'diary-print-root', html: buildPrintHtml(entries) });
  document.body.append(root);
  document.body.classList.add('diary-printing');
  const prev = document.title;
  document.title = `Munans-${label}-${todayStr()}`;            // becomes the suggested PDF file name
  const restore = () => { document.title = prev; document.body.classList.remove('diary-printing'); window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 100);
}
