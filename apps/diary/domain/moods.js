export const MOODS = [
  { v: 1, emoji: '😞', label: 'Rough' },
  { v: 2, emoji: '😕', label: 'Meh' },
  { v: 3, emoji: '😐', label: 'Okay' },
  { v: 4, emoji: '🙂', label: 'Good' },
  { v: 5, emoji: '😄', label: 'Great' }
];
export const normalizeMood = v => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
export const moodOf = v => MOODS.find(m => m.v === v) || null;
