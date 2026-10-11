// Nutrition guide text, copied literally from the legacy healthtracker.html Guide tab (no logic here, so it is safe to edit as plain data).
// Numbers that depend on the person (macros, calories) are NOT here: see guide.js.
export const GUIDE_DISCLAIMER = 'General nutrition & training reference based on published research \u2014 not personalized medical advice. Check with a doctor before starting a new program.';
export const SURPLUS_TEXT = 'Target intake = TDEE \u00D7 1.10\u20131.20 \u2014 a 250\u2013500 kcal/day surplus. This supports roughly 0.25\u20130.50% bodyweight gain per week, mostly as muscle when paired with resistance training.';
// Cost per 20 g of protein in Dhaka, cheapest first.
export const FOODS = [
  { icon: '\uD83E\uDED8', name: 'Soya Chunks', sub: '50g protein / 100g', cost: '\u09F36\u201312', best: true },
  { icon: '\uD83E\uDDC6', name: 'Chickpeas (Chola Boot)', sub: '19g protein / 100g', cost: '\u09F311\u201321' },
  { icon: '\uD83E\uDD5C', name: 'Raw Peanuts (China Badam)', sub: '25g protein / 100g', cost: '\u09F319\u201322' },
  { icon: '\uD83C\uDF57', name: 'Farm Chicken (Broiler)', sub: '18g protein / 100g', cost: '\u09F321\u201324' },
  { icon: '\uD83E\uDD5A', name: 'Chicken Eggs (Layer)', sub: '12.6g protein / egg', cost: '\u09F331\u201336' },
  { icon: '\uD83D\uDC1F', name: 'Cultured Pangas', sub: '15g protein / 100g', cost: '\u09F340\u201353' },
  { icon: '\uD83D\uDC20', name: 'Cultured Tilapia', sub: '16g protein / 100g', cost: '\u09F341\u201359' },
  { icon: '\uD83C\uDFA3', name: 'Cultured Rui / Rohu', sub: '17g protein / 100g', cost: '\u09F344\u201356' }
];
export const FOODS_NOTE = 'Soya and every animal source above (egg, chicken, fish) are complete proteins. Legumes like chickpeas are low in methionine \u2014 pair with rice/wheat or an egg to cover all essential amino acids.';
export const MEALS_SUB = '~70kg target, 1.8g/kg protein';
export const MEALS = [
  { title: '\uD83C\uDF73 Breakfast \u00B7 8:00 AM', cost: '\u09F345\u201355', food: '3 whole eggs (boiled/fried), 2 roti (lal atta), 1 banana (sagor kola)', macro: '~30g protein \u00B7 ~65g carbs \u00B7 ~16g fat \u00B7 ~500 kcal' },
  { title: '\uD83C\uDF5B Lunch \u00B7 1:00 PM', cost: '\u09F350\u201365', food: '100g pangas/tilapia curry, 250g parboiled rice, 50g cooked musur dal', macro: '~32g protein \u00B7 ~85g carbs \u00B7 ~12g fat \u00B7 ~650 kcal' },
  { title: '\uD83E\uDD64 Post-Workout Snack \u00B7 5:00 PM', cost: '\u09F325\u201335', food: '50g soya chunks (boiled & seasoned), 50g raw/roasted peanuts', macro: '~37g protein \u00B7 ~30g carbs \u00B7 ~25g fat \u00B7 ~520 kcal' },
  { title: '\uD83C\uDF7D\uFE0F Dinner \u00B7 9:00 PM', cost: '\u09F350\u201365', food: '100g broiler chicken or cultured rui, 200g parboiled rice, mixed salad', macro: '~27g protein \u00B7 ~60g carbs \u00B7 ~10g fat \u00B7 ~550 kcal' }
];
export const MEALS_TOTAL = { label: 'Daily total', value: '~126g protein \u00B7 2,220\u20132,420 kcal \u00B7 \u09F3170\u2013220' };
export const MEAL_TIP = 'Spread 20\u201340g protein across meals every 3\u20134 hours to repeatedly hit the leucine threshold \u2014 3\u20134 meals a day beats one or two big ones.';
export const TRAINING = [
  { label: 'Weekly Volume', val: '10\u201320', sub: 'sets / muscle / week' }, { label: 'Load & Reps', val: '60\u201380%', sub: '1RM \u00B7 8\u201312 reps' },
  { label: 'Prox. to Failure', val: '1\u20133', sub: 'reps in reserve' }, { label: 'Frequency', val: '2\u20133\u00D7', sub: 'per muscle / week' }
];
export const LIFTS = { title: 'Compound Lifts vs. Bodyweight', text: 'Favor multi-joint compound lifts \u2014 squats, deadlifts, bench press, overhead press, rows \u2014 when you have gym access; they recruit the most muscle per set. No gym? Dumbbells, resistance bands, or bodyweight moves (weighted push-ups, inverted rows, Bulgarian split squats) work too \u2014 just train closer to failure (0\u20131 RIR) since the load is lighter.' };
export const GUIDE_FOOTNOTE = 'Ranges drawn from sports-nutrition & resistance-training research; Dhaka price data reflects wet-market & retail rates and will drift over time \u2014 check current prices before budgeting.';
