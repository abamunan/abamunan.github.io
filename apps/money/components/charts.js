// Tiny inline-SVG bar chart (no library, works offline). groups: [[v, ...], ...] one group per x slot, one bar per series.
import { h, esc } from '../../shared/dom.js';

export function barChart({ groups, colors, labels, showLabel = () => true, avg = null, label }) {
  const W = 320, H = 132, padL = 4, padR = 4, top = 8, base = H - 22, n = groups.length, series = colors.length;
  const max = Math.max(1, avg || 0, ...groups.flat()), slot = (W - padL - padR) / n, bw = Math.max(1.5, Math.min(26, slot * 0.78 / series)), used = bw * series;
  const y = v => base - (v / max) * (base - top);
  const bars = groups.map((g, i) => g.map((v, k) => { if (!(v > 0)) return ''; const x = padL + i * slot + (slot - used) / 2 + k * bw;
    return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - (series > 1 ? 1 : 0)).toFixed(1)}" height="${(base - y(v)).toFixed(1)}" rx="1.5" fill="${colors[k]}"/>`; }).join('')).join('');
  const ticks = labels.map((t, i) => showLabel(i) ? `<text x="${(padL + i * slot + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="currentColor" opacity=".7">${esc(t)}</text>` : '').join('');
  const line = avg > 0 ? `<line x1="${padL}" x2="${W - padR}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity=".55"/>` : '';
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}" style="display:block;color:var(--muted)"><line x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}" stroke="currentColor" opacity=".35"/>${bars}${line}${ticks}</svg>`;
  return h('div', { class: 'chart', html: svg });
}
