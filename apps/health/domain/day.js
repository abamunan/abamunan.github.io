// Pure day-document logic ported from ht.js (collectDayData, dayHasData, updateScoreCard, metricSummaryLine ...).
export function metricForcedShown(m, data) {
  if (m.pinned) return false;
  if (m.type === 'bp') return (parseFloat(data[m.id + '_sys']) || 0) > 0 || (parseFloat(data[m.id + '_dia']) || 0) > 0;
  if (m.type === 'checklist') { const items = data[m.id + '_items']; return Array.isArray(items) && items.length > 0; }
  if (m.type === 'mood') return !!data[m.id];
  if (m.type === 'scale') return (parseFloat(data[m.id]) || 0) > 0;
  const hasVal = (parseFloat(data[m.id]) || 0) > 0;
  const hasNote = !!(data['note_' + m.id] && String(data['note_' + m.id]).trim());
  return hasVal || hasNote;
}
export function computeExtraShown(metrics, data) {
  const s = new Set();
  metrics.forEach(m => { if (!m.pinned && (metricForcedShown(m, data) || !!data['shown_' + m.id])) s.add(m.id); });
  return s;
}
export const visibleMetrics = (metrics, extra) => metrics.filter(m => m.pinned || extra.has(m.id));

export function dayHasData(metrics, saved) {
  return metrics.some(m => {
    if (m.type === 'number') return (saved[m.id] || 0) > 0;
    if (m.type === 'bp') return (saved[m.id + '_sys'] || 0) > 0;
    if (m.type === 'scale') return (saved[m.id] || 0) > 0;
    if (m.type === 'mood') return !!saved.mood;
    if (m.type === 'checklist') { const items = saved[m.id + '_items']; return Array.isArray(items) && items.length > 0; }
    return false;
  });
}

// Build the day document from form values. `values` uses the document's own field names:
//   number/scale: values[id]   bp: values[id+'_sys'], values[id+'_dia']   mood: values.mood   checklist: values[id+'_items']   notes: values['note_'+id]
// Missing values become 0 / '' / [] exactly as the legacy form did. `locked` is carried over from the existing doc.
export function buildDayDoc(metrics, values = {}, { existing = {}, extraShown = new Set() } = {}) {
  const data = {};
  metrics.forEach(m => {
    if (m.type === 'number') data[m.id] = parseFloat(values[m.id]) || 0;
    else if (m.type === 'bp') { data[m.id + '_sys'] = parseFloat(values[m.id + '_sys']) || 0; data[m.id + '_dia'] = parseFloat(values[m.id + '_dia']) || 0; }
    else if (m.type === 'scale') data[m.id] = parseInt(values[m.id], 10) || 0;
    else if (m.type === 'mood') data.mood = values.mood || '';
    else if (m.type === 'checklist') data[m.id + '_items'] = Array.isArray(values[m.id + '_items']) ? values[m.id + '_items'] : [];
    const note = String(values['note_' + m.id] ?? '').trim();
    if (note) data['note_' + m.id] = note;
  });
  metrics.forEach(m => { if (!m.pinned && !metricForcedShown(m, data) && extraShown.has(m.id)) data['shown_' + m.id] = true; });
  if (typeof existing.locked === 'boolean') data.locked = existing.locked;
  return data;
}

// Daily log score: share of PINNED metrics that were logged.
export function dailyScore(metrics, data) {
  const pinned = metrics.filter(m => m.pinned);
  if (!pinned.length) return { pct: null, filled: 0, total: 0 };
  let filled = 0;
  pinned.forEach(m => {
    if (m.type === 'number') { if ((data[m.id] || 0) > 0) filled++; }
    else if (m.type === 'bp') { if ((data[m.id + '_sys'] || 0) > 0 && (data[m.id + '_dia'] || 0) > 0) filled++; }
    else if (m.type === 'scale') { if ((data[m.id] || 0) > 0) filled++; }
    else if (m.type === 'mood') { if (data.mood) filled++; }
    else if (m.type === 'checklist') { const it = data[m.id + '_items']; if (Array.isArray(it) && it.length && it.every(i => i.checked)) filled++; }
  });
  return { pct: Math.round(filled / pinned.length * 100), filled, total: pinned.length };
}

export function summaryLine(m, data, moods = []) {
  const note = data['note_' + m.id] || '';
  if (m.type === 'number') { const v = data[m.id]; return v ? { icon: m.icon, label: m.label, val: `${v}${m.unit ? ' ' + m.unit : ''}`, note } : (note ? { icon: m.icon, label: m.label, val: 'Note only', note } : null); }
  if (m.type === 'bp') { const s = data[m.id + '_sys'], d = data[m.id + '_dia']; return s || d ? { icon: m.icon, label: m.label, val: `${s || '\u2013'}/${d || '\u2013'} mmHg`, note } : (note ? { icon: m.icon, label: m.label, val: 'Note only', note } : null); }
  if (m.type === 'scale') { const v = data[m.id]; return v ? { icon: m.icon, label: m.label, val: `${v}/5`, note } : (note ? { icon: m.icon, label: m.label, val: 'Note only', note } : null); }
  if (m.type === 'mood') { const mo = moods.find(x => x.id === data.mood); return data.mood ? { icon: mo ? mo.icon : '\uD83D\uDE42', label: 'Mood', val: mo ? mo.label : data.mood, note } : (note ? { icon: '\uD83D\uDE42', label: 'Mood', val: 'Note only', note } : null); }
  if (m.type === 'checklist') {
    const items = data[m.id + '_items']; if (!Array.isArray(items) || !items.length) return note ? { icon: m.icon, label: m.label, val: 'Note only', note } : null;
    return { icon: m.icon, label: m.label, val: `${items.filter(i => i.checked).length}/${items.length} taken`, note: items.map(i => i.name + (i.checked ? ' \u2713' : ' \u2717')).join(', ') };
  }
  return note ? { icon: m.icon, label: m.label, val: 'Note only', note } : null;
}

// Fields of a stored day that no CURRENT metric owns (e.g. values logged under a metric that was deleted later).
// The legacy app dropped them on the next save of that day; the new form merges them back so nothing is lost silently.
export function ownedKeys(metrics) {
  const s = new Set(['mood', 'locked']);
  metrics.forEach(m => { for (const k of [m.id, m.id + '_sys', m.id + '_dia', m.id + '_items', 'note_' + m.id, 'shown_' + m.id]) s.add(k); });
  return s;
}
export function unownedFields(metrics, doc) {
  const own = ownedKeys(metrics);
  return Object.fromEntries(Object.entries(doc || {}).filter(([k]) => !own.has(k)));
}
