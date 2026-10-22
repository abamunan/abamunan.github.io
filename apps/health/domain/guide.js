// Nutrition guide (Guide tab), ported from renderGuideTab / ht_guideLatestWeight.
import { MONTHS } from '../data/defaults.js';
export function latestWeight(days) {
  let best = null;
  days.forEach(e => { if (e.data && e.data.weight > 0 && (!best || e.y > best.y || (e.y === best.y && e.m > best.m) || (e.y === best.y && e.m === best.m && e.d > best.d))) best = { y: e.y, m: e.m, d: e.d, v: e.data.weight }; });
  return best;
}
export function macroGuide(weight, profile) {
  const usingExample = !weight, w = weight || 70;
  const out = { usingExample, w, pLow: Math.round(w * 1.6), pHigh: Math.round(w * 2.2), fLow: Math.round(w * 0.5), fHigh: Math.round(w * 1.5),
    cLow: Math.round(w * 3), cHigh: Math.round(w * 5), gainLow: (w * 0.0025).toFixed(2), gainHigh: (w * 0.005).toFixed(2), hasProfile: profile.height > 0 && profile.age > 0 };
  if (out.hasProfile) {
    const bmr = profile.sex === 'female' ? (10 * w + 6.25 * profile.height - 5 * profile.age - 161) : (10 * w + 6.25 * profile.height - 5 * profile.age + 5);
    const tdee = bmr * (profile.activity || 1.375);
    Object.assign(out, { bmr, tdee, surLow: Math.round(tdee * 1.10), surHigh: Math.round(tdee * 1.20) });
  }
  return out;
}

// View-model for the Guide screen: the five personal cards plus the two note lines. Text matches the legacy renderGuideTab,
// except "Day view" is now called "Today" (the new app's screen name).
const fmtInt = n => Math.round(n).toLocaleString('en-US');
export function guideModel(days, profile) {
  const entry = latestWeight(days), g = macroGuide(entry ? entry.v : null, profile);
  const kcal = g.hasProfile ? { label: 'Calorie Target', val: `${g.surLow.toLocaleString('en-US')}\u2013${g.surHigh.toLocaleString('en-US')}`, sub: 'kcal/day' } : { label: 'Calorie Target', val: 'TDEE \u00D71.10\u20131.20', sub: 'add Profile for kcal' };
  const cards = [{ label: 'Protein', val: `${g.pLow}\u2013${g.pHigh}g`, sub: '1.6\u20132.2 g/kg' }, { label: 'Fat', val: `${g.fLow}\u2013${g.fHigh}g`, sub: '0.5\u20131.5 g/kg' },
    { label: 'Carbs', val: `${g.cLow}\u2013${g.cHigh}g+`, sub: '\u22653\u20135 g/kg' }, kcal, { label: 'Weekly Gain', val: `${g.gainLow}\u2013${g.gainHigh}kg`, sub: '0.25\u20130.50%/wk' }];
  const weightLine = g.usingExample ? 'Using an example bodyweight of 70 kg \u2014 log your weight in Today to personalize these numbers.' : `Based on your last logged weight: ${g.w} kg (${MONTHS[entry.m].slice(0, 3)} ${entry.d}, ${entry.y}).`;
  const tdeeLine = g.hasProfile ? `Estimated TDEE ~${fmtInt(g.tdee)} kcal/day (Mifflin-St Jeor, from your Profile).` : 'Add your height, age & activity level under Settings \u2192 Profile to see a personalized calorie target.';
  return { cards, notes: [weightLine, tdeeLine], needsProfile: !g.hasProfile, usingExample: g.usingExample };
}
