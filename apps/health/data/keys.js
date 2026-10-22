// Every storage key / Firestore path, in one place. Names are IDENTICAL to the legacy Health Tracker (ht.js),
// so the old and the new app read and write the same data.
export const K = { metrics: 'ht_metrics_v1', goals: 'ht_goals_v1', profile: 'ht_profile_v1' };
export const NEW_KEYS = { outbox: 'ht2_outbox_v1' };            // new, ignored by the old app
export const META = { settings: 'healthtracker_meta/settings' };  // one combined doc: { metrics, goals, profile }
export const DAY_COLLECTION = 'healthtracker';
export const DAY_RE = /^ht_(\d+)_(\d+)_(\d+)$/;
export const dayLocalKey = (y, m0, d) => `ht_${y}_${m0 + 1}_${d}`;   // month is 1-based in the key (legacy)
export const dayId = (y, m0, d) => `${y}_${m0 + 1}_${d}`;
export const dayPath = (y, m0, d) => `${DAY_COLLECTION}/${dayId(y, m0, d)}`;
export const parseDayKey = k => { const m = DAY_RE.exec(k); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
export const parseDayId = id => parseDayKey('ht_' + id);
