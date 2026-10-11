// Inline-SVG line chart (no library, works offline). points: [{ label, v }]; rolling: same length, may hold nulls.
import { h, esc } from '../../shared/dom.js';

export function lineChart({ points, rolling = null, unit = '', label }) {
  const W = 320, H = 160, L = 36, R = 8, T = 10, B = 24, n = points.length;
  const vals = points.map(p => p.v), lo0 = Math.min(...vals), hi0 = Math.max(...vals), pad = (hi0 - lo0) * 0.08 || Math.max(1, Math.abs(hi0) * 0.05), lo = lo0 - pad, hi = hi0 + pad;
  const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = arr => arr.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ');
  const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  const dots = n <= 45 ? points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2" fill="var(--lagoon)" opacity=".55"/>`).join('') : '';
  const txt = (tx, ty, anchor, t) => `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="9.5" fill="currentColor" opacity=".72">${esc(t)}</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(`${label}: ${n} readings, from ${fmt(vals[0])} to ${fmt(vals[n - 1])}${unit ? ' ' + unit : ''}. Lowest ${fmt(lo0)}, highest ${fmt(hi0)}.`)}" style="display:block;color:var(--muted)">
<line x1="${L}" x2="${W - R}" y1="${y(hi0).toFixed(1)}" y2="${y(hi0).toFixed(1)}" stroke="currentColor" stroke-width=".6" stroke-dasharray="3 3" opacity=".35"/>
<line x1="${L}" x2="${W - R}" y1="${y(lo0).toFixed(1)}" y2="${y(lo0).toFixed(1)}" stroke="currentColor" stroke-width=".6" stroke-dasharray="3 3" opacity=".35"/>
<polyline points="${path(vals)}" fill="none" stroke="var(--lagoon)" stroke-width="1.2" opacity=".5" stroke-linejoin="round"/>${dots}
${rolling ? `<polyline points="${path(rolling)}" fill="none" stroke="var(--lagoon)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
${txt(L - 4, y(hi0) + 3, 'end', fmt(hi0))}${txt(L - 4, y(lo0) + 3, 'end', fmt(lo0))}${txt(L, H - 6, 'start', points[0].label)}${n > 1 ? txt(W - R, H - 6, 'end', points[n - 1].label) : ''}</svg>`;
  return h('div', { class: 'chart', html: svg });
}
