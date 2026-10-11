// Month statistics and health categories, ported from ht.js (calcMonth, bmiOf, bmiCategory, bpCategory, avg/first/last).
import { daysInMonth } from './calendar.js';
import { dayHasData } from './day.js';

// getDay(y, m0, d) -> day doc
export function calcMonth(getDay, y, m0, metrics) {
  const days = daysInMonth(y, m0);
  const weights = [], sys = [], dia = [], hrs = [], sugars = [], sleeps = [], waters = [], steps = [], calIn = [], calOut = [];
  const moodCounts = {}; let loggedDays = 0; const dailyRows = [];
  for (let d = 1; d <= days; d++) {
    const data = getDay(y, m0, d) || {}; const has = dayHasData(metrics, data);
    if (has) loggedDays++;
    if (data.weight > 0) weights.push({ d, v: data.weight });
    if (data.bp_sys > 0 || data.bp_dia > 0) { sys.push({ d, v: data.bp_sys || null }); dia.push({ d, v: data.bp_dia || null }); }
    if (data.hr > 0) hrs.push({ d, v: data.hr });
    if (data.sugar > 0) sugars.push({ d, v: data.sugar });
    if (data.sleep > 0) sleeps.push({ d, v: data.sleep });
    if (data.water > 0) waters.push({ d, v: data.water });
    if (data.steps > 0) steps.push({ d, v: data.steps });
    if (data.calin > 0) calIn.push({ d, v: data.calin });
    if (data.calout > 0) calOut.push({ d, v: data.calout });
    if (data.mood) moodCounts[data.mood] = (moodCounts[data.mood] || 0) + 1;
    dailyRows.push({ d, data, has });
  }
  return { days, loggedDays, weights, sys, dia, hrs, sugars, sleeps, waters, steps, calIn, calOut, moodCounts, dailyRows };
}
export const avg = arr => arr.length ? arr.reduce((s, x) => s + (typeof x === 'object' ? x.v : x), 0) / arr.length : null;
export const last = arr => arr.length ? arr[arr.length - 1].v : null;
export const first = arr => arr.length ? arr[0].v : null;

export function bmiOf(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100; return weightKg / (h * h);
}
export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { label: 'Underweight', cls: 'under' };
  if (bmi < 25) return { label: 'Normal', cls: 'normal' };
  if (bmi < 30) return { label: 'Overweight', cls: 'over' };
  return { label: 'Obese', cls: 'obese' };
}
export function bpCategory(sys, dia) {
  if (sys == null || dia == null) return null;
  if (sys < 120 && dia < 80) return { label: 'Normal', cls: 'normal' };
  if (sys < 130 && dia < 80) return { label: 'Elevated', cls: 'over' };
  if (sys < 140 || dia < 90) return { label: 'Stage 1', cls: 'over' };
  return { label: 'Stage 2', cls: 'obese' };
}
