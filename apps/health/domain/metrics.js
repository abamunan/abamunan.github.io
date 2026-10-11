// Metric list, goals and profile operations. Pure: every function returns a new value and never touches storage.
import { DEFAULT_PINNED_IDS, DEFAULT_PROFILE } from '../data/defaults.js';

export const migratePinned = metrics => metrics.map(m => typeof m.pinned === 'boolean' ? m : { ...m, pinned: DEFAULT_PINNED_IDS.includes(m.id) });
export const mergeProfile = saved => ({ ...DEFAULT_PROFILE, ...(saved && typeof saved === 'object' ? saved : {}) });

export function newMetricId(now = Date.now(), rand = Math.random()) { return 'c' + now.toString(36) + rand.toString(36).slice(2, 6); }
export function addMetric(metrics, { icon, label }, { now, rand } = {}) {
  const lb = String(label ?? '').trim(); if (!lb) throw new Error('Enter a metric name');
  return [...metrics, { id: newMetricId(now, rand), label: lb, icon: String(icon ?? '').trim() || '\uD83D\uDD16', type: 'number', unit: '', group: 'lifestyle', pinned: false, step: 1 }];
}
export function updateMetric(metrics, id, patch) {
  return metrics.map(m => {
    if (m.id !== id) return m;
    const o = { ...m };
    if ('label' in patch) { const v = String(patch.label).trim(); if (v) o.label = v; }
    if ('icon' in patch) o.icon = String(patch.icon).trim() || m.icon;
    return o;
  });
}
export const togglePin = (metrics, id) => metrics.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m);
export function deleteMetric(metrics, id) {
  if (metrics.length <= 1) throw new Error('At least one metric is required');
  return metrics.filter(m => m.id !== id);     // numbers already saved under it stay in storage but stop showing
}
export const goalableMetrics = metrics => metrics.filter(m => m.type === 'number' || m.type === 'scale');

export function setGoal(goals, id, value) {
  const v = Math.max(0, parseFloat(value) || 0);
  if (!id) throw new Error('Pick a metric first');
  if (!v) throw new Error('Enter a target value');
  return { ...goals, [id]: v };
}
export function removeGoal(goals, id) { const o = { ...goals }; delete o[id]; return o; }
export const activeGoals = (goals, metrics) => Object.entries(goals).filter(([id, v]) => v > 0 && metrics.some(m => m.id === id));

export const normProfile = i => ({
  height: Math.max(0, parseFloat(i?.height) || 0), age: Math.max(0, parseFloat(i?.age) || 0),
  sex: i?.sex === 'female' ? 'female' : 'male', activity: parseFloat(i?.activity) || 1.375
});
