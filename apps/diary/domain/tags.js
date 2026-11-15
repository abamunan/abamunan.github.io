export const MAX_TAGS = 10, MAX_TAG = 30;

/** '  #Cycling  ' -> 'cycling'. Empty/over-long input -> ''. Tags are stored lowercase so 'Gym' and 'gym' are one tag. */
export const normalizeTag = s => String(s ?? '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLocaleLowerCase().slice(0, MAX_TAG).trim();

export function normalizeTags(list) {
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const n = normalizeTag(t);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** [{tag, count}] most used first (ties alphabetical). */
export function allTags(entries) {
  const m = new Map();
  for (const e of entries) for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
