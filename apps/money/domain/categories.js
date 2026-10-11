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
// patch: {label, icon, pinned, defaultAcct}. defaultAcct '' / null removes it.
export function updateCategory(list, id, patch, accountIds = []) {
  const f = list.find(x => x.id === id); need(f, 'Not found'); const next = { ...f };
  if (patch.label !== undefined) { const v = String(patch.label).trim(); need(v, 'Enter a name'); need(!list.some(x => x.id !== id && same(x.label, v)), `You already have one called "${v}"`); next.label = v; }
  if (patch.icon !== undefined) next.icon = String(patch.icon).trim() || f.icon;
  if (patch.pinned !== undefined) next.pinned = !!patch.pinned;
  if (patch.defaultAcct !== undefined) { if (patch.defaultAcct) { need(accountIds.includes(patch.defaultAcct), 'Account not found'); next.defaultAcct = patch.defaultAcct; } else delete next.defaultAcct; }
  return list.map(x => (x.id === id ? next : x));
}
export function moveCategory(list, id, dir) {                       // dir: -1 up, +1 down; at the ends nothing changes
  const i = list.findIndex(x => x.id === id); need(i >= 0, 'Not found'); const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return list;
  const out = [...list]; [out[i], out[j]] = [out[j], out[i]]; return out;
}
export function deleteCategory(list, type, id) {
  need(list.some(x => x.id === id), 'Not found'); need(list.length > 1, type === 'expense' ? 'At least one expense category is required' : 'At least one income source is required');
  return list.filter(x => x.id !== id);
}
// How much saved data sits under this id: used to warn before deleting. Counts days with an amount (flat field) or an entry.
export function categoryUsage(days, id) {
  let n = 0, total = 0;
  for (const { doc } of days) { const flat = Number(doc?.[id]) || 0, has = (doc?.entries || []).some(e => e.cat === id); if (flat || has) { n++; total += flat; } }
  return { days: n, total: Math.round(total * 100) / 100 };
}
