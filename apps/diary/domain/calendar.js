// Pure calendar maths: month grid, streaks, "on this day", month stats. Dates are local 'YYYY-MM-DD' keys.
const pad = n => String(n).padStart(2, '0');
export const dateKey = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const dayNo = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };   // DST-proof

export function entriesByDay(entries) {
  const map = new Map();
  for (const e of entries) { const k = e.datetime.slice(0, 10); (map.get(k) || map.set(k, []).get(k)).push(e); }
  return map;
}

/** Day the week starts on: 0 = Sunday … 6 = Saturday. Bangladesh weeks start on Saturday. */
export const WEEK_START = 6;

/** Weeks covering the month, starting on `weekStart`: [[{key, day, inMonth, count, today}, …7], …] */
export function monthGrid(y, m0, byDay, todayKey, weekStart = WEEK_START) {
  const lead = (new Date(y, m0, 1).getDay() - weekStart + 7) % 7;
  const days = new Date(y, m0 + 1, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(y, m0, 1 - lead + i);
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    const list = byDay.get(key) || [];
    const cell = { key, day: d.getDate(), inMonth: d.getMonth() === m0, count: list.length, starred: list.some(e => e.starred), today: key === todayKey };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/** current: consecutive days with an entry ending today (or yesterday, so the streak is alive until midnight). */
export function streaks(dayKeys, todayKey) {
  const set = new Set([...dayKeys].map(dayNo));
  let n = dayNo(todayKey);
  if (!set.has(n)) n--;
  let current = 0;
  while (set.has(n)) { current++; n--; }
  const sorted = [...set].sort((a, b) => a - b);
  let longest = 0, run = 0, prev = null;
  for (const x of sorted) { run = prev !== null && x === prev + 1 ? run + 1 : 1; if (run > longest) longest = run; prev = x; }
  return { current, longest };
}

/** Entries written on today's month+day in earlier years, newest year first. */
export function onThisDay(entries, todayKey) {
  const md = todayKey.slice(5), yr = todayKey.slice(0, 4);
  return entries.filter(e => e.datetime.slice(5, 10) === md && e.datetime.slice(0, 4) < yr)
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
}

export function monthStats(entries, monthKey) {
  const inMonth = entries.filter(e => e.datetime.startsWith(monthKey));
  const words = inMonth.reduce((n, e) => n + e.sections.reduce((m, s) => { const t = s.content.trim(); return m + (t ? t.split(/\s+/).length : 0); }, 0), 0);
  return { entries: inMonth.length, words, days: new Set(inMonth.map(e => e.datetime.slice(0, 10))).size };
}
