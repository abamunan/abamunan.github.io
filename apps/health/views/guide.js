import { h } from '../../shared/dom.js';
import { guideModel } from '../domain/guide.js';
import * as C from '../domain/guide-content.js';
import { openSettingsSheet } from '../components/settings-sheet.js';

const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', { class: 'card__h' }, title), ...kids);
const stat = s => h('div', { class: 'stat' }, h('div', { class: 'card__sub' }, s.label), h('div', { class: 'stat__v num' }, s.val), h('div', { class: 'card__sub' }, s.sub));

// Read-only reference. Only the five cards in "Energy & macro targets" depend on the person (last logged weight + Profile).
export function guideView(el, app) {
  const m = guideModel(app.repo.listDays(), app.repo.state.profile);
  el.replaceChildren(
    h('div', { class: 'hhead' }, h('h2', { class: 'hnav__t' }, 'Guide'), h('p', { class: 'card__sub' }, 'Lean mass & healthy weight gain, on a Dhaka budget')),
    h('p', { class: 'tip tip--note', role: 'note' }, C.GUIDE_DISCLAIMER),
    card('Energy & macro targets', h('p', { class: 'card__p' }, C.SURPLUS_TEXT), h('div', { class: 'stats', 'data-guide': 'macros' }, m.cards.map(stat)),
      h('p', { class: 'card__sub', 'data-guide': 'weight-note' }, m.notes[0]), h('p', { class: 'card__sub', 'data-guide': 'tdee-note' }, m.notes[1]),
      m.needsProfile && h('button', { type: 'button', class: 'ui-btn ui-btn--ghost', onclick: () => openSettingsSheet(app, 'profile') }, 'Add height, age & activity')),
    card('Cost per 20g protein', h('p', { class: 'card__sub' }, 'Dhaka prices, cheapest first'),
      h('div', { class: 'foods' }, C.FOODS.map(f => h('div', { class: 'food' }, h('span', { class: 'food__ic', 'aria-hidden': 'true' }, f.icon),
        h('div', { class: 'food__m' }, h('div', { class: 'food__n' }, f.name, f.best && h('span', { class: 'badge' }, 'Best value')), h('div', { class: 'card__sub' }, f.sub)), h('span', { class: 'food__c num' }, f.cost)))),
      h('p', { class: 'card__sub' }, C.FOODS_NOTE)),
    card('Sample meal plan', h('p', { class: 'card__sub' }, C.MEALS_SUB),
      h('div', { class: 'meals' }, C.MEALS.map(x => h('div', { class: 'meal' }, h('div', { class: 'meal__h' }, h('span', {}, x.title), h('span', { class: 'num' }, x.cost)), h('div', {}, x.food), h('div', { class: 'card__sub' }, x.macro)))),
      h('div', { class: 'meal__total' }, h('span', {}, C.MEALS_TOTAL.label), h('span', { class: 'num' }, C.MEALS_TOTAL.value))),
    h('p', { class: 'tip' }, C.MEAL_TIP),
    card('Training targets', h('div', { class: 'stats' }, C.TRAINING.map(stat))),
    card(C.LIFTS.title, h('p', { class: 'card__p' }, C.LIFTS.text)),
    h('p', { class: 'card__sub' }, C.GUIDE_FOOTNOTE));
}
