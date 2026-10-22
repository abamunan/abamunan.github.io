// Metric definitions, copied literally from ht.js. `type` drives rendering/collection:
//  number | bp (stored as id_sys / id_dia) | scale (1-5) | mood | checklist (id_items) | text
export const DEFAULT_METRICS = [
  { id: 'weight', label: 'Weight', icon: '\u2696\uFE0F', type: 'number', unit: 'kg', group: 'body', pinned: true, step: 0.1 },
  { id: 'bp', label: 'Blood Pressure', icon: '\uD83E\uDE78', type: 'bp', unit: 'mmHg', group: 'vitals', pinned: true },
  { id: 'hr', label: 'Heart Rate', icon: '\u2764\uFE0F', type: 'number', unit: 'bpm', group: 'vitals', pinned: true, step: 1 },
  { id: 'sugar', label: 'Blood Sugar', icon: '\uD83E\uDE79', type: 'number', unit: 'mg/dL', group: 'vitals', pinned: false, step: 1 },
  { id: 'sleep', label: 'Sleep', icon: '\uD83D\uDE34', type: 'number', unit: 'hrs', group: 'lifestyle', pinned: true, step: 0.5 },
  { id: 'sleepq', label: 'Sleep Quality', icon: '\uD83C\uDF19', type: 'scale', unit: '', group: 'lifestyle', pinned: false },
  { id: 'water', label: 'Water', icon: '\uD83D\uDCA7', type: 'number', unit: 'L', group: 'lifestyle', pinned: true, step: 0.1 },
  { id: 'steps', label: 'Steps', icon: '\uD83D\uDC63', type: 'number', unit: 'steps', group: 'activity', pinned: true, step: 100 },
  { id: 'calin', label: 'Calories In', icon: '\uD83C\uDF7D\uFE0F', type: 'number', unit: 'kcal', group: 'activity', pinned: false, step: 10 },
  { id: 'calout', label: 'Calories Out', icon: '\uD83D\uDD25', type: 'number', unit: 'kcal', group: 'activity', pinned: false, step: 10 },
  { id: 'mood', label: 'Mood', icon: '\uD83D\uDE42', type: 'mood', unit: '', group: 'mind', pinned: true },
  { id: 'meds', label: 'Medications', icon: '\uD83D\uDC8A', type: 'checklist', unit: '', group: 'mind', pinned: false }
];
export const MOODS = [
  { id: 'great', icon: '\uD83D\uDE04', label: 'Great' }, { id: 'good', icon: '\uD83D\uDE42', label: 'Good' }, { id: 'okay', icon: '\uD83D\uDE10', label: 'Okay' },
  { id: 'low', icon: '\uD83D\uDE15', label: 'Low' }, { id: 'bad', icon: '\uD83D\uDE23', label: 'Bad' }
];
export const DEFAULT_PINNED_IDS = DEFAULT_METRICS.filter(m => m.pinned).map(m => m.id);
export const DEFAULT_PROFILE = { height: 0, age: 0, sex: 'male', activity: 1.375 };
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
