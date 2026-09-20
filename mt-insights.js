/* ==========================================================================
   mt-insights.js — Insights tab upgrade for Money Tracker
   Loads AFTER mt.js and mt-calc.js. Read-only: no data-schema changes and no
   Firebase writes. UI preferences / snapshots live in localStorage under
   `mt_ins_*` (always inside try/catch).

   Public surface:
     - wraps window.renderInsightsTab (same name + signature, calls the
       original first, then renders the new layer)
     - window.mtiOpenDrill(fieldId, y, m)   category drill-down sheet
     - window.mtiOpenDay(y, m, d)           open a day in the day editor
   ========================================================================== */
(function () {
  'use strict';
  if (window.__mtiLoaded) return;
  window.__mtiLoaded = true;

  /* ───────────────────────── constants / prefs ───────────────────────── */
  var LS = {
    tab: 'mt_ins_tab',
    collapsed: 'mt_ins_collapsed',
    period: 'mt_ins_period',
    custom: 'mt_ins_custom',
    forecast: 'mt_ins_forecast',     // { 'YYYY-M': {low,high} }  (Phase 3)
    netSnap: 'mt_ins_networth'       // { 'YYYY-M': total }       (Phase 3)
  };
  var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'patterns', label: 'Patterns' },
    { id: 'trends',   label: 'Trends' },
    { id: 'forecast', label: 'Forecast' }
  ];
  // Unsettled debts/loans older than this many days are treated as "overdue"
  // (the app stores no due date, only the loan date).
  var DEBT_OVERDUE_DAYS = 30;
  // Category must have grown by this fraction AND by at least this amount to
  // trigger the "category up" tip (avoids nagging over tiny ৳ amounts).
  var TIP_CAT_UP_PCT = 0.30;
  var TIP_CAT_UP_MIN = 500;
  var OUTLIER_MULT = 3;
  var OUTLIER_MIN = 500;

  function lsGet(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / quota */ }
  }

  /* ───────────────────────── tiny helpers ───────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return (typeof escHtml === 'function') ? escHtml(s) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n, sign) { return fmt(Math.round(n), sign); }
  // For values that CAN be negative (projected saving, net, avg saving): fmt()
  // drops the sign unless told otherwise, which would show -11,238 as 11,238.
  function moneyS(n) { n = Math.round(n); return n < 0 ? '\u2212 ' + fmt(-n) : fmt(n); }
  function pct(n, d) { return d > 0 ? (n / d) * 100 : 0; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function short(m) { return MONTHS[m].slice(0, 3); }
  function ymKey(y, m) { return y + '-' + m; }
  function prevOf(y, m) { return m === 0 ? { y: y - 1, m: 11 } : { y: y, m: m - 1 }; }
  function nextOf(y, m) { return m === 11 ? { y: y + 1, m: 0 } : { y: y, m: m + 1 }; }
  function isCurrentMonth(y, m) { var t = new Date(); return y === t.getFullYear() && m === t.getMonth(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

  /* ───────────────────────── per-render data index ─────────────────────────
     One pass over getAllDayEntriesCached() -> Map. Nothing below ever calls
     getDay() (which re-parses localStorage) inside a loop. The index is
     rebuilt only when the underlying cache array identity changes (the app
     replaces it after any write), so repeated renders are free.            */
  var _idx = { src: null, map: null, fieldSig: '' };
  var _earliest;          // undefined = not computed this pass; null = no data
  function earliestMonth() {
    if (_earliest === undefined) _earliest = (typeof findEarliestDataMonth === 'function') ? findEarliestDataMonth() : null;
    return _earliest;
  }
  function fieldSig() {
    return EXPENSE_FIELDS.map(function (f) { return f.id; }).join(',') + '|' + INCOME_FIELDS.map(function (f) { return f.id; }).join(',');
  }
  function dayIndex() {
    var src = getAllDayEntriesCached();
    if (_idx.src !== src || _idx.fieldSig !== fieldSig()) {
      var map = new Map();
      for (var i = 0; i < src.length; i++) {
        var e = src[i];
        map.set(e.y + '-' + e.m + '-' + e.d, e.data);
      }
      _idx = { src: src, map: map, fieldSig: fieldSig() };
      _statsMemo = {}; _earliest = undefined;
    }
    return _idx.map;
  }
  function dayData(y, m, d) { return dayIndex().get(y + '-' + m + '-' + d) || null; }

  function expOf(data) {
    if (!data) return 0;
    var s = 0;
    for (var i = 0; i < EXPENSE_FIELDS.length; i++) s += (+data[EXPENSE_FIELDS[i].id] || 0);
    return s;
  }
  function incOf(data) {
    if (!data) return 0;
    var s = 0;
    for (var i = 0; i < INCOME_FIELDS.length; i++) s += (+data[INCOME_FIELDS[i].id] || 0);
    return s;
  }

  /* monthStats(y,m): memoised, index-based equivalent of calcMonth() plus
     per-day arrays we need (cumulative pace, heatmap, etc.).                */
  var _statsMemo = {};
  function monthStats(y, m) {
    dayIndex();
    var k = ymKey(y, m);
    if (_statsMemo[k]) return _statsMemo[k];
    var days = daysInMonth(y, m);
    var cat = {}, dailyExp = new Array(days + 1).fill(0), dailyInc = new Array(days + 1).fill(0);
    var totalExp = 0, totalInc = 0, hasAny = false;
    ALL_FIELDS.forEach(function (f) { cat[f.id] = 0; });
    for (var d = 1; d <= days; d++) {
      var data = dayData(y, m, d);
      if (!data) continue;
      var e = 0, inc = 0;
      for (var i = 0; i < EXPENSE_FIELDS.length; i++) {
        var v = +data[EXPENSE_FIELDS[i].id] || 0;
        if (v) { cat[EXPENSE_FIELDS[i].id] += v; e += v; }
      }
      for (var j = 0; j < INCOME_FIELDS.length; j++) {
        var w = +data[INCOME_FIELDS[j].id] || 0;
        if (w) { cat[INCOME_FIELDS[j].id] += w; inc += w; }
      }
      dailyExp[d] = e; dailyInc[d] = inc;
      totalExp += e; totalInc += inc;
      if (e > 0 || inc > 0) hasAny = true;
    }
    var out = { y: y, m: m, days: days, cat: cat, dailyExp: dailyExp, dailyInc: dailyInc,
                totalExp: totalExp, totalInc: totalInc, net: totalInc - totalExp, hasAny: hasAny };
    _statsMemo[k] = out;
    return out;
  }
  // Sum of expense for days 1..upTo (inclusive) from a monthStats object.
  function expUpTo(st, upTo) {
    var s = 0, n = Math.min(upTo, st.days);
    for (var d = 1; d <= n; d++) s += st.dailyExp[d];
    return s;
  }
  // Last N calendar months ending at (y,m), oldest first, only from the
  // earliest month with data onward (mirrors collectRecentMonths semantics).
  function recentMonths(n, y, m) {
    var earliest = earliestMonth();
    var out = [], cy = y, cm = m;
    for (var i = 0; i < n; i++) {
      if (earliest && (cy < earliest.y || (cy === earliest.y && cm < earliest.m))) break;
      out.unshift(monthStats(cy, cm));
      var p = prevOf(cy, cm); cy = p.y; cm = p.m;
    }
    return out;
  }
  // Month-count of history available up to (y,m) — for "N of 3 months" hints.
  function monthsOfHistory(y, m) {
    var earliest = earliestMonth();
    if (!earliest) return 0;
    return Math.max(0, (y - earliest.y) * 12 + (m - earliest.m) + 1);
  }
  // Days elapsed in (y,m) for pacing: today's date in the live month, the
  // full month if past, 0 if future. Reuses the app's own helper.
  function elapsedIn(y, m) { return getElapsedDaysInMonth(y, m); }

  /* Find category metadata by id (icon + label), tolerant of deleted cats. */
  function fieldById(id) { return ALL_FIELDS.find(function (f) { return f.id === id; }) || null; }

  /* ═══════════════════════════ UI PLUMBING ═══════════════════════════ */

  var state = {
    tab: lsGet(LS.tab, 'overview'),
    collapsed: lsGet(LS.collapsed, {})
  };
  if (!TABS.some(function (t) { return t.id === state.tab; })) state.tab = 'overview';
  if (!state.collapsed || typeof state.collapsed !== 'object') state.collapsed = {};

  /* ── keep --mti-top equal to the app's sticky .topbar height (it isn't a CSS variable) ── */
  function syncTopOffset() {
    var tb = document.querySelector('.topbar');
    var h = tb ? Math.round(tb.getBoundingClientRect().height) : 0;
    if (h > 0) document.documentElement.style.setProperty('--mti-top', h + 'px');
  }
  window.addEventListener('resize', syncTopOffset);
  window.addEventListener('orientationchange', syncTopOffset);

  /* ── sub-tab pill bar ── */
  function buildTabBar() {
    var bar = $('mtiTabBar');
    if (!bar) return;
    if (bar.dataset.built === '1') { syncTabBar(); return; }
    bar.innerHTML = TABS.map(function (t) {
      return '<button type="button" class="mti-tab" role="tab" data-mti-tab="' + t.id + '" id="mtiTabBtn-' + t.id + '">' + t.label + '</button>';
    }).join('');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-mti-tab]') : null;
      if (!b) return;
      setTab(b.getAttribute('data-mti-tab'));
    });
    bar.dataset.built = '1';
    syncTabBar();
  }
  function syncTabBar() {
    TABS.forEach(function (t) {
      var b = $('mtiTabBtn-' + t.id);
      if (b) { b.classList.toggle('active', t.id === state.tab); b.setAttribute('aria-selected', t.id === state.tab ? 'true' : 'false'); }
      var p = $('mtiPane-' + t.id);
      if (p) p.classList.toggle('mti-active', t.id === state.tab);
    });
    var pb = $('mtiPeriodBar');
    if (pb) pb.style.display = (state.tab === 'overview' || state.tab === 'patterns') ? '' : 'none';
  }
  function setTab(id) {
    if (state.tab === id) return;
    state.tab = id;
    lsSet(LS.tab, id);
    syncTabBar();
    renderActivePane();
    // After switching, bring the top of the new pane into view only if the user had scrolled past it.
    var bar = $('mtiTabBar'), top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mti-top'), 10) || 51;
    var pane = $('mtiPane-' + id);
    if (pane && pane.getBoundingClientRect().top < top + (bar ? bar.offsetHeight : 0)) {
      window.scrollTo({ top: Math.max(0, pane.getBoundingClientRect().top + window.pageYOffset - top - (bar ? bar.offsetHeight : 0) - 8), behavior: 'auto' });
    }
  }

  /* ── collapsible cards ──
     Any element marked [data-mti-collapsible="key"] gets a chevron on its
     title. Existing cards (.ins-card / .chart-card+.section-title) are
     enhanced in place WITHOUT replacing their innerHTML (the original render
     functions rewrite it on every render), via delegated events + a
     post-render "decorate" pass.                                            */
  function isCollapsed(key) { return !!state.collapsed[key]; }
  function setCollapsed(key, v) {
    if (v) state.collapsed[key] = 1; else delete state.collapsed[key];
    lsSet(LS.collapsed, state.collapsed);
  }
  // Wrap a new-card body so the title toggles it.
  function cardHTML(key, titleHTML, bodyHTML, opts) {
    opts = opts || {};
    var col = isCollapsed(key);
    return '<div class="ins-card mti-card' + (col ? ' mti-collapsed' : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-mti-key="' + key + '">' +
      '<button type="button" class="mti-card-head" data-mti-toggle="' + key + '" aria-expanded="' + (col ? 'false' : 'true') + '">' +
        '<span class="ins-card-title mti-card-title">' + titleHTML + '</span>' +
        '<i class="fas fa-chevron-down mti-chev" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="mti-card-body">' + bodyHTML + '</div>' +
    '</div>';
  }
  // Existing cards: each renderer sets card.innerHTML = '<div class="ins-card-title">…</div>…'
  // so we decorate after the original render: wrap everything after the title
  // into .mti-card-body and turn the title into a toggle.
  var EXISTING_CARDS = [
    'insParetoCard', 'insFixedVarCard', 'insFreqCard', 'insNewDroppedCard',
    'insAvgTxnCard', 'insIncomeConcCard', 'insBestWorstCard', 'insForecastCard', 'insPaceCard'
  ];
  function decorateExisting() {
    EXISTING_CARDS.forEach(function (id) {
      var card = $(id);
      if (!card) return;
      var title = card.querySelector(':scope > .ins-card-title');
      if (!title) return;                       // e.g. best/worst has no title
      if (card.querySelector(':scope > .mti-card-head')) return; // already decorated
      var key = 'x:' + id;
      var body = document.createElement('div');
      body.className = 'mti-card-body';
      while (title.nextSibling) body.appendChild(title.nextSibling);
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'mti-card-head';
      head.setAttribute('data-mti-toggle', key);
      title.classList.add('mti-card-title');
      head.appendChild(title);
      var chev = document.createElement('i');
      chev.className = 'fas fa-chevron-down mti-chev';
      chev.setAttribute('aria-hidden', 'true');
      head.appendChild(chev);
      card.appendChild(head);
      card.appendChild(body);
      card.setAttribute('data-mti-key', key);
      card.classList.add('mti-card');
    });
    // apply persisted collapsed state to every card (new + existing)
    var sec = $('insightsSection');
    if (!sec) return;
    sec.querySelectorAll('[data-mti-key]').forEach(function (card) {
      var key = card.getAttribute('data-mti-key');
      var c = isCollapsed(key);
      card.classList.toggle('mti-collapsed', c);
      var h = card.querySelector(':scope > .mti-card-head');
      if (h) h.setAttribute('aria-expanded', c ? 'false' : 'true');
    });
    // Titled sections that live outside a card (.section-title + chart): make
    // the chart-based sections collapsible too.
    decorateSectionTitles();
  }
  // .section-title + following sibling(s) up to the next .section-title are
  // grouped so the title toggles them. Done once per node (idempotent).
  var SECTION_KEYS = {
    'Top Spending Category': 'sec:top', 'This Month vs Last Month': 'sec:mom',
    'Spending Patterns': 'sec:patterns', 'Rolling Trend (per category)': 'sec:rolling',
    'Same Month, Last Year': 'sec:yoy', 'Best & Worst Months': 'sec:bw', 'Next Month Forecast': 'sec:fc'
  };
  function decorateSectionTitles() {
    var sec = $('insightsSection');
    if (!sec) return;
    sec.querySelectorAll('.section-title').forEach(function (t) {
      if (t.dataset.mtiSec) { applySectionState(t); return; }
      var label = t.textContent.trim();
      var key = SECTION_KEYS[label];
      if (!key) return;
      t.dataset.mtiSec = key;
      t.classList.add('mti-sec-title');
      t.setAttribute('role', 'button');
      t.setAttribute('tabindex', '0');
      var chev = document.createElement('i');
      chev.className = 'fas fa-chevron-down mti-chev';
      chev.setAttribute('aria-hidden', 'true');
      t.appendChild(chev);
      applySectionState(t);
    });
  }
  function sectionSiblings(t) {
    var out = [], n = t.nextElementSibling;
    while (n && !n.classList.contains('section-title') && !n.classList.contains('mti-card-slot')) { out.push(n); n = n.nextElementSibling; }
    return out;
  }
  function applySectionState(t) {
    var key = t.dataset.mtiSec, c = isCollapsed(key);
    t.classList.toggle('mti-sec-collapsed', c);
    t.setAttribute('aria-expanded', c ? 'false' : 'true');
    sectionSiblings(t).forEach(function (n) {
      // Yearly title (#insYoyTitle) manages its own display; only touch the
      // cards/charts that follow, and never override an inline display:none
      // set by the original renderers — use a class instead.
      n.classList.toggle('mti-hide', c);
    });
  }

  // one delegated listener for every collapsible thing
  function bindToggles() {
    var sec = $('insightsSection');
    if (!sec || sec.dataset.mtiBound === '1') return;
    sec.dataset.mtiBound = '1';
    sec.addEventListener('click', function (e) {
      var head = e.target.closest ? e.target.closest('[data-mti-toggle]') : null;
      if (head) {
        var key = head.getAttribute('data-mti-toggle');
        var card = head.closest('[data-mti-key]');
        var next = !isCollapsed(key);
        setCollapsed(key, next);
        if (card) card.classList.toggle('mti-collapsed', next);
        head.setAttribute('aria-expanded', next ? 'false' : 'true');
        return;
      }
      var st = e.target.closest ? e.target.closest('.mti-sec-title') : null;
      if (st) {
        setCollapsed(st.dataset.mtiSec, !isCollapsed(st.dataset.mtiSec));
        applySectionState(st);
        // Charts inside a just-expanded section need a resize to paint right.
        setTimeout(function () { try { Object.keys(chartInstances).forEach(function (k) { chartInstances[k] && chartInstances[k].resize && chartInstances[k].resize(); }); } catch (er) { } }, 30);
      }
    });
    sec.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mti-sec-title')) {
        e.preventDefault(); e.target.click();
      }
    });
  }

  /* ═══════════════════ FEATURE A — Budget vs Actual ═══════════════════ */
  function budgetTone(p) { return p > 100 ? 'red' : p >= 75 ? 'amber' : 'green'; }

  // Returns rows for every category that has a budget > 0.
  function budgetRows(y, m) {
    var st = monthStats(y, m), days = st.days;
    var el = elapsedIn(y, m);
    var live = isCurrentMonth(y, m) && el > 0 && el < days;
    var rows = EXPENSE_FIELDS.filter(function (f) { return f.budget > 0; }).map(function (f) {
      var spent = st.cat[f.id] || 0, budget = +f.budget;
      var p = pct(spent, budget);
      var projected = live ? (spent / el) * days : spent;   // past month -> actual; future -> 0
      return { f: f, spent: spent, budget: budget, pct: p, remaining: budget - spent,
               projected: projected, projPct: pct(projected, budget) };
    });
    rows.sort(function (a, b) { return b.pct - a.pct; });
    var tSpent = rows.reduce(function (s, r) { return s + r.spent; }, 0);
    var tBudget = rows.reduce(function (s, r) { return s + r.budget; }, 0);
    var tProj = rows.reduce(function (s, r) { return s + r.projected; }, 0);
    return { rows: rows, live: live, days: days, elapsed: el,
             total: { spent: tSpent, budget: tBudget, pct: pct(tSpent, tBudget), remaining: tBudget - tSpent,
                      projected: tProj, projPct: pct(tProj, tBudget) } };
  }

  function barHTML(p, tone) {
    var w = clamp(p, 0, 100);
    return '<div class="mti-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(w) + '">' +
      '<div class="mti-bar-fill mti-' + tone + '" style="width:' + w.toFixed(1) + '%"></div></div>';
  }

  function renderBudgetCard() {
    var slot = $('mtiBudgetCard');
    if (!slot) return;
    var b = budgetRows(curYear, curMonth);
    var noBudgetCats = EXPENSE_FIELDS.filter(function (f) { return !(f.budget > 0); });
    var title = '<i class="fas fa-scale-balanced"></i> Budget vs Actual';

    if (!b.rows.length) {
      slot.innerHTML = cardHTML('mti:budget', title,
        '<div class="ins-empty">No budgets set yet.</div>' +
        '<button type="button" class="mti-link" data-mti-act="settings-budgets"><i class="fas fa-gear"></i> Set budgets in Settings \u2192 Budgets</button>');
      return;
    }
    var rowsHTML = b.rows.map(function (r) {
      var tone = budgetTone(r.pct);
      var over = r.remaining < 0;
      var projTxt = '';
      if (b.live) {
        var pt = budgetTone(r.projPct);
        projTxt = '<span class="mti-proj mti-t-' + pt + '" title="At the current daily pace">Proj. ' + money(r.projected) + ' (' + Math.round(r.projPct) + '%)</span>';
      }
      return '<button type="button" class="mti-brow" data-mti-drill="' + esc(r.f.id) + '" aria-label="' + esc(r.f.label) + ' details">' +
        '<div class="mti-brow-top">' +
          '<span class="mti-brow-name"><span>' + r.f.icon + '</span><span class="mti-ell">' + esc(r.f.label) + '</span></span>' +
          '<span class="mti-brow-pct mti-t-' + tone + '">' + Math.round(r.pct) + '%</span>' +
        '</div>' +
        barHTML(r.pct, tone) +
        '<div class="mti-brow-sub">' +
          '<span>' + money(r.spent) + ' / ' + money(r.budget) + '</span>' +
          '<span class="' + (over ? 'mti-t-red' : 'mti-soft') + '">' + (over ? money(-r.remaining) + ' over' : money(r.remaining) + ' left') + '</span>' +
        '</div>' +
        (projTxt ? '<div class="mti-brow-proj">' + projTxt + '</div>' : '') +
      '</button>';
    }).join('');

    var t = b.total, tt = budgetTone(t.pct);
    var totalHTML = '<div class="mti-brow mti-btotal">' +
      '<div class="mti-brow-top"><span class="mti-brow-name"><span aria-hidden="true">\u03A3</span><span>Total (budgeted categories)</span></span>' +
      '<span class="mti-brow-pct mti-t-' + tt + '">' + Math.round(t.pct) + '%</span></div>' +
      barHTML(t.pct, tt) +
      '<div class="mti-brow-sub"><span>' + money(t.spent) + ' / ' + money(t.budget) + '</span>' +
      '<span class="' + (t.remaining < 0 ? 'mti-t-red' : 'mti-soft') + '">' + (t.remaining < 0 ? money(-t.remaining) + ' over' : money(t.remaining) + ' left') + '</span></div>' +
      (b.live ? '<div class="mti-brow-proj"><span class="mti-proj mti-t-' + budgetTone(t.projPct) + '">Projected month-end ' + money(t.projected) + ' (' + Math.round(t.projPct) + '% of budget)</span></div>' : '') +
      '</div>';

    var hidden = noBudgetCats.length
      ? '<div class="mti-hidden-note">' + noBudgetCats.length + ' categor' + (noBudgetCats.length === 1 ? 'y has' : 'ies have') + ' no budget and ' + (noBudgetCats.length === 1 ? 'is' : 'are') + ' hidden. ' +
        '<button type="button" class="mti-link mti-link-inline" data-mti-act="settings-budgets">Set budgets in Settings \u2192 Budgets</button></div>'
      : '';

    slot.innerHTML = cardHTML('mti:budget', title, rowsHTML + totalHTML + hidden);
  }

  /* ═══════════════════ FEATURE H — Smart tips (rule-based) ═══════════════════
     Each rule returns null or {p: priority (higher first), icon, tone, text}.
     No external AI/API. Max 3 shown.                                         */
  function computeTips(y, m) {
    var tips = [];
    var cur = monthStats(y, m), pv = prevOf(y, m), prev = monthStats(pv.y, pv.m);
    var el = elapsedIn(y, m), days = cur.days, live = isCurrentMonth(y, m) && el > 0 && el < days;
    var haveData = cur.hasAny;
    if (!haveData && !prev.hasAny && !DEBTS.length) return tips;

    // 1) Pace projected over budget  (highest: actionable, time-sensitive)
    var b = budgetRows(y, m);
    if (b.rows.length && live) {
      var overPace = b.rows.filter(function (r) { return r.spent <= r.budget && r.projected > r.budget; })
        .sort(function (a, c) { return c.projPct - a.projPct; });
      var alreadyOver = b.rows.filter(function (r) { return r.spent > r.budget; });
      if (b.total.projected > b.total.budget && b.total.budget > 0) {
        tips.push({ p: 95, icon: 'fa-gauge-high', tone: 'bad',
          text: 'At this pace you\u2019ll spend ' + money(b.total.projected) + ' by month-end, ' + money(b.total.projected - b.total.budget) + ' over your total budget of ' + money(b.total.budget) + '.' });
      } else if (overPace.length) {
        var r0 = overPace[0];
        tips.push({ p: 85, icon: 'fa-gauge-high', tone: 'warn',
          text: r0.f.icon + ' ' + esc(r0.f.label) + ' is on pace to reach ' + money(r0.projected) + ', above its ' + money(r0.budget) + ' budget.' });
      }
      if (alreadyOver.length) {
        var w = alreadyOver.sort(function (a, c) { return c.pct - a.pct; })[0];
        tips.push({ p: 90, icon: 'fa-triangle-exclamation', tone: 'bad',
          text: w.f.icon + ' ' + esc(w.f.label) + ' is already ' + money(w.spent - w.budget) + ' over budget with ' + (days - el) + ' day' + ((days - el) === 1 ? '' : 's') + ' left.' });
      }
    } else if (b.rows.length && !live && haveData) {
      var over = b.rows.filter(function (r) { return r.spent > r.budget; });
      if (over.length) tips.push({ p: 70, icon: 'fa-triangle-exclamation', tone: 'bad',
        text: over.length + ' categor' + (over.length === 1 ? 'y' : 'ies') + ' finished over budget: ' + over.slice(0, 2).map(function (r) { return esc(r.f.label); }).join(', ') + (over.length > 2 ? '\u2026' : '') + '.' });
    }

    // 2) Category up >30% vs last month (like-for-like day range), above a min amount
    var like = live ? el : cur.days;
    var prevLike = expUpToCat(prev, like);
    var curLike = expUpToCat(cur, like);
    var ups = [];
    EXPENSE_FIELDS.forEach(function (f) {
      var c = curLike[f.id] || 0, pvv = prevLike[f.id] || 0;
      if (pvv <= 0) return;
      var g = (c - pvv) / pvv;
      if (g > TIP_CAT_UP_PCT && (c - pvv) >= TIP_CAT_UP_MIN) ups.push({ f: f, g: g, d: c - pvv, c: c });
    });
    ups.sort(function (a, c) { return c.d - a.d; });
    if (ups.length) {
      var u = ups[0];
      tips.push({ p: 80, icon: 'fa-arrow-trend-up', tone: 'warn',
        text: u.f.icon + ' ' + esc(u.f.label) + ' is up ' + Math.round(u.g * 100) + '% vs the same stretch of last month (+' + money(u.d) + ').' });
    }

    // 3) Savings-rate drop (vs previous month)
    if (cur.totalInc > 0 && prev.totalInc > 0 && (!live || el >= 7)) {
      var sr = (cur.totalInc - cur.totalExp) / cur.totalInc, pr = (prev.totalInc - prev.totalExp) / prev.totalInc;
      if (pr - sr >= 0.10) {
        tips.push({ p: 75, icon: 'fa-piggy-bank', tone: 'warn',
          text: 'Savings rate fell from ' + Math.round(pr * 100) + '% to ' + Math.round(sr * 100) + '% compared with last month.' });
      }
    }

    // 4) Outlier entry: single entry > 3x that category's average (this month)
    var out = findOutlier(cur, y, m);
    if (out) {
      tips.push({ p: 65, icon: 'fa-bolt', tone: 'warn',
        text: out.f.icon + ' ' + money(out.amt) + ' on ' + esc(short(m)) + ' ' + out.d + ' is ' + out.mult.toFixed(1) + '\u00d7 your usual ' + esc(out.f.label) + ' entry (avg ' + money(out.avg) + ').' });
    }

    // 5) Goal on/off track
    var g = goalStatus(y, m);
    if (g && g.kind === 'track') {
      tips.push({ p: g.on ? 40 : 78, icon: g.on ? 'fa-bullseye' : 'fa-flag', tone: g.on ? 'good' : 'warn',
        text: g.on ? 'You\u2019re on track for your ' + money(SAVINGS_GOAL) + ' savings goal (projected ' + moneyS(g.projected) + ').'
                   : 'Savings goal at risk: projected ' + moneyS(g.projected) + ' vs the ' + money(SAVINGS_GOAL) + ' target.' });
    }

    // 6) Debts due / overdue (older than DEBT_OVERDUE_DAYS, unsettled)
    var dd = debtFlags();
    if (dd.overdueOwe.length || dd.overdueRecv.length) {
      var parts = [];
      if (dd.overdueOwe.length) parts.push('you owe ' + esc(dd.overdueOwe[0].person) + ' ' + money(dd.overdueOwe[0].amount) + (dd.overdueOwe.length > 1 ? ' (+' + (dd.overdueOwe.length - 1) + ' more)' : ''));
      if (dd.overdueRecv.length) parts.push(esc(dd.overdueRecv[0].person) + ' still owes you ' + money(dd.overdueRecv[0].amount) + (dd.overdueRecv.length > 1 ? ' (+' + (dd.overdueRecv.length - 1) + ' more)' : ''));
      tips.push({ p: dd.overdueOwe.length ? 92 : 68, icon: 'fa-handshake', tone: dd.overdueOwe.length ? 'bad' : 'warn',
        text: 'Open for over ' + DEBT_OVERDUE_DAYS + ' days: ' + parts.join('; ') + '.' });
    }

    // 7) No-spend streak praise (this month, ending at the latest logged day)
    var streak = noSpendStreak(cur, y, m);
    if (streak >= 3) {
      tips.push({ p: 45, icon: 'fa-leaf', tone: 'good',
        text: 'Nice: ' + streak + ' no-spend days in a row. Keep it going!' });
    }

    tips.sort(function (a, c) { return c.p - a.p; });
    return tips.slice(0, 3);
  }
  // Per-category totals up to a day (index-based; used for like-for-like).
  function expUpToCat(st, upTo) {
    var out = {}, n = Math.min(upTo, st.days);
    EXPENSE_FIELDS.forEach(function (f) { out[f.id] = 0; });
    for (var d = 1; d <= n; d++) {
      var data = dayData(st.y, st.m, d);
      if (!data) continue;
      for (var i = 0; i < EXPENSE_FIELDS.length; i++) { var id = EXPENSE_FIELDS[i].id; out[id] += (+data[id] || 0); }
    }
    return out;
  }
  function noSpendStreak(st, y, m) {
    var last = isCurrentMonth(y, m) ? new Date().getDate() : st.days;
    var run = 0;
    for (var d = last; d >= 1; d--) {
      if (st.dailyExp[d] === 0) run++; else break;
    }
    // A run of "no expense" only counts if the days were actually tracked.
    return run;
  }
  function findOutlier(st, y, m) {
    var best = null;
    EXPENSE_FIELDS.forEach(function (f) {
      var vals = [];
      for (var d = 1; d <= st.days; d++) {
        var data = dayData(y, m, d);
        var v = data ? (+data[f.id] || 0) : 0;
        if (v > 0) vals.push({ d: d, v: v });
      }
      if (vals.length < 4) return;                     // need a baseline
      vals.forEach(function (e) {
        var others = vals.filter(function (o) { return o !== e; });
        var avg = others.reduce(function (s, o) { return s + o.v; }, 0) / others.length;
        if (avg > 0 && e.v > OUTLIER_MULT * avg && e.v >= OUTLIER_MIN) {
          var mult = e.v / avg;
          if (!best || e.v > best.amt) best = { f: f, d: e.d, amt: e.v, avg: avg, mult: mult };
        }
      });
    });
    return best;
  }
  function debtFlags() {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var res = { overdueOwe: [], overdueRecv: [] };
    (DEBTS || []).forEach(function (d) {
      if (d.settled || !d.date) return;
      var dt = new Date(d.date + 'T00:00:00');
      if (isNaN(dt)) return;
      var age = Math.round((now - dt) / 86400000);
      if (age >= DEBT_OVERDUE_DAYS) (d.type === 'borrowed' ? res.overdueOwe : res.overdueRecv).push(d);
    });
    res.overdueOwe.sort(function (a, b) { return b.amount - a.amount; });
    res.overdueRecv.sort(function (a, b) { return b.amount - a.amount; });
    return res;
  }
  // Goal status using the app's OWN definition of "saved" (budget-underspend
  // pace, see renderSavingsGoalCard) so the tip agrees with the Monthly card.
  function goalStatus(y, m) {
    if (!(SAVINGS_GOAL > 0)) return null;
    var budgeted = EXPENSE_FIELDS.filter(function (f) { return f.budget > 0; });
    if (!budgeted.length) return { kind: 'nobudget' };
    var el = elapsedIn(y, m), days = daysInMonth(y, m);
    if (el <= 0) return { kind: 'future' };
    var st = monthStats(y, m), diff = 0;
    budgeted.forEach(function (f) { diff += ((f.budget / days) * el) - (st.cat[f.id] || 0); });
    var projected = (diff / el) * days;
    return { kind: 'track', projected: projected, on: projected >= SAVINGS_GOAL };
  }

  function renderTips() {
    var slot = $('mtiTips');
    if (!slot) return;
    var tips = computeTips(curYear, curMonth);
    if (!tips.length) { slot.innerHTML = ''; return; }
    var body = tips.map(function (t) {
      return '<div class="mti-tip mti-tip-' + t.tone + '"><i class="fas ' + t.icon + ' mti-tip-ico" aria-hidden="true"></i><div class="mti-tip-text">' + t.text + '</div></div>';
    }).join('');
    slot.innerHTML = '<div class="mti-tips" aria-label="Smart tips"><div class="mti-tips-head"><i class="fas fa-lightbulb"></i> Smart tips</div>' + body + '</div>';
  }

  /* ═══════════════════ FEATURE D — Calendar heatmap ═══════════════════
     Week start & weekend: the app's own convention. renderWeekdayWeekend()
     treats getDay() 0 (Sun) and 6 (Sat) as the weekend, and the app has no
     week-start setting, so the grid runs Sunday -> Saturday (JS default) with
     Sun/Sat columns tinted as weekend.                                        */
  var WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  function renderHeatmapCard() {
    var slot = $('mtiHeatmapCard');
    if (!slot) return;
    var st = monthStats(curYear, curMonth), days = st.days;
    var first = new Date(curYear, curMonth, 1).getDay();      // 0 = Sun
    var max = 0, spendVals = [];
    for (var d = 1; d <= days; d++) { if (st.dailyExp[d] > max) max = st.dailyExp[d]; if (st.dailyExp[d] > 0) spendVals.push(st.dailyExp[d]); }
    // Intensity by PERCENTILE RANK among spending days (quartiles), not by
    // ratio-to-max: one huge day (e.g. rent) would otherwise flatten every
    // other day into the same pale shade and the map would show no variation.
    var sorted = spendVals.slice().sort(function (a, b) { return a - b; });
    function levelOf(v) {
      if (v <= 0) return 0;
      if (sorted.length < 4) return v >= max ? 4 : v >= max * 0.5 ? 3 : 2;   // too few points for quartiles
      var lo = 0, hi = sorted.length;                                        // count of values <= v
      while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
      var rank = lo / sorted.length;                                         // (0,1]
      return rank > 0.75 ? 4 : rank > 0.5 ? 3 : rank > 0.25 ? 2 : 1;
    }
    var todayD = isCurrentMonth(curYear, curMonth) ? new Date().getDate() : -1;

    var cells = [];
    for (var i = 0; i < first; i++) cells.push('<div class="mti-hm-cell mti-hm-blank" aria-hidden="true"></div>');
    for (var day = 1; day <= days; day++) {
      var v = st.dailyExp[day];
      var dow = new Date(curYear, curMonth, day).getDay();
      var lvl = levelOf(v);
      var hasData = !!dayData(curYear, curMonth, day) && (st.dailyExp[day] > 0 || st.dailyInc[day] > 0);
      var future = todayD === -1 ? (new Date(curYear, curMonth, day) > new Date()) : day > todayD;
      var cls = 'mti-hm-cell mti-hm-l' + lvl + ((dow === 0 || dow === 6) ? ' mti-hm-we' : '') + (day === todayD ? ' mti-hm-today' : '') + (future ? ' mti-hm-future' : '') + (hasData && v === 0 ? ' mti-hm-inc' : '');
      var lab = MONTHS[curMonth] + ' ' + day + ': ' + (v > 0 ? money(v) + ' spent' : 'no spending');
      cells.push('<button type="button" class="' + cls + '" data-mti-day="' + day + '" aria-label="' + esc(lab) + '" title="' + esc(lab) + '">' +
        '<span class="mti-hm-num">' + day + '</span>' +
        (v > 0 ? '<span class="mti-hm-amt">' + shortMoney(v) + '</span>' : '') + '</button>');
    }
    var head = WEEK_LABELS.map(function (l, ix) { return '<div class="mti-hm-dow' + ((ix === 0 || ix === 6) ? ' mti-hm-we' : '') + '">' + l + '</div>'; }).join('');
    var legend = '<div class="mti-hm-legend"><span>Less</span>' +
      [0, 1, 2, 3, 4].map(function (l) { return '<i class="mti-hm-sw mti-hm-l' + l + '"></i>'; }).join('') + '<span>More</span></div>';

    var body = st.hasAny
      ? '<div class="mti-hm-grid">' + head + cells.join('') + '</div>' + legend +
        '<div class="ins-forecast-note">Stronger colour = higher spend relative to your other days. Peak day: ' + money(max) + '. Tap a day to open it.</div>'
      : '<div class="ins-empty">No spending logged in ' + MONTHS[curMonth] + ' yet.</div>';
    slot.innerHTML = cardHTML('mti:heatmap', '<i class="fas fa-calendar-days"></i> Spending Heatmap \u2014 ' + short(curMonth) + ' ' + curYear, body);
  }
  // Compact amount for the tiny cell label: 1.2k, 15k, 1.4L (lakh, matches en-IN)
  function shortMoney(n) {
    if (n >= 100000) return (n / 100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, '') + 'L';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }

  /* Opening a day: the app's own flow (jumpToSearchResult handles switching
     month + view + selecting the day, and works across months/years).       */
  function openDay(y, m, d) {
    if (typeof jumpToSearchResult === 'function') { jumpToSearchResult(y, m, d); return; }
    curYear = y; curMonth = m;
    if (typeof initSelectors === 'function') initSelectors();
    switchView('day'); selectDay(d);
  }
  window.mtiOpenDay = openDay;


  /* ═══════════════════ PERIOD CHIPS (7d / 30d / 90d / This month / Custom) ═══════════════════
     Applied to the NEW range-based cards only (Biggest expenses, Heatmap is
     month-bound by design). Existing month-bound renderers keep working on
     the selected month exactly as before, per the brief's fallback.          */
  var PERIODS = [
    { id: '7d',    label: '7d' },
    { id: '30d',   label: '30d' },
    { id: '90d',   label: '90d' },
    { id: 'month', label: 'This month' },
    { id: 'custom', label: 'Custom' }
  ];
  var period = { id: lsGet(LS.period, 'month'), from: null, to: null };
  (function loadCustom() {
    var c = lsGet(LS.custom, null);
    if (c && c.from && c.to) { period.from = c.from; period.to = c.to; }
    if (!PERIODS.some(function (p) { return p.id === period.id; })) period.id = 'month';
    if (period.id === 'custom' && !(period.from && period.to)) period.id = 'month';
  })();

  function parseISO(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function startOfDay(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
  // Resolve the active period to concrete {from,to (Date, inclusive), label, days}.
  function periodRange() {
    var today = startOfDay(new Date()), from, to, label;
    if (period.id === '7d' || period.id === '30d' || period.id === '90d') {
      var n = parseInt(period.id, 10);
      to = today; from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1));
      label = 'Last ' + n + ' days';
    } else if (period.id === 'custom' && period.from && period.to) {
      from = parseISO(period.from); to = parseISO(period.to);
      if (from > to) { var t = from; from = to; to = t; }
      label = from.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ' \u2013 ' + to.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      from = new Date(curYear, curMonth, 1); to = new Date(curYear, curMonth, daysInMonth(curYear, curMonth));
      label = MONTHS[curMonth] + ' ' + curYear;
    }
    return { from: from, to: to, label: label, days: Math.round((to - from) / 86400000) + 1 };
  }
  // Iterate each day in range calling fn(y,m,d,data|null). Reads only the index.
  function eachDayInRange(rng, fn) {
    var cur = new Date(rng.from.getTime());
    var guard = 0;
    while (cur <= rng.to && guard++ < 4000) {
      var y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
      fn(y, m, d, dayData(y, m, d));
      cur.setDate(cur.getDate() + 1);
    }
  }

  function buildPeriodBar() {
    var bar = $('mtiPeriodBar');
    if (!bar) return;
    var chips = PERIODS.map(function (p) {
      return '<button type="button" class="mti-chip' + (period.id === p.id ? ' active' : '') + '" data-mti-period="' + p.id + '" aria-pressed="' + (period.id === p.id ? 'true' : 'false') + '">' + p.label + '</button>';
    }).join('');
    var custom = '';
    if (period.id === 'custom') {
      var todayIso = isoOf(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      custom = '<div class="mti-custom" style="flex:1 0 100%">' +
        '<input type="date" id="mtiFrom" aria-label="From date" value="' + (period.from || '') + '" max="' + todayIso + '">' +
        '<input type="date" id="mtiTo" aria-label="To date" value="' + (period.to || '') + '" max="' + todayIso + '">' +
        '<button type="button" data-mti-act="apply-custom">Apply</button></div>';
    }
    bar.innerHTML = '<div class="mti-chips-row">' + chips + '</div>' + custom;
    bar.classList.toggle('mti-has-custom', period.id === 'custom');
  }
  function setPeriod(id) {
    period.id = id; lsSet(LS.period, id);
    buildPeriodBar();
    // Only cards that use the period need a re-render.
    if (state.tab === 'overview') safe(renderBiggestCard);
    if (state.tab === 'patterns') { /* month-bound */ }
    safe(decorateExisting);
  }

  /* ═══════════════════ FEATURE C — Category drill-down (bottom sheet) ═══════════════════
     Uses the app's .modal-overlay / .modal-box (z-index 300, same bottom-sheet
     behaviour on mobile). Shows: daily bars, top entries (with notes, escaped),
     change vs previous month.                                                 */
  var _drill = { id: null, y: null, m: null, chart: null };

  function openDrill(fieldId, y, m) {
    var f = fieldById(fieldId);
    if (!f) return;
    y = (y == null) ? curYear : y; m = (m == null) ? curMonth : m;
    _drill.id = fieldId; _drill.y = y; _drill.m = m;
    var isInc = INCOME_FIELDS.some(function (x) { return x.id === fieldId; });
    var days = daysInMonth(y, m);
    var entries = [], series = new Array(days).fill(0), total = 0;
    for (var d = 1; d <= days; d++) {
      var data = dayData(y, m, d);
      var v = data ? (+data[fieldId] || 0) : 0;
      series[d - 1] = v;
      if (v > 0) {
        total += v;
        entries.push({ d: d, v: v, note: data['note_' + fieldId] || '', dow: new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'short' }) });
      }
    }
    var pv = prevOf(y, m), pst = monthStats(pv.y, pv.m), prevTotal = pst.cat[fieldId] || 0;
    var delta = total - prevTotal, dPct = prevTotal > 0 ? (delta / prevTotal) * 100 : null;
    // "good" direction: expense down / income up
    var good = isInc ? delta >= 0 : delta <= 0;
    var changeHTML;
    if (prevTotal <= 0 && total <= 0) changeHTML = '<span class="mti-soft">No activity in either month</span>';
    else if (prevTotal <= 0) changeHTML = '<span class="mti-soft">New this month (nothing in ' + short(pv.m) + ')</span>';
    else changeHTML = '<span class="' + (good ? 'insight-good' : 'insight-bad') + '">' + (delta >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(Math.round(dPct)) + '%</span> <span class="mti-soft">(' + money(Math.abs(delta)) + (delta >= 0 ? ' more' : ' less') + ' than ' + short(pv.m) + ': ' + money(prevTotal) + ')</span>';

    var top = entries.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
    var topHTML = top.length ? top.map(function (e) {
      return '<button type="button" class="mti-erow" data-mti-day="' + e.d + '" data-mti-ym="' + y + '-' + m + '">' +
        '<span class="mti-erow-date"><b>' + e.d + '</b><i>' + esc(e.dow) + '</i></span>' +
        '<span class="mti-erow-mid"><span class="mti-erow-amt">' + money(e.v) + '</span>' +
        '<span class="mti-erow-note">' + (e.note ? esc(e.note) : '<span class="mti-soft">\u2014</span>') + '</span></span>' +
        '<i class="fas fa-chevron-right mti-erow-go" aria-hidden="true"></i></button>';
    }).join('') : '<div class="ins-empty">No entries in ' + MONTHS[m] + ' ' + y + '</div>';

    var accent = isInc ? 'var(--accent2)' : 'var(--danger)';
    $('mtiDrillTitle').textContent = f.icon + ' ' + f.label;
    $('mtiDrillSub').textContent = MONTHS[m] + ' ' + y;
    $('mtiDrillBody').innerHTML =
      '<div class="cd-stats">' +
        '<div class="cd-stat cd-stat-hero"><div class="cd-stat-label">Total ' + (isInc ? 'Received' : 'Spent') + '</div><div class="cd-stat-val" style="color:' + accent + '">' + money(total) + '</div></div>' +
        '<div class="cd-stat"><div class="cd-stat-label">Entries</div><div class="cd-stat-val">' + entries.length + '</div></div>' +
        '<div class="cd-stat"><div class="cd-stat-label">Avg / Entry</div><div class="cd-stat-val">' + money(entries.length ? total / entries.length : 0) + '</div></div>' +
      '</div>' +
      '<div class="mti-drill-change">vs previous month: ' + changeHTML + '</div>' +
      '<div class="mti-drill-sec">Daily ' + (isInc ? 'income' : 'spending') + '</div>' +
      '<div class="mti-drill-chart"><canvas id="mtiDrillChart"></canvas><div class="chart-empty" id="mtiDrillChart_empty"></div></div>' +
      '<div class="mti-drill-sec">Top entries <span class="mti-soft">(tap to open the day)</span></div>' +
      '<div class="mti-elist">' + topHTML + '</div>' +
      '<button type="button" class="btn-primary mti-drill-full" data-mti-act="drill-full"><i class="fas fa-list"></i> See every entry</button>';

    $('mtiDrillModal').classList.add('open');
    drawDrillChart(series, y, m, accent, entries.length > 0);
  }
  function drawDrillChart(series, y, m, accentVar, hasData) {
    var canvas = $('mtiDrillChart'), empty = $('mtiDrillChart_empty');
    if (_drill.chart) { try { _drill.chart.destroy(); } catch (e) { } _drill.chart = null; }
    if (!canvas) return;
    if (!hasData) { canvas.style.display = 'none'; empty.style.display = 'flex'; empty.textContent = 'Nothing logged this month'; return; }
    if (typeof Chart === 'undefined') { canvas.style.display = 'none'; empty.style.display = 'flex'; empty.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Chart library failed to load'; return; }
    canvas.style.display = 'block'; empty.style.display = 'none';
    var c = chartColors();
    var isInc = INCOME_FIELDS.some(function (x) { return x.id === _drill.id; });
    _drill.chart = new Chart(canvas, {
      type: 'bar',
      data: { labels: series.map(function (_, i) { return String(i + 1); }),
              datasets: [{ label: isInc ? 'Income' : 'Spent', data: series, backgroundColor: isInc ? c.inc : c.exp, borderRadius: 3, maxBarThickness: 14 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: function (ev, els) { if (els && els.length) { closeDrill(); openDay(y, m, els[0].index + 1); } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (it) { return short(m) + ' ' + it[0].label; }, label: function (it) { return money(it.parsed.y); } } } },
        scales: { x: { ticks: { color: c.text, font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
                  y: { beginAtZero: true, ticks: { color: c.text, font: { size: 9 } }, grid: { color: c.grid } } }
      }
    });
  }
  function closeDrill() {
    var o = $('mtiDrillModal'); if (o) o.classList.remove('open');
    if (_drill.chart) { try { _drill.chart.destroy(); } catch (e) { } _drill.chart = null; }
  }
  window.mtiOpenDrill = openDrill;

  (function bindDrillChrome() {
    var ov = $('mtiDrillModal'), cl = $('mtiDrillClose');
    if (cl) cl.addEventListener('click', closeDrill);
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) closeDrill(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov && ov.classList.contains('open')) closeDrill(); });
  })();

  /* ═══════════════════ FEATURE B — Savings rate & Goal progress ═══════════════════ */
  // savings rate = (income - expense) / income ; null when there's no income.
  function savingsRate(st) { return st.totalInc > 0 ? (st.totalInc - st.totalExp) / st.totalInc : null; }

  function renderSavingsCard() {
    var slot = $('mtiSavingsCard');
    if (!slot) return;
    var cur = monthStats(curYear, curMonth);
    var sr = savingsRate(cur);
    var months = recentMonths(6, curYear, curMonth);
    var srSeries = months.map(function (st) { return { st: st, r: savingsRate(st) }; });
    var prevSt = monthStats(prevOf(curYear, curMonth).y, prevOf(curYear, curMonth).m), psr = savingsRate(prevSt);

    var rateHTML;
    if (sr == null) {
      rateHTML = '<div class="mti-sr-big mti-soft">\u2014</div><div class="mti-mini-note">No income logged in ' + MONTHS[curMonth] + ', so a rate can\u2019t be calculated.</div>';
    } else {
      var tone = sr >= 0.2 ? 'green' : sr >= 0 ? 'amber' : 'red';
      var diff = (psr != null) ? Math.round((sr - psr) * 100) : null;
      rateHTML = '<div class="mti-sr-row"><div class="mti-sr-big mti-t-' + tone + '">' + Math.round(sr * 100) + '%</div>' +
        '<div class="mti-sr-side"><div><b>' + moneyS(cur.totalInc - cur.totalExp) + '</b> ' + ((cur.totalInc - cur.totalExp) < 0 ? 'overspent vs income' : 'saved') + '</div>' +
        '<div class="mti-soft">of ' + money(cur.totalInc) + ' income</div>' +
        (diff != null ? '<div class="' + (diff >= 0 ? 'insight-good' : 'insight-bad') + '">' + (diff >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(diff) + ' pts vs ' + short(prevOf(curYear, curMonth).m) + '</div>' : '') +
        '</div></div>';
    }

    // 6-month trend as inline bars (no chart lib needed -> works offline, always paints)
    var valid = srSeries.filter(function (x) { return x.r != null; });
    var trendHTML = '';
    if (valid.length >= 2) {
      var maxAbs = Math.max.apply(null, valid.map(function (x) { return Math.abs(x.r); })) || 1;
      trendHTML = '<div class="mti-sr-trend" role="img" aria-label="Savings rate, last ' + srSeries.length + ' months">' + srSeries.map(function (x) {
        if (x.r == null) return '<div class="mti-sr-col"><div class="mti-sr-bar-wrap"></div><div class="mti-sr-lab">' + short(x.st.m) + '</div></div>';
        var h = Math.max(4, Math.round((Math.abs(x.r) / maxAbs) * 100));
        var neg = x.r < 0;
        return '<div class="mti-sr-col"><div class="mti-sr-val ' + (neg ? 'mti-t-red' : 'mti-t-green') + '">' + Math.round(x.r * 100) + '%</div>' +
          '<div class="mti-sr-bar-wrap"><div class="mti-sr-bar ' + (neg ? 'mti-neg' : 'mti-pos') + '" style="height:' + h + '%"></div></div><div class="mti-sr-lab">' + short(x.st.m) + '</div></div>';
      }).join('') + '</div>';
    } else {
      var have = valid.length;
      trendHTML = '<div class="mti-lowdata">' + progressHint(have, 2, 'month with income') + '</div>';
    }

    // Goal progress
    var goalHTML = '';
    if (!(SAVINGS_GOAL > 0)) {
      goalHTML = '<div class="mti-goal-box"><div class="mti-goal-title"><i class="fas fa-bullseye"></i> Savings goal</div>' +
        '<button type="button" class="mti-link" data-mti-act="settings-goal"><i class="fas fa-gear"></i> Set a goal in Settings \u2192 Goal</button></div>';
    } else {
      var g = goalStatus(curYear, curMonth);
      var lines = '';
      if (g && g.kind === 'track') {
        var gp = clamp(pct(Math.max(0, g.projected), SAVINGS_GOAL), 0, 100), gt = g.on ? 'green' : (gp >= 60 ? 'amber' : 'red');
        lines += '<div class="mti-goal-amt"><span class="mti-t-' + gt + '">' + moneyS(g.projected) + '</span> <span class="mti-soft">projected of ' + money(SAVINGS_GOAL) + ' target</span></div>' + barHTML(gp, gt) +
          '<div class="mti-mini-note">' + (g.on ? 'On track this month.' : (g.projected < 0 ? 'Projected to overspend your budgets by ' + money(-g.projected) + ', so nothing is being saved this month.' : 'Behind: projected ' + money(SAVINGS_GOAL - g.projected) + ' short of the target this month.')) + ' This is the Monthly tab\u2019s measure: how far under (or over) your category budgets you are on pace to finish.</div>';
      } else if (g && g.kind === 'nobudget') {
        lines += '<div class="mti-mini-note">Set budgets to measure goal progress the way the Monthly tab does.</div>';
      } else if (g && g.kind === 'future') {
        lines += '<div class="mti-mini-note">This month hasn\u2019t started yet.</div>';
      }
      // months to reach: goal / average monthly net saving (last up to 6 months with data)
      var nets = months.filter(function (st) { return st.hasAny; }).map(function (st) { return st.net; });
      if (nets.length >= 1) {
        var avg = nets.reduce(function (a, b) { return a + b; }, 0) / nets.length;
        var eta;
        if (avg <= 0) eta = '<span class="mti-t-red">Not reachable at the current pace</span> <span class="mti-soft">(avg ' + moneyS(avg) + '/mo)</span>';
        else { var mo = SAVINGS_GOAL / avg; eta = '<b>' + (mo < 1 ? '< 1' : (mo < 10 ? mo.toFixed(1) : Math.ceil(mo))) + ' month' + (Math.abs(mo - 1) < 0.05 ? '' : 's') + '</b> <span class="mti-soft">at avg ' + money(avg) + '/mo saved (last ' + nets.length + ' mo)</span>'; }
        lines += '<div class="mti-eta"><div class="mti-eta-lab">By actual income \u2212 expenses</div>To reach ' + money(SAVINGS_GOAL) + ': ' + eta + '</div>';
        if (nets.length < 3) lines += '<div class="mti-lowdata">' + progressHint(nets.length, 3, 'month') + ' for a reliable estimate</div>';
      }
      goalHTML = '<div class="mti-goal-box"><div class="mti-goal-title"><i class="fas fa-bullseye"></i> Savings goal <button type="button" class="mti-link mti-link-inline" data-mti-act="settings-goal" aria-label="Edit goal"><i class="fas fa-pen"></i></button></div>' + lines + '</div>';
    }

    slot.innerHTML = cardHTML('mti:savings', '<i class="fas fa-piggy-bank"></i> Savings Rate & Goal', rateHTML + trendHTML + goalHTML);
  }

  // "2 of 3 months" progress hint with a tiny meter. Used wherever data is thin.
  function progressHint(have, need, unit) {
    have = Math.max(0, Math.min(have, need));
    // Pluralise the LAST word only, and only when the count isn't exactly 1:
    // "month" -> "months", "monthly snapshot" -> "monthly snapshots", "month with income" -> "months with income".
    var label = unit;
    if (need !== 1) {
      var m = /^(monthly snapshot)$/.exec(unit) ? unit + 's'
            : /^month(\b.*)$/.exec(unit) ? 'months' + unit.slice(5)
            : unit + 's';
      label = m;
    }
    return '<span class="mti-prog"><span class="mti-prog-meter"><i style="width:' + Math.round(have / need * 100) + '%"></i></span>' + have + ' of ' + need + ' ' + label + '</span>';
  }

  /* ═══════════════════ FEATURE E — Cumulative pace chart ═══════════════════
     Cumulative expense by day, this month vs last month, plus a total-budget
     line (sum of category budgets) when any budget exists.                   */
  function renderPaceChartCard() {
    var slot = $('mtiPaceChartCard');
    if (!slot) return;
    var cur = monthStats(curYear, curMonth), pv = prevOf(curYear, curMonth), prev = monthStats(pv.y, pv.m);
    var maxDays = Math.max(cur.days, prev.days);
    var el = elapsedIn(curYear, curMonth);
    var upto = isCurrentMonth(curYear, curMonth) ? el : (el === 0 ? 0 : cur.days);   // don't draw the future
    var curCum = [], prevCum = [], run = 0, run2 = 0;
    for (var d = 1; d <= maxDays; d++) {
      if (d <= cur.days) run += cur.dailyExp[d];
      curCum.push(d <= upto ? run : null);
      if (d <= prev.days) run2 += prev.dailyExp[d];
      prevCum.push(d <= prev.days ? run2 : null);
    }
    var totalBudget = EXPENSE_FIELDS.reduce(function (s, f) { return s + (f.budget > 0 ? +f.budget : 0); }, 0);
    var hasData = cur.totalExp > 0 || prev.totalExp > 0;

    var live = isCurrentMonth(curYear, curMonth) && el > 0 && el < cur.days;
    var same = expUpTo(prev, live ? el : cur.days);
    var diff = cur.totalExp - (live ? same : prev.totalExp);
    var summary;
    if (!hasData) summary = '';
    else if (prev.totalExp <= 0) summary = 'No spending in ' + short(pv.m) + ' to compare with.';
    else summary = 'Day ' + (live ? el : cur.days) + ': ' + money(cur.totalExp) + ' vs ' + money(live ? same : prev.totalExp) + ' in ' + short(pv.m) + ' \u2014 ' +
      '<span class="' + (diff <= 0 ? 'insight-good' : 'insight-bad') + '">' + money(Math.abs(diff)) + (diff <= 0 ? ' less' : ' more') + '</span>';

    var body = hasData
      ? '<div class="mti-chart-wrap"><canvas id="mtiPaceChart"></canvas><div class="chart-empty" id="mtiPaceChart_empty"></div></div>' +
        (summary ? '<div class="ins-forecast-note">' + summary + '</div>' : '') +
        (totalBudget > 0 ? '<div class="ins-forecast-note">Dashed line = total monthly budget (' + money(totalBudget) + ').</div>' : '')
      : '<div class="ins-empty">Not enough spending yet to draw a pace chart.</div>';
    slot.innerHTML = cardHTML('mti:pace', '<i class="fas fa-chart-line"></i> Cumulative Pace', body);
    if (!hasData) return;

    var canvas = $('mtiPaceChart'), empty = $('mtiPaceChart_empty');
    destroyChart('mtiPaceChart');
    if (typeof Chart === 'undefined') { canvas.style.display = 'none'; empty.style.display = 'flex'; empty.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Chart library failed to load'; return; }
    var c = chartColors();
    var ds = [
      { label: short(pv.m), data: prevCum, borderColor: c.grid.indexOf('rgba') === 0 ? c.text : c.grid, borderWidth: 2, pointRadius: 0, tension: 0.15, spanGaps: false, borderDash: [] },
      { label: short(curMonth), data: curCum, borderColor: c.exp, backgroundColor: 'transparent', borderWidth: 3, pointRadius: 0, tension: 0.15, spanGaps: false }
    ];
    // Previous month line must stay readable in both themes: use muted text colour.
    ds[0].borderColor = (getComputedStyle(document.documentElement).getPropertyValue('--text-soft') || '#64748b').trim() || '#64748b';
    if (totalBudget > 0) ds.push({ label: 'Budget', data: new Array(maxDays).fill(totalBudget), borderColor: c.inc, borderWidth: 2, borderDash: [6, 4], pointRadius: 0 });
    chartInstances['mtiPaceChart'] = new Chart(canvas, {
      type: 'line',
      data: { labels: Array.from({ length: maxDays }, function (_, i) { return String(i + 1); }), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, labels: { color: c.text, font: { size: 10 }, boxWidth: 14 } },
                   tooltip: { callbacks: { title: function (it) { return 'Day ' + it[0].label; }, label: function (it) { return it.dataset.label + ': ' + money(it.parsed.y); } } } },
        scales: { x: { ticks: { color: c.text, font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
                  y: { beginAtZero: true, ticks: { color: c.text, font: { size: 9 } }, grid: { color: c.grid } } }
      }
    });
  }

  /* ═══════════════════ FEATURE F — Biggest expenses (top 5 single entries) ═══════════════════
     One "entry" = one category's amount on one day (that is how the app stores
     data). Honours the period chips.                                          */
  function renderBiggestCard() {
    var slot = $('mtiBiggestCard');
    if (!slot) return;
    var rng = periodRange(), list = [];
    eachDayInRange(rng, function (y, m, d, data) {
      if (!data) return;
      for (var i = 0; i < EXPENSE_FIELDS.length; i++) {
        var f = EXPENSE_FIELDS[i], v = +data[f.id] || 0;
        if (v > 0) list.push({ f: f, v: v, y: y, m: m, d: d, note: data['note_' + f.id] || '' });
      }
    });
    list.sort(function (a, b) { return b.v - a.v || (new Date(b.y, b.m, b.d) - new Date(a.y, a.m, a.d)); });
    var top = list.slice(0, 5);
    var body;
    if (!top.length) body = '<div class="ins-empty">No expenses in this period.</div>';
    else body = '<div class="mti-elist">' + top.map(function (e, i) {
      var dt = new Date(e.y, e.m, e.d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', weekday: 'short' });
      return '<button type="button" class="mti-erow" data-mti-open="' + e.y + '-' + e.m + '-' + e.d + '">' +
        '<span class="mti-erow-rank">' + (i + 1) + '</span>' +
        '<span class="mti-erow-mid"><span class="mti-erow-top"><span class="mti-ell">' + e.f.icon + ' ' + esc(e.f.label) + '</span><span class="mti-erow-amt">' + money(e.v) + '</span></span>' +
        '<span class="mti-erow-note"><span class="mti-soft">' + esc(dt) + '</span>' + (e.note ? ' \u00b7 ' + esc(e.note) : '') + '</span></span>' +
        '<i class="fas fa-chevron-right mti-erow-go" aria-hidden="true"></i></button>';
    }).join('') + '</div>';
    slot.innerHTML = cardHTML('mti:biggest', '<i class="fas fa-arrow-up-wide-short"></i> Biggest Expenses <span class="mti-title-sub">' + esc(rng.label) + '</span>', body);
  }



  /* ═══════════════════ FEATURE G — Net worth ═══════════════════
     What the app stores: ACCOUNTS[{opening}] + a LEDGER + day entries, and
     computeAccountBalances() derives CURRENT balances only. There is NO
     balance history anywhere, so a real historical trend can't be rebuilt
     truthfully (debts have no repayment dates, and openings are undated).
     -> Snapshot mode: show the current net worth now, and save one snapshot per
        calendar month in localStorage (mt_ins_networth) so a trend builds over
        time. Nothing is written to Firebase.

     Net worth = sum(account balances) + owed TO me - owed BY me.
     computeAccountBalances() already moves unsettled debt money in/out of the
     account it was paid from (lent leaves the account, borrowed enters it), so
     adding the receivable and subtracting the payable is correct and is not a
     double count. It is verified by an invariant test (see test suite).      */
  function netWorthNow() {
    var bal = (typeof computeAccountBalances === 'function') ? computeAccountBalances() : {};
    var acctTotal = 0, accts = [];
    (ACCOUNTS || []).forEach(function (a) {
      var b = bal[a.id] || 0; acctTotal += b; accts.push({ a: a, b: b });
    });
    var toMe = 0, byMe = 0, nTo = 0, nBy = 0;
    (DEBTS || []).forEach(function (d) {
      if (d.settled) return;
      if (d.type === 'lent') { toMe += +d.amount || 0; nTo++; }
      else if (d.type === 'borrowed') { byMe += +d.amount || 0; nBy++; }
    });
    return { acctTotal: acctTotal, accts: accts, toMe: toMe, byMe: byMe, nTo: nTo, nBy: nBy, total: acctTotal + toMe - byMe };
  }
  // Save a snapshot for the CURRENT real month only (never for a browsed month,
  // and never re-write once the month has ended). Overwrites within the month so
  // the stored value tracks the latest reading; the previous months stay frozen.
  function saveNetSnapshot(nw) {
    var t = new Date(), key = ymKey(t.getFullYear(), t.getMonth());
    var snaps = lsGet(LS.netSnap, {});
    if (!snaps || typeof snaps !== 'object' || Array.isArray(snaps)) snaps = {};
    if (!(ACCOUNTS && ACCOUNTS.length) && !(DEBTS && DEBTS.length)) return snaps;   // nothing meaningful to record
    snaps[key] = { v: Math.round(nw.total), d: t.getDate() };
    lsSet(LS.netSnap, snaps);
    return snaps;
  }
  function renderNetWorthCard() {
    var slot = $('mtiNetWorthCard');
    if (!slot) return;
    var title = '<i class="fas fa-landmark"></i> Net Worth';
    if (!(ACCOUNTS && ACCOUNTS.length) && !(DEBTS && DEBTS.length)) {
      slot.innerHTML = cardHTML('mti:networth', title,
        '<div class="ins-empty">No accounts or debts yet.</div><button type="button" class="mti-link" data-mti-act="settings-accounts"><i class="fas fa-gear"></i> Add accounts in Settings \u2192 Accounts</button>');
      return;
    }
    var nw = netWorthNow(), snaps = saveNetSnapshot(nw);
    var tone = nw.total >= 0 ? 'green' : 'red';
    var t = new Date(), curKey = ymKey(t.getFullYear(), t.getMonth());
    // series: every stored month, oldest first
    var keys = Object.keys(snaps).map(function (k) { var p = k.split('-'); return { k: k, y: +p[0], m: +p[1] }; })
      .filter(function (x) { return isFinite(x.y) && isFinite(x.m) && snaps[x.k] && isFinite(snaps[x.k].v); })
      .sort(function (a, b) { return a.y - b.y || a.m - b.m; });
    var last6 = keys.slice(-6);
    var prevSnap = null;
    for (var i = keys.length - 1; i >= 0; i--) { if (keys[i].k !== curKey) { prevSnap = keys[i]; break; } }
    var deltaHTML = prevSnap
      ? (function () { var dv = nw.total - snaps[prevSnap.k].v;
          return '<div class="' + (dv >= 0 ? 'insight-good' : 'insight-bad') + '">' + (dv >= 0 ? '\u25B2 ' : '\u25BC ') + money(Math.abs(dv)) + ' since ' + short(prevSnap.m) + ' ' + prevSnap.y + '</div>'; })()
      : '';

    var accRows = nw.accts.map(function (x) {
      return '<div class="ins-card-row"><div class="icr-left"><span>' + x.a.icon + '</span><span>' + esc(x.a.label) + '</span></div><div class="icr-right ' + (x.b < 0 ? 'insight-bad' : '') + '">' + moneyS(x.b) + '</div></div>';
    }).join('');
    var debtRows =
      '<div class="ins-card-row"><div class="icr-left"><span><i class="fas fa-arrow-down-long mti-t-green"></i></span><span>Owed to you' + (nw.nTo ? ' (' + nw.nTo + ')' : '') + '</span></div><div class="icr-right mti-t-green">+ ' + money(nw.toMe) + '</div></div>' +
      '<div class="ins-card-row"><div class="icr-left"><span><i class="fas fa-arrow-up-long mti-t-red"></i></span><span>You owe' + (nw.nBy ? ' (' + nw.nBy + ')' : '') + '</span></div><div class="icr-right mti-t-red">\u2212 ' + money(nw.byMe) + '</div></div>';

    // trend: bars if >=2 snapshots, otherwise an honest "building" hint
    var trend;
    if (last6.length >= 2) {
      var vals = last6.map(function (x) { return snaps[x.k].v; });
      var mn = Math.min.apply(null, vals.concat(0)), mx = Math.max.apply(null, vals.concat(0)), span = (mx - mn) || 1;
      trend = '<div class="mti-nw-trend" role="img" aria-label="Net worth by month">' + last6.map(function (x) {
        var v = snaps[x.k].v, h = Math.max(6, Math.round(Math.abs(v) / span * 100));
        return '<div class="mti-sr-col"><div class="mti-sr-val ' + (v < 0 ? 'mti-t-red' : 'mti-soft') + '">' + shortMoney(Math.abs(v)) + (v < 0 ? '\u2212' : '') + '</div>' +
          '<div class="mti-sr-bar-wrap"><div class="mti-sr-bar ' + (v < 0 ? 'mti-neg' : 'mti-pos') + '" style="height:' + h + '%"></div></div><div class="mti-sr-lab">' + short(x.m) + '</div></div>';
      }).join('') + '</div>';
    } else {
      trend = '<div class="mti-lowdata"><i class="fas fa-seedling"></i> Trend is building: the app keeps no balance history, so a snapshot is saved on this device each month. ' +
        progressHint(last6.length, 2, 'monthly snapshot') + '</div>';
    }

    var body = '<div class="mti-nw-hero"><div class="mti-sr-big mti-t-' + tone + '">' + moneyS(nw.total) + '</div>' + deltaHTML + '</div>' +
      '<div class="mti-nw-lines">' + accRows + debtRows + '</div>' + trend +
      '<div class="mti-mini-note">= accounts ' + moneyS(nw.acctTotal) + ' + owed to you ' + money(nw.toMe) + ' \u2212 you owe ' + money(nw.byMe) + '. Snapshots are stored only on this device.</div>';
    slot.innerHTML = cardHTML('mti:networth', title, body);
  }

  /* ═══════════════════ Forecast accuracy ═══════════════════
     The app's next-month forecast is a private local inside renderForecastAndPace
     (only its formatted text reaches the DOM). To store {month, low, high}
     without editing mt.js, we recompute it with the SAME formula from the same
     data. A test compares the result with the range the app itself prints, so
     drift would be caught.                                                    */
  function computeForecastRange(y, m) {
    var months = recentMonths(6, y, m);
    var have = months.filter(function (mo) { return mo.totalExp > 0 || mo.totalInc > 0; });
    if (have.length < 2) return null;
    var wsum = 0, weights = months.map(function (_, i) { wsum += i + 1; return i + 1; });
    var low = 0, high = 0, any = false;
    EXPENSE_FIELDS.forEach(function (f) {
      var series = months.map(function (mo) { return mo.cat[f.id] || 0; });
      var total = series.reduce(function (a, b) { return a + b; }, 0);
      if (total <= 0) return;
      any = true;
      var weighted = series.reduce(function (acc, v, i) { return acc + v * weights[i]; }, 0) / wsum;
      var mean = total / series.length;
      var variance = series.reduce(function (acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / series.length;
      var sd = Math.sqrt(variance), center = Math.max(0, weighted + (weighted - mean) * 0.5);
      low += Math.max(0, center - sd); high += center + sd;
    });
    return any ? { low: Math.round(low), high: Math.round(high) } : null;
  }
  // The forecast is "for next month" relative to the month being viewed. Store it
  // keyed by the TARGET month, but only while viewing the real current month so
  // browsing history can't overwrite a real prediction.
  function storeForecast() {
    var t = new Date();
    if (curYear !== t.getFullYear() || curMonth !== t.getMonth()) return;
    var r = computeForecastRange(curYear, curMonth);
    if (!r) return;
    var nx = nextOf(curYear, curMonth), key = ymKey(nx.y, nx.m);
    var all = lsGet(LS.forecast, {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    all[key] = { low: r.low, high: r.high, made: t.getFullYear() + '-' + (t.getMonth()) + '-' + t.getDate() };
    // keep the store small: last 18 months only
    var ks = Object.keys(all).sort(function (a, b) { var A = a.split('-'), B = b.split('-'); return (A[0] - B[0]) || (A[1] - B[1]); });
    while (ks.length > 18) delete all[ks.shift()];
    lsSet(LS.forecast, all);
  }
  function renderForecastAccuracy() {
    var slot = $('mtiForecastAccCard');
    if (!slot) return;
    storeForecast();
    var all = lsGet(LS.forecast, {}) || {};
    var key = ymKey(curYear, curMonth), rec = all[key];
    var title = '<i class="fas fa-bullseye"></i> Forecast Accuracy';
    if (!rec) {
      var pv = prevOf(curYear, curMonth);
      slot.innerHTML = cardHTML('mti:fcacc', title,
        '<div class="ins-empty">No saved estimate for ' + MONTHS[curMonth] + '.</div>' +
        '<div class="mti-mini-note">The estimate for next month is saved automatically each time you open Insights, so next month you\u2019ll see how close it was.</div>');
      return;
    }
    var st = monthStats(curYear, curMonth), live = isCurrentMonth(curYear, curMonth) && getElapsedDaysInMonth(curYear, curMonth) < st.days;
    var actual = st.totalExp, range = money(rec.low) + ' \u2013 ' + money(rec.high);
    var body;
    if (live) {
      var pace = (st.totalExp / Math.max(1, getElapsedDaysInMonth(curYear, curMonth))) * st.days;
      var inR = pace >= rec.low && pace <= rec.high;
      body = '<div class="mti-acc-line">Last month\u2019s estimate for ' + MONTHS[curMonth] + ': <b>' + range + '</b></div>' +
        '<div class="mti-acc-line">Spent so far: <b>' + money(actual) + '</b> \u00b7 on pace for ' + money(pace) + ' <span class="' + (inR ? 'insight-good' : 'insight-bad') + '">(' + (inR ? 'inside the range' : (pace > rec.high ? Math.round((pace / rec.high - 1) * 100) + '% above the range' : Math.round((1 - pace / rec.low) * 100) + '% below the range')) + ')</span></div>' +
        '<div class="mti-mini-note">The month is still in progress, so this is a pace check, not the final result.</div>';
    } else {
      var verdict, cls;
      if (actual >= rec.low && actual <= rec.high) { verdict = 'in range'; cls = 'insight-good'; }
      else if (actual > rec.high) { verdict = Math.round((actual / rec.high - 1) * 100) + '% over'; cls = 'insight-bad'; }
      else { verdict = Math.round((1 - actual / rec.low) * 100) + '% under'; cls = 'insight-good'; }
      body = '<div class="mti-acc-line">Last month\u2019s estimate: <b>' + range + '</b>, actual <b>' + money(actual) + '</b> <span class="' + cls + '">(' + verdict + ')</span></div>';
    }
    slot.innerHTML = cardHTML('mti:fcacc', title, body);
  }

  /* ═══════════════════ Low-data progress hints ═══════════════════
     The original renderers replace a card with "Needs at least N months of
     history". After they run we swap that sentence for a progress hint using the
     REAL history length. Matching is by the fixed phrase, so cards that render
     real content are never touched.                                            */
  var LOWDATA_RE = /Needs at least (\d+) (?:months? of history(?: to project)?|recorded months)/;
  function upgradeLowDataMessages() {
    var have = monthsOfHistory(curYear, curMonth);
    var sec = $('insightsSection');
    if (!sec) return;
    sec.querySelectorAll('.ins-empty').forEach(function (el) {
      if (el.dataset.mtiLow === '1') return;
      var m = LOWDATA_RE.exec(el.textContent);
      if (!m) return;
      var need = parseInt(m[1], 10);
      el.dataset.mtiLow = '1';
      el.innerHTML = '<span>Building your history</span> ' + progressHint(have, need, 'month');
      el.classList.add('mti-lowdata-inline');
    });
  }

  /* ═══════════════════ orchestration ═══════════════════ */

  // Renderers for the NEW cards, keyed by the sub-tab they live on. Later
  // phases append to these arrays (Phase 2/3). Only the active tab's list runs.
  var PANE_RENDERERS = {
    overview: [renderTips, renderBudgetCard, renderSavingsCard, renderNetWorthCard, renderBiggestCard],
    patterns: [renderHeatmapCard],
    trends:   [],
    forecast: [renderPaceChartCard, renderForecastAccuracy]
  };
  var _paneDirty = { overview: true, patterns: true, trends: true, forecast: true };

  function safe(fn) {
    try { fn(); } catch (e) { console.error('[mt-insights]', fn.name || 'renderer', e); }
  }
  function renderActivePane() {
    (PANE_RENDERERS[state.tab] || []).forEach(safe);
    _paneDirty[state.tab] = false;
    safe(decorateExisting);
    safe(makeExistingRowsTappable);
    safe(upgradeLowDataMessages);
    bindToggles();
  }

  /* ── Tappable rows in EXISTING cards (Pareto, Fixed vs Variable, Rolling Trend) ──
     The original renderers build these rows as plain .ins-card-row markup
     with no id. We resolve the category from the row's label text (icon +
     name are unique per category) AFTER the original render, and add
     data attributes + button semantics. No original render code is edited.  */
  function makeExistingRowsTappable() {
    var byLabel = {};
    EXPENSE_FIELDS.forEach(function (f) { byLabel[f.label] = f; });
    ['insParetoCard', 'insFixedVarCard', 'insTrendList'].forEach(function (id) {
      var host = $(id);
      if (!host) return;
      host.querySelectorAll('.ins-card-row').forEach(function (row) {
        if (row.dataset.mtiDrill) return;
        var left = row.querySelector('.icr-left');
        if (!left) return;
        var spans = left.querySelectorAll(':scope > span');
        var name = spans.length ? spans[spans.length - 1].textContent.trim() : '';
        var f = byLabel[name];
        if (!f) return;
        row.dataset.mtiDrill = f.id;
        row.classList.add('mti-row-tap');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', f.label + ' details');
      });
    });
  }

  // Public wrapper: keep name + signature; run the ORIGINAL first so existing
  // cards render exactly as before, then layer the new UI on top.
  var _origRender = window.renderInsightsTab;
  window.renderInsightsTab = function renderInsightsTab() {
    if (typeof _origRender === 'function') _origRender.apply(this, arguments);
    _idx = { src: null, map: null, fieldSig: '' }; _statsMemo = {}; _earliest = undefined;
    Object.keys(_paneDirty).forEach(function (k) { _paneDirty[k] = true; });
    syncTopOffset();
    buildTabBar();
    buildPeriodBar();
    renderActivePane();
  };

  /* ═══════════════════ delegated clicks (cards) ═══════════════════ */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var sec = $('insightsSection');
    if (!sec || !sec.contains(t)) return;

    var chip = t.closest('[data-mti-period]');
    if (chip) { setPeriod(chip.getAttribute('data-mti-period')); return; }

    var drillEl = t.closest('[data-mti-drill]');
    if (drillEl) { openDrill(drillEl.getAttribute('data-mti-drill'), curYear, curMonth); return; }

    var openEl = t.closest('[data-mti-open]');
    if (openEl) { var q = openEl.getAttribute('data-mti-open').split('-'); openDay(+q[0], +q[1], +q[2]); return; }

    var dayBtn = t.closest('[data-mti-day]');
    if (dayBtn) { openDay(curYear, curMonth, parseInt(dayBtn.getAttribute('data-mti-day'), 10)); return; }

    var act = t.closest('[data-mti-act]');
    if (act) {
      var a = act.getAttribute('data-mti-act');
      if (a === 'settings-budgets' && typeof openSettings === 'function') openSettings('budgets');
      else if (a === 'settings-goal' && typeof openSettings === 'function') openSettings('goal');
      else if (a === 'settings-accounts' && typeof openSettings === 'function') openSettings('accounts');
      else if (a === 'apply-custom') applyCustom();
      return;
    }
  });
  // keyboard activation for role=button rows
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (t && t.classList && t.classList.contains('mti-row-tap')) { e.preventDefault(); t.click(); }
  });

  function applyCustom() {
    var a = $('mtiFrom'), b = $('mtiTo');
    if (!a || !b || !a.value || !b.value) { showToast('Pick both dates', true); return; }
    period.from = a.value; period.to = b.value;
    if (period.from > period.to) { var x = period.from; period.from = period.to; period.to = x; }
    lsSet(LS.custom, { from: period.from, to: period.to });
    buildPeriodBar();
    if (state.tab === 'overview') safe(renderBiggestCard);
  }

  // Drill sheet: entries inside the sheet open a day; "See every entry" opens the app's own detail popup.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var ov = $('mtiDrillModal');
    if (!ov || !ov.contains(t)) return;
    var dayBtn = t.closest('[data-mti-day]');
    if (dayBtn) {
      var ym = (dayBtn.getAttribute('data-mti-ym') || (_drill.y + '-' + _drill.m)).split('-');
      closeDrill(); openDay(+ym[0], +ym[1], parseInt(dayBtn.getAttribute('data-mti-day'), 10)); return;
    }
    var act = t.closest('[data-mti-act="drill-full"]');
    if (act) {
      var id = _drill.id;
      // The app's own popup is month-bound to curYear/curMonth; only hand off when they match.
      if (_drill.y === curYear && _drill.m === curMonth && typeof openCategoryDetail === 'function') { closeDrill(); openCategoryDetail(id); }
      else showToast('Switch to ' + MONTHS[_drill.m] + ' ' + _drill.y + ' to see the full list', true);
    }
  });

  // Re-render this tab when the theme flips so any JS-coloured bits refresh.
  try {
    new MutationObserver(function () {
      var sec = $('insightsSection');
      if (sec && sec.classList.contains('active')) window.renderInsightsTab();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) { /* ignore */ }

  // Expose a few internals for testing / later phases.
  window.__mti = { monthStats: monthStats, budgetRows: budgetRows, computeTips: computeTips, state: state, lsGet: lsGet, lsSet: lsSet, LS: LS };
})();
