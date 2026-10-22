import { h } from '../../shared/dom.js';
import { fmt } from '../../shared/fmt.js';
import { openSheet } from '../../shared/sheet.js';
import { insightsModel, categoryDrillModel } from '../domain/viewmodels.js';
import { shiftMonth } from '../domain/insights.js';
import { barChart } from '../components/charts.js';
import { icon } from '../icons.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], short = m0 => MONTHS[m0].slice(0, 3);
const money = n => fmt(Math.round(n * 100) / 100), whole = n => fmt(Math.round(n));
const dayLabel = (y, m0, d) => new Date(y, m0, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const pctText = n => `${Math.round(n)}%`;
// For spending, "up" is bad and "down" is good. Words, not only colour.
const deltaNode = (d, prevLabel) => Math.abs(d) < 0.005 ? h('span', { class: 'card__sub' }, `same as ${prevLabel}`)
  : h('span', { class: 'card__sub ' + (d > 0 ? 'money-out' : 'money-in') }, `${d > 0 ? 'up' : 'down'} ${money(Math.abs(d))} vs ${prevLabel}`);

function openDrill(app, m, cat) {
  const dr = categoryDrillModel(app.repo, m.y, m.m0, cat.id), title = `${cat.icon || ''} ${cat.label}`.trim(), month = `${MONTHS[m.m0]} ${m.y}`;
  const chart = barChart({ groups: dr.daily.map(v => [v]), colors: ['var(--err)'], labels: dr.daily.map((_, i) => String(i + 1)), showLabel: i => i === 0 || (i + 1) % 5 === 0,
    label: `${cat.label} per day in ${month}` });
  const list = dr.entries.length ? h('div', { class: 'elist' }, dr.entries.map(e => h('div', { class: 'erow erow--static' },
    h('span', { class: 'erow__main' }, h('span', { class: 'erow__label' }, dayLabel(m.y, m.m0, e.d)), h('span', { class: 'erow__sub' }, [e.note, e.acctLabel].filter(Boolean).join(' \u00B7 ') || '\u00A0')),
    h('span', { class: 'erow__amt num money-out' }, fmt(-e.amt, { sign: true }))))) : h('p', { class: 'empty' }, 'No entries.');
  openSheet({ title, content: h('div', { class: 'add' }, h('p', { class: 'card__sub' }, month),
    h('p', { class: 'big num' }, money(dr.total)), h('p', { class: 'card__sub' }, `${dr.count} ${dr.count === 1 ? 'entry' : 'entries'} on ${dr.activeDays} ${dr.activeDays === 1 ? 'day' : 'days'}`), chart, list) });
}

export function insightsView(el, app) {
  const now = new Date(), st = app.state.insights ||= { y: now.getFullYear(), m0: now.getMonth() };
  const rerender = () => insightsView(el, app), step = n => { Object.assign(st, shiftMonth(st.y, st.m0, n)); rerender(); };
  const m = insightsModel(app.repo, st.y, st.m0, now), prevLabel = short(m.prev.m0), isCur = st.y === now.getFullYear() && st.m0 === now.getMonth();
  const nav = h('div', { class: 'hnav' }, h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Previous month', html: icon('left'), onclick: () => step(-1) }),
    h('h2', { class: 'hnav__t', 'aria-live': 'polite' }, `${MONTHS[st.m0]} ${st.y}`), h('button', { class: 'ui-icon-btn', type: 'button', 'aria-label': 'Next month', html: icon('right'), onclick: () => step(1) }));
  if (!m.hasData) return el.replaceChildren(h('div', { class: 'hhead' }, nav), h('p', { class: 'empty' }, `No income or expense recorded in ${MONTHS[st.m0]} ${st.y}. ${isCur ? 'Tap + to add one.' : 'Try another month.'}`));

  const summary = h('section', { class: 'card', 'aria-label': 'Month summary' },
    h('div', { class: 'card--row card__plain' }, h('div', {}, h('div', { class: 'card__sub' }, 'Income'), h('div', { class: 'num money-in' }, fmt(m.inc, { sign: true }))),
      h('div', {}, h('div', { class: 'card__sub' }, 'Expense'), h('div', { class: 'num money-out' }, fmt(-m.exp, { sign: true }))), h('div', {}, h('div', { class: 'card__sub' }, 'Net'), h('div', { class: 'num' }, fmt(m.net, { sign: true })))),
    m.savingsRate != null && h('p', { class: 'card__p' }, m.savingsRate >= 0 ? `You kept ${pctText(m.savingsRate * 100)} of your income.` : `You spent ${pctText(-m.savingsRate * 100)} more than you earned.`),
    m.vsPrev ? h('p', {}, 'Spending ', deltaNode(m.vsPrev.exp, prevLabel), m.vsPrev.pct != null && h('span', { class: 'card__sub' }, ` (${m.vsPrev.pct > 0 ? '+' : m.vsPrev.pct < 0 ? '\u2212' : ''}${pctText(Math.abs(m.vsPrev.pct))})`)) : h('p', { class: 'card__sub' }, `Nothing recorded in ${prevLabel} to compare with.`));

  const dailyChart = barChart({ groups: m.daily.map(v => [v]), colors: ['var(--err)'], labels: m.daily.map((_, i) => String(i + 1)), showLabel: i => i === 0 || (i + 1) % 5 === 0, avg: m.avgPerDay,
    label: `Spending per day in ${MONTHS[st.m0]}. Average ${whole(m.avgPerDay)} per day.` });
  const days = h('section', { class: 'card', 'aria-labelledby': 'ins-days' }, h('h2', { id: 'ins-days', class: 'card__h' }, 'Spending by day'), dailyChart,
    h('p', { class: 'card__sub' }, `Dashed line: average ${whole(m.avgPerDay)} per ${isCur ? 'day so far' : 'day'}.`),
    m.top && h('p', { class: 'card__p' }, `Highest day: ${money(m.top.amt)} on ${dayLabel(st.y, st.m0, m.top.day)}.`),
    m.elapsed > 0 && h('p', { class: 'card__p' }, `${m.noSpendDays} of ${m.elapsed} ${m.elapsed === 1 ? 'day' : 'days'} with no spending.`),
    m.forecast != null && h('p', { class: 'card__p' }, `At this pace, ${MONTHS[st.m0]} ends near ${whole(m.forecast)} in spending.`));

  // Top categories comparison chart (Current vs Previous month)
  const compCategories = m.categories.slice(0, 5);
  const showCompChart = m.prev.has && compCategories.length > 0;
  const compChart = showCompChart ? h('div', { style: 'margin-bottom:8px' },
    barChart({
      groups: compCategories.map(c => [c.prev || 0, c.total || 0]),
      colors: ['var(--soft)', 'var(--err)'],
      labels: compCategories.map(c => (c.label.length > 8 ? c.label.slice(0, 7) + '…' : c.label)),
      label: `Category spending: ${prevLabel} vs ${short(st.m0)}`
    }),
    h('p', { class: 'legend card__sub', style: 'justify-content:center;margin-top:4px' },
      h('span', { class: 'sw', style: 'background:var(--soft)' }), ` ${prevLabel}  `,
      h('span', { class: 'sw sw--out' }), ` ${short(st.m0)}`
    )
  ) : null;

  const cats = h('section', { class: 'card', 'aria-labelledby': 'ins-cats' }, h('h2', { id: 'ins-cats', class: 'card__h' }, 'Where it went'),
    compChart,
    m.categories.length ? h('div', { class: 'elist' }, m.categories.map(c => h('button', { type: 'button', class: 'crow', 'aria-label': `${c.label}: ${money(c.total)}, ${pctText(c.share)} of spending. Show details.`, onclick: () => openDrill(app, m, c) },
      h('span', { class: 'brow__top' }, h('span', {}, `${c.icon || ''} ${c.label}`), h('span', { class: 'num' }, money(c.total))),
      h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'bar__fill', style: `width:${Math.max(2, c.share)}%` })),
      h('span', { class: 'crow__sub' }, h('span', { class: 'card__sub' }, `${pctText(c.share)} of spending`), m.prev.has && deltaNode(c.delta, prevLabel))))) : h('p', { class: 'card__p' }, 'No expenses this month.'));

  const trend = h('section', { class: 'card', 'aria-labelledby': 'ins-trend' }, h('h2', { id: 'ins-trend', class: 'card__h' }, `Last ${m.trend.length} months`),
    barChart({ groups: m.trend.map(t => [t.inc, t.exp]), colors: ['var(--ok)', 'var(--err)'], labels: m.trend.map(t => short(t.m0)), label: 'Income and expense by month: ' + m.trend.map(t => `${short(t.m0)} income ${money(t.inc)}, expense ${money(t.exp)}`).join('; ') }),
    h('p', { class: 'legend card__sub' }, h('span', { class: 'sw sw--in' }), ' Income  ', h('span', { class: 'sw sw--out' }), ' Expense'));

  const big = m.biggest.length && h('section', { class: 'card', 'aria-labelledby': 'ins-big' }, h('h2', { id: 'ins-big', class: 'card__h' }, 'Biggest expenses'),
    h('div', { class: 'elist' }, m.biggest.map(b => h('div', { class: 'erow erow--static' }, h('span', { class: 'erow__icon', 'aria-hidden': 'true' }, b.icon || ''),
      h('span', { class: 'erow__main' }, h('span', { class: 'erow__label' }, b.label), h('span', { class: 'erow__sub' }, [dayLabel(st.y, st.m0, b.d), b.note].filter(Boolean).join(' \u00B7 '))),
      h('span', { class: 'erow__amt num money-out' }, fmt(-b.amt, { sign: true }))))));

  el.replaceChildren(h('div', { class: 'hhead' }, nav), summary, days, cats, trend, big);
}
