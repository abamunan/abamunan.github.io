import { h } from '../../shared/dom.js';
import { MOODS, MONTHS } from '../data/defaults.js';
import { calcMonth, avg, last } from '../domain/stats.js';
import * as I from '../domain/insights.js';
import { lineChart } from '../components/charts.js';
import { icon } from '../icons.js';

const TABS = [['overview', 'Overview'], ['streaks', 'Streaks'], ['trends', 'Trends'], ['forecast', 'Forecast']];
const TREND_IDS = ['weight', 'hr', 'sugar', 'sleep', 'water', 'steps'];
const short = (y, m, d) => `${MONTHS[m].slice(0, 3)} ${d}`;
const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', { class: 'card__h' }, title), ...kids);
const empty = t => h('p', { class: 'empty' }, t);
const goalsBtn = (app, label) => h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: () => app.openSettings('goals') }, label);
const stat = (label, val, sub) => h('div', { class: 'stat' }, h('div', { class: 'card__sub' }, label), h('div', { class: 'stat__v num' }, val), h('div', { class: 'card__sub' }, sub));
const barRow = (label, pct, val) => h('div', { class: 'brow' }, h('div', { class: 'brow__top' }, h('span', {}, label), h('span', { class: 'num' }, val)),
  h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label }, h('span', { class: 'bar__fill', style: `width:${Math.max(3, pct)}%` })));

