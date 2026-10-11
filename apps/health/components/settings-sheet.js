import { h } from '../../shared/dom.js';
import { toast } from '../../shared/toast.js';
import { confirmDialog } from '../../shared/confirm.js';
import { openSheet } from '../../shared/sheet.js';
import { goalableMetrics, activeGoals } from '../domain/metrics.js';
import { icon } from '../icons.js';

export const SETTINGS_TABS = [['metrics', 'Metrics'], ['goals', 'Goals'], ['profile', 'Profile']];
export const ACTIVITY_LEVELS = [[1.2, 'Sedentary'], [1.375, 'Light'], [1.55, 'Moderate'], [1.725, 'Active'], [1.9, 'Very active']];   // same five levels as the legacy Profile
const fail = e => toast(e?.message || 'Something went wrong', { error: true });

// Metrics / Goals / Profile in one bottom sheet. Every change is saved at once through the repo (local + cloud outbox).
// The screen behind is redrawn once, when the sheet closes and something actually changed.
export function openSettingsSheet(app, tab = 'metrics') {
  const { repo } = app; let dirty = false, current = SETTINGS_TABS.some(([k]) => k === tab) ? tab : 'metrics';
  const body = h('div', { class: 'hpick' }), pane = h('div', { class: 'spane' });
  const sheet = openSheet({ title: 'Settings', content: body, onClose: () => { if (dirty) app.refresh(); } });
  const changed = () => { dirty = true; };

  // ---- Metrics ----
  function metricsPane() {
    const list = h('div', { class: 'slist' }), iconIn = h('input', { class: 'ui-input srow__icon', maxlength: '4', placeholder: '\uD83C\uDFAF', 'aria-label': 'New metric icon' });
    const nameIn = h('input', { class: 'ui-input srow__label', maxlength: '30', placeholder: 'New metric name', 'aria-label': 'New metric name', autocomplete: 'off' });
    const paint = () => list.replaceChildren(...repo.state.metrics.map(row));
    function row(m) {
      const pin = h('button', { type: 'button', class: 'ui-icon-btn pinbtn', 'aria-pressed': String(!!m.pinned), 'aria-label': `${m.label}: ${m.pinned ? 'shown in Today every day. Tap to unpin' : 'hidden unless used. Tap to pin'}`, html: icon('star', 20),
        onclick: () => { try { repo.metrics.togglePin(m.id); changed(); const now = repo.state.metrics.find(x => x.id === m.id); toast(now?.pinned ? 'Pinned: shown every day' : 'Unpinned: hidden unless used'); paint(); } catch (e) { fail(e); } } });
      const ic = h('input', { class: 'ui-input srow__icon', value: m.icon, maxlength: '4', 'aria-label': `Icon for ${m.label}` });
      ic.addEventListener('change', () => { try { repo.metrics.update(m.id, { icon: ic.value }); changed(); } catch (e) { fail(e); paint(); } });   // no repaint on success: it would swallow the tap that caused this blur
      const lb = h('input', { class: 'ui-input srow__label', value: m.label, maxlength: '30', 'aria-label': `Name of ${m.label}`, autocomplete: 'off' });
      lb.addEventListener('change', () => { if (!lb.value.trim()) { toast('A metric needs a name', { error: true }); return paint(); } try { repo.metrics.update(m.id, { label: lb.value }); changed(); } catch (e) { fail(e); } });
      const del = h('button', { type: 'button', class: 'ui-icon-btn', 'aria-label': `Delete ${m.label}`, html: icon('trash', 20), onclick: async () => {
        if (repo.state.metrics.length <= 1) return toast('At least one metric is required', { error: true });
        if (!await confirmDialog({ title: `Delete \u201C${m.label}\u201D?`, message: 'Numbers already saved under it stay in storage but will no longer show.', confirmLabel: 'Delete', danger: true })) return;
        try { repo.metrics.remove(m.id); changed(); toast('Metric deleted'); paint(); } catch (e) { fail(e); } } });
      return h('div', { class: 'srow', role: 'group', 'aria-label': m.label }, pin, ic, lb, del);
    }
    function add() { try { const m = repo.metrics.add({ icon: iconIn.value, label: nameIn.value }); changed(); iconIn.value = ''; nameIn.value = ''; paint(); toast(`Added \u201C${m.label}\u201D`); nameIn.focus(); } catch (e) { fail(e); } }
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paint();
    return [h('p', { class: 'card__sub' }, 'Every metric you can log per day. A pinned \u2605 metric is shown in Today every day; the others appear only on days you use them.'), list,
      h('div', { class: 'srow srow--add' }, iconIn, nameIn, h('button', { type: 'button', class: 'ui-icon-btn', 'aria-label': 'Add metric', html: icon('plus', 20), onclick: add }))];
  }

  // ---- Goals ----
  function goalsPane() {
    const list = h('div', { class: 'slist' }), addBox = h('div', {});
    const unitOf = m => (m.unit ? ' ' + m.unit : '');
    function paint() {
      const { metrics, goals } = repo.state, act = activeGoals(goals, metrics), have = new Set(act.map(([id]) => id));
      list.replaceChildren(...(act.length ? act.map(([id, val]) => { const m = metrics.find(x => x.id === id);
        const inp = h('input', { class: 'ui-input srow__num', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: String(val), 'aria-label': `Target for ${m.label}` });
        inp.addEventListener('change', () => { try { repo.goals.set(id, inp.value); changed(); toast('Goal saved'); } catch (e) { fail(e); paint(); } });
        return h('div', { class: 'srow srow--goal', role: 'group', 'aria-label': `${m.label} goal` }, h('span', { class: 'srow__ic', 'aria-hidden': 'true' }, m.icon), h('span', { class: 'srow__name' }, m.label), inp, h('span', { class: 'hunit' }, m.unit || ''),
          h('button', { type: 'button', class: 'ui-icon-btn', 'aria-label': `Remove ${m.label} goal`, html: icon('trash', 20), onclick: () => { repo.goals.remove(id); changed(); toast('Goal removed'); paint(); } }));
      }) : [h('p', { class: 'empty' }, 'No goals set yet. Pick a metric below.')]));
      const opts = goalableMetrics(metrics).filter(m => !have.has(m.id));
      if (!opts.length) return addBox.replaceChildren(h('p', { class: 'card__sub' }, 'Every numeric metric already has a goal.'));
      const sel = h('select', { class: 'ui-input srow__label', 'aria-label': 'Goal metric' }, opts.map(m => h('option', { value: m.id }, `${m.icon} ${m.label}${unitOf(m)}`)));
      const val = h('input', { class: 'ui-input srow__num', type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: '0', 'aria-label': 'Goal value' });
      const go = () => { try { repo.goals.set(sel.value, val.value); changed(); toast('Goal saved'); paint(); } catch (e) { fail(e); } };
      val.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      addBox.replaceChildren(h('div', { class: 'srow srow--add' }, sel, val, h('button', { type: 'button', class: 'ui-icon-btn', 'aria-label': 'Add goal', html: icon('plus', 20), onclick: go })));
    }
    paint();
    return [h('p', { class: 'card__sub' }, 'Personal targets. Progress is measured against these in Insights and in the daily score.'), list, addBox];
  }

  // ---- Profile ----
  function profilePane() {
    const p = repo.state.profile, levels = ACTIVITY_LEVELS.some(([v]) => v === p.activity) ? ACTIVITY_LEVELS : [...ACTIVITY_LEVELS, [p.activity, `Custom (${p.activity})`]];
    const height = h('input', { class: 'ui-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: p.height ? String(p.height) : '', placeholder: '0' });
    const age = h('input', { class: 'ui-input', type: 'number', inputmode: 'numeric', min: '0', step: 'any', value: p.age ? String(p.age) : '', placeholder: '0' });
    const sex = h('select', { class: 'ui-input' }, h('option', { value: 'male' }, 'Male'), h('option', { value: 'female' }, 'Female')); sex.value = p.sex === 'female' ? 'female' : 'male';
    const act = h('select', { class: 'ui-input' }, levels.map(([v, t]) => h('option', { value: String(v) }, t))); act.value = String(p.activity);
    const field = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field__l' }, label), el);
    function save() {
      const ht = parseFloat(height.value) || 0, ag = parseFloat(age.value) || 0;
      if (ht && (ht < 50 || ht > 260)) return toast('Height should be between 50 and 260 cm', { error: true });       // catches a typo like 1750 before it skews BMI and calories
      if (ag && (ag < 1 || ag > 120)) return toast('Age should be between 1 and 120', { error: true });
      try { repo.setProfile({ height: ht, age: ag, sex: sex.value, activity: act.value }); changed(); toast('Profile saved'); } catch (e) { fail(e); }
    }
    return [h('p', { class: 'card__sub' }, 'Used for BMI and calorie estimates. Leave a field empty (or 0) if you prefer not to say.'), field('Height (cm)', height), field('Age', age), field('Sex', sex), field('Activity level', act),
      h('button', { type: 'button', class: 'ui-btn ui-btn--primary add-save', onclick: save }, 'Save profile')];
  }

  function paintAll() {
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Settings section' }, SETTINGS_TABS.map(([k, l]) => h('button', { type: 'button', class: 'seg__btn', 'aria-pressed': String(k === current), onclick: () => { current = k; paintAll(); body.querySelector('.seg__btn[aria-pressed="true"]')?.focus(); } }, l)));
    pane.replaceChildren(...(current === 'metrics' ? metricsPane() : current === 'goals' ? goalsPane() : profilePane()));
    body.replaceChildren(seg, pane);
  }
  paintAll();
  return sheet;
}
