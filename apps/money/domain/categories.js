// Category (expense) and source (income) management. Pure: each function takes the current list and returns a new one,
// or throws Error with a message fit for a toast. Shapes match the legacy app (mt.js): {id,label,icon,pinned[,budget][,defaultAcct]}.
import { newId } from '../../shared/dom.js';

const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const KIND = { expense: 'category', income: 'source' };
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export function addCategory(list, type, { label, icon } = {}, id = newId('c')) {
  need(type in KIND, 'Unknown type'); label = String(label ?? '').trim(); need(label, `Enter a ${KIND[type]} name`);
  need(!list.some(f => same(f.label, label)), `You already have a ${KIND[type]} called "${label}"`);
  const f = { id, label, icon: String(icon ?? '').trim() || '\u{1F516}' };
  return [...list, type === 'expense' ? { ...f, budget: 0, pinned: false } : { ...f, pinned: false }];
}
// patch: {label, icon, pinned, defaultAcct, archived}. defaultAcct '' / null removes it.
// archived:true hides a category from the Add screen but it keeps counting in totals, balances, reports and CSV (so nothing ever disagrees).
export function updateCategory(list, id, patch, accountIds = []) {
  const f = list.find(x => x.id === id); need(f, 'Not found'); const next = { ...f };
  if (patch.label !== undefined) { const v = String(patch.label).trim(); need(v, 'Enter a name'); need(!list.some(x => x.id !== id && same(x.label, v)), `You already have one called "${v}"`); next.label = v; }
  if (patch.icon !== undefined) next.icon = String(patch.icon).trim() || f.icon;
  if (patch.pinned !== undefined) next.pinned = !!patch.pinned;
  if (patch.archived !== undefined) { if (patch.archived) { need(list.some(x => x.id !== id && !x.archived), 'At least one must stay active. Add another first'); next.archived = true; } else delete next.archived; }
  if (patch.defaultAcct !== undefined) { if (patch.defaultAcct) { need(accountIds.includes(patch.defaultAcct), 'Account not found'); next.defaultAcct = patch.defaultAcct; } else delete next.defaultAcct; }
  return list.map(x => (x.id === id ? next : x));
}
export function moveCategory(list, id, dir) {                       // dir: -1 up, +1 down; at the ends nothing changes
  const i = list.findIndex(x => x.id === id); need(i >= 0, 'Not found'); const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return list;
  const out = [...list]; [out[i], out[j]] = [out[j], out[i]]; return out;
}
export function deleteCategory(list, type, id) {
  need(list.some(x => x.id === id), 'Not found'); need(list.some(x => x.id !== id && !x.archived), type === 'expense' ? 'At least one expense category is required' : 'At least one income source is required');
  return list.filter(x => x.id !== id);
}
// How much saved data sits under this id: used to warn before deleting. Counts days with an amount (flat field) or an entry.
export function categoryUsage(days, id) {
  const { days: n, total } = categoryUsageStats(days, id);
  return { days: n, total: Math.round(total * 100) / 100 };
}

export function categoryUseCount(days, id) {
  return categoryUsageStats(days, id).uses;
}
// Same numbers as categoryUseCount, for every id in ONE pass over the days (the Add sheet sorts all categories; one call per category re-read every day each time).
export function categoryUseCounts(days, ids) {
  const out = Object.fromEntries(ids.map(id => [id, 0]));
  for (const { doc } of days) {
    if (!doc || typeof doc !== 'object') continue;
    const per = {};
    for (const e of Array.isArray(doc.entries) ? doc.entries : []) if (e && e.cat in out) per[e.cat] = (per[e.cat] || 0) + 1;
    for (const id of ids) { if (per[id]) out[id] += per[id]; else if (Number(doc[id])) out[id] += 1; }
  }
  return out;
}

function categoryUsageStats(days, id) {
  let n = 0, uses = 0, total = 0;
  for (const { doc } of days) {
    const flat = Number(doc?.[id]) || 0;
    const entries = (doc?.entries || []).filter(e => e.cat === id);
    if (flat || entries.length) {
      n++;
      uses += entries.length || 1;
      total += flat;
    }
  }
  return { days: n, uses, total };
}

// Data saved under a category id that is no longer in the list (deleted by an older version). It is invisible in totals, reports and
// Insights, so it is surfaced here and can be restored. A day counts once per id; flat (old-format) amounts are recognised by their
// ts_/acct_/note_ companions so that unrelated numeric fields are never mistaken for categories.
export function orphanCategories(days, knownIds) {
  const known = new Set(knownIds), out = new Map();
  const seen = (id, amt) => { const o = out.get(id) || { id, days: 0, total: 0 }; o.days++; o.total += amt; out.set(id, o); };
  for (const { doc } of days) {
    if (!doc || typeof doc !== 'object') continue;
    const here = new Map();
    for (const e of Array.isArray(doc.entries) ? doc.entries : []) if (e && e.cat && !known.has(e.cat)) here.set(e.cat, (here.get(e.cat) || 0) + (Number(e.amt) || 0));
    for (const k of Object.keys(doc)) {
      if (/^(note|acct|ts)_/.test(k) || k === 'entries' || known.has(k) || here.has(k) || typeof doc[k] !== 'number') continue;
      if (doc['ts_' + k] !== undefined || doc['acct_' + k] !== undefined || doc['note_' + k] !== undefined) here.set(k, Number(doc[k]) || 0);
    }
    for (const [id, amt] of here) seen(id, amt);
  }
  return [...out.values()].map(o => ({ ...o, total: Math.round(o.total * 100) / 100 })).sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
}
// Brings an orphaned id back as an archived category (hidden from the Add screen, counted everywhere again). The person can rename or unarchive it.
export function restoreCategory(list, type, id, label) {
  need(type in KIND, 'Unknown type'); label = String(label ?? '').trim(); need(label, `Enter a ${KIND[type]} name`);
  need(!list.some(f => f.id === id), 'Already in the list'); need(!list.some(f => same(f.label, label)), `You already have a ${KIND[type]} called "${label}"`);
  return [...list, { id, label, icon: '\u{1F516}', pinned: false, archived: true, ...(type === 'expense' ? { budget: 0 } : {}) }];
}