export function insightsView(el, app) {
  const { repo } = app, now = new Date(), st = app.state.insights ||= { tab: 'overview', y: now.getFullYear(), m0: now.getMonth(), metric: 'weight' };
  const rerender = () => insightsView(el, app), metrics = repo.state.metrics, goals = repo.state.goals, days = repo.listDays(), getDay = (y, m, d) => repo.getDay(y, m, d);
  const step = n => { st.m0 += n; if (st.m0 < 0) { st.m0 = 11; st.y--; } if (st.m0 > 11) { st.m0 = 0; st.y++; } rerender(); };
  const monthNav = () => h('div', { class: 'hnav' }, h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Previous month', html: icon('left'), onclick: () => step(-1) }),
    h('h2', { class: 'hnav__t', 'aria-live': 'polite' }, `${MONTHS[st.m0]} ${st.y}`), h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Next month', html: icon('right'), onclick: () => step(1) }));
  const seg = h('div', { class: 'seg seg--4', role: 'group', 'aria-label': 'Insights section' }, TABS.map(([k, l]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(st.tab === k), onclick: () => { st.tab = k; rerender(); } }, l)));
  const mc = calcMonth(getDay, st.y, st.m0, metrics);
  let body = [];

  if (st.tab === 'overview') {
    const streak = I.loggingStreak(days, metrics, now), water = I.waterStreak(days, goals.water || 0, now);
    const cur = calcMonth(getDay, now.getFullYear(), now.getMonth(), metrics);                      // tips always describe the current month, like the legacy app
    const tips = I.tips({ streak, latestWeight: last(cur.weights), avgSleep: avg(cur.sleeps), goals });
    const gp = I.goalProgress(mc, goals), pm = st.m0 === 0 ? { y: st.y - 1, m: 11 } : { y: st.y, m: st.m0 - 1 }, cmp = I.monthComparison(mc, calcMonth(getDay, pm.y, pm.m, metrics));
    body = [monthNav(),
      h('div', { class: 'tips' }, tips.map(t => h('p', { class: 'tip' }, t.text))),
      card('Streak glance', h('div', { class: 'stats' }, stat('Logging streak', `${streak.current} \uD83D\uDD25`, `Best: ${streak.best} days`), stat('Water streak', water.hasGoal ? `${water.current} \uD83D\uDCA7` : '\u2013', water.hasGoal ? `Best: ${water.best} days` : 'No water goal set'))),
      card('Goal progress', gp.length ? h('div', {}, gp.map(g => g.have == null ? h('p', { class: 'card__sub' }, `${g.icon} ${g.label}: no data this month`) : barRow(`${g.icon} ${g.label}`, g.pct, `${Math.round(g.have * 10) / 10} / ${g.target}${g.unit ? ' ' + g.unit : ''}`)), goalsBtn(app, 'Edit goals')) : h('div', { class: 'xgroup' }, h('p', { class: 'card__sub' }, 'No goals set yet. Weight, water, steps and sleep goals are tracked here.'), goalsBtn(app, 'Set goals'))),
      card('This month vs last month', cmp.length ? h('div', { class: 'cmp' }, cmp.map(r => h('div', { class: 'cmp__row' }, h('span', {}, `${r.icon} ${r.label}`), h('span', { class: 'num card__sub' }, r.cur != null ? `${(Math.round(r.cur * 10) / 10)}${r.unit ? ' ' + r.unit : ''}` : '\u2013'),
        r.diff == null ? h('span', { class: 'card__sub' }, 'no prior data') : h('span', { class: 'delta ' + (r.good ? 'delta--good' : 'delta--bad') }, `${r.diff > 0 ? '\u25B2 up' : r.diff < 0 ? '\u25BC down' : '\u2013 same'} ${Math.abs(Math.round(r.diff * 10) / 10)}${r.unit ? ' ' + r.unit : ''}`)))) : h('p', { class: 'card__sub' }, 'Not enough data yet to compare months.'))];
  } else if (st.tab === 'streaks') {
    const streak = I.loggingStreak(days, metrics, now), water = I.waterStreak(days, goals.water || 0, now), active = I.activeDays(days, now), meds = I.medsAdherence(days), hm = I.heatmap(getDay, metrics, st.y, st.m0, now), mf = I.moodFrequency(days);
    body = [h('div', { class: 'stats stats--4' }, stat('Logging streak', `${streak.current} days`, `Best ever: ${streak.best}`), stat('Water streak', water.hasGoal ? `${water.current} days` : '\u2013', water.hasGoal ? `Best: ${water.best}` : 'No water goal set'),
        stat('Active days', `${active}/30`, 'Days with steps logged'), stat('Medication', meds == null ? '\u2013' : meds + '%', meds == null ? 'No meds tracked yet' : 'Adherence, all-time')),
      monthNav(),
      card(`Logging heatmap`, hm.any ? h('div', {}, h('div', { class: 'hm', role: 'grid', 'aria-label': `Days logged in ${MONTHS[st.m0]} ${st.y}` },
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(l => h('div', { class: 'hm__dow', 'aria-hidden': 'true' }, l)), Array.from({ length: hm.lead }, () => h('div', { 'aria-hidden': 'true' })),
        hm.cells.map(c => h('button', { type: 'button', class: 'hm__c' + (c.has ? ' is-on' : '') + (c.today ? ' is-today' : '') + (c.future ? ' is-future' : ''), 'aria-label': `${MONTHS[st.m0]} ${c.d}: ${c.has ? 'logged' : 'not logged'}`, onclick: () => app.openDay(st.y, st.m0, c.d) }, String(c.d)))),
        h('p', { class: 'card__sub' }, 'Filled = a day you logged something. Tap a day to open it.')) : empty(`No days logged in ${MONTHS[st.m0]} yet.`)),
      card('Mood frequency (all time)', mf.total ? h('div', {}, mf.rows.map(r => barRow(`${r.icon} ${r.label}`, r.pct, `${r.count} \u00B7 ${r.pct}%`))) : h('p', { class: 'card__sub' }, 'No moods logged yet.'))];
  } else if (st.tab === 'trends') {
    const ids = TREND_IDS.filter(id => metrics.some(m => m.id === id)); if (!ids.includes(st.metric)) st.metric = ids[0];
    const m = metrics.find(x => x.id === st.metric), pts = m ? I.metricSeries(days, m.id) : [];
    const chips = h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': 'Metric' }, ids.map(id => { const mm = metrics.find(x => x.id === id); return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(id === st.metric), onclick: () => { st.metric = id; rerender(); } }, `${mm.icon} ${mm.label}`); }));
    const bw = I.bestWorstMonths(getDay, metrics, st.y, st.m0);
    body = [chips, card(m ? (pts.length ? `${m.label}: last ${pts.length} readings` : m.label) : 'Trend', pts.length ? h('div', {}, lineChart({ points: pts.map(p => ({ label: short(p.y, p.m, p.d), v: p.v })), rolling: I.rollingAvg(pts.map(p => p.v), 7), unit: m.unit, label: m.label }),
        h('p', { class: 'card__sub' }, 'Thin line: each reading. Thick line: 7-reading average.')) : empty('No data logged for this metric yet.')),
      monthNav(), card(`Best months (up to ${MONTHS[st.m0]} ${st.y})`, !bw.enough ? h('p', { class: 'card__sub' }, 'Log data in at least two months to compare.') : h('div', { class: 'cmp' },
        bw.mostActive ? h('div', { class: 'cmp__row' }, h('span', {}, '\uD83D\uDC63 Most active'), h('span', { class: 'card__sub' }, `${MONTHS[bw.mostActive.mo]} ${bw.mostActive.y}`), h('span', { class: 'num' }, String(Math.round(bw.mostActive.steps)))) : null,
        bw.bestSleep ? h('div', { class: 'cmp__row' }, h('span', {}, '\uD83D\uDE34 Best sleep'), h('span', { class: 'card__sub' }, `${MONTHS[bw.bestSleep.mo]} ${bw.bestSleep.y}`), h('span', { class: 'num' }, `${bw.bestSleep.sleep.toFixed(1)} hrs`)) : null,
        !bw.mostActive && !bw.bestSleep ? h('p', { class: 'card__sub' }, 'Not enough data yet.') : null))];
  } else {
    const f = I.weightForecast(days, goals.weight || 0, now), fmtD = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    let fb;
    if (f.state === 'need-goal') fb = h('div', { class: 'xgroup' }, h('p', { class: 'card__sub' }, 'Set a target weight to see a forecast.'), goalsBtn(app, 'Set a weight goal'));
    else if (f.state === 'need-data') fb = h('p', { class: 'card__sub' }, 'Log weight on at least 3 days to forecast a trend.');
    else if (f.state === 'at-goal') fb = h('p', { class: 'tip' }, `You're at your goal weight (${f.current.toFixed(1)} kg).`);
    else fb = h('div', { class: 'cmp' }, h('div', { class: 'cmp__row' }, h('span', {}, 'Current'), h('span', { class: 'num' }, `${f.current.toFixed(1)} kg`)), h('div', { class: 'cmp__row' }, h('span', {}, 'Target'), h('span', { class: 'num' }, `${f.target} kg`)),
      h('div', { class: 'cmp__row' }, h('span', {}, 'Trend'), h('span', { class: 'num' }, `${f.slopePerWeek >= 0 ? '+' : ''}${f.slopePerWeek.toFixed(2)} kg/week`)),
      f.state === 'on-track' ? h('p', { class: 'card__p' }, `At this pace you would reach your goal around ${fmtD(f.projDate)} (about ${f.daysToGoal} days).`) : h('p', { class: 'card__sub' }, "Your recent trend isn't moving toward your goal yet, so there is no reliable forecast."));
    const corr = (title, a, b, o, note) => { const c = I.correlation(days, a, b, o);
      return card(title, c.r == null ? h('p', { class: 'card__sub' }, 'Needs more overlapping data (at least 3 days with both logged).') : h('div', {}, barRow('Correlation', c.pct, c.r.toFixed(2)), h('p', { class: 'card__sub' }, `${c.n} overlapping days \u00B7 ${c.strength} ${c.direction} relationship. ${note}`.trim()))); };
    body = [card('Weight forecast', fb, h('p', { class: 'card__sub' }, 'Based on your last 30 weight readings and the real dates between them. An estimate, not a promise.')),
      corr('Sleep vs mood', 'sleep', 'mood', { bMood: true }, 'Higher sleep hours vs a higher mood score.'), corr('Water vs weight', 'water', 'weight', {}, ''), corr('Steps vs sleep', 'steps', 'sleep', {}, '')];
  }
  el.replaceChildren(h('div', { class: 'hhead' }, seg), ...body);
}
