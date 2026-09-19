/* ==========================================================================
   mt-calc.js — Floating calculator for Money Tracker
   Load AFTER mt.js (it uses showToast / closeSettings from there).

   • Floating icon (fa-calculator): tap = open, drag = move anywhere.
   • Hold or drag the icon → a ✕ target appears at the bottom-centre;
     drop the icon on it to hide the icon for 10 minutes.
   • Calculator window: drag by its header, ✕ (top-right) closes it.
   • Settings → Tools → "Add Calculator" brings the icon back straight away
     (mtCalcAdd() below).
   • Last 25 results are kept as history.

   Saved in localStorage (this browser only):
     mt_calc_icon_v1          icon position
     mt_calc_win_v1           window position
     mt_calc_hidden_until_v1  when the 10-minute hide ends
     mt_calc_history_v1       history
   ========================================================================== */
(function () {
  'use strict';
  if (window.__mtCalcLoaded) return;
  window.__mtCalcLoaded = true;

  var K_ICON = 'mt_calc_icon_v1';
  var K_WIN  = 'mt_calc_win_v1';
  var K_HIDE = 'mt_calc_hidden_until_v1';
  var K_HIST = 'mt_calc_history_v1';

  var HIDE_MS     = 10 * 60 * 1000; // how long "remove" hides the icon
  var FAB         = 54;             // icon size (px) — keep in sync with CSS
  var EDGE        = 6;              // min gap to the screen edges (px)
  var HOLD_MS     = 380;            // press-and-hold time that reveals the ✕
  var MOVE_PX     = 6;              // finger travel before a press becomes a drag
  var SNAP_PX     = 64;             // how close to the ✕ counts as "on it"
  var MAX_HISTORY = 25;
  var MAX_DIGITS  = 12;

  /* ───────────────────────── storage helpers ───────────────────────── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } }
  function readJSON(k) { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } }
  function validFrac(f) {
    return f && typeof f.fx === 'number' && typeof f.fy === 'number' &&
           isFinite(f.fx) && isFinite(f.fy) && f.fx >= 0 && f.fx <= 1 && f.fy >= 0 && f.fy <= 1;
  }

  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {} }

  /* ───────────────────────────── DOM ───────────────────────────── */
  var root = document.createElement('div');
  root.className = 'mtc-root';
  root.innerHTML =
    '<div class="mtc-probe" id="mtcProbe"></div>' +

    '<div class="mtc-drop" id="mtcDrop" aria-hidden="true">' +
      '<div class="mtc-drop-label">Drop here to hide for 10 min</div>' +
      '<div class="mtc-drop-x"><i class="fas fa-xmark"></i></div>' +
    '</div>' +

    '<button class="mtc-fab mtc-hidden" id="mtcFab" type="button" aria-label="Open calculator" title="Calculator">' +
      '<i class="fas fa-calculator" aria-hidden="true"></i>' +
    '</button>' +

    '<section class="mtc-win mtc-hidden" id="mtcWin" role="dialog" aria-label="Calculator" tabindex="-1">' +
      '<div class="mtc-win-in" id="mtcWinIn">' +
        '<header class="mtc-head" id="mtcHead">' +
          '<span class="mtc-title"><i class="fas fa-calculator" aria-hidden="true"></i> Calculator</span>' +
          '<button class="mtc-x" id="mtcClose" type="button" aria-label="Close calculator"><i class="fas fa-xmark" aria-hidden="true"></i></button>' +
        '</header>' +
        '<div class="mtc-body">' +
          '<div class="mtc-screen" id="mtcScreen">' +
            '<div class="mtc-screen-top">' +
              '<button class="mtc-hbtn" id="mtcHistBtn" type="button" aria-expanded="false" aria-controls="mtcHist">' +
                '<i class="fas fa-clock-rotate-left" aria-hidden="true"></i><span>History</span>' +
                '<span class="mtc-badge" id="mtcBadge" hidden>0</span>' +
              '</button>' +
            '</div>' +
            '<div class="mtc-expr" id="mtcExpr" aria-hidden="true">&nbsp;</div>' +
            '<div class="mtc-result" id="mtcResult" role="status" aria-live="polite">0</div>' +
          '</div>' +

          '<div class="mtc-keys" id="mtcKeys">' +
            '<button class="mtc-k mtc-fn" data-k="ac" aria-label="Clear all">AC</button>' +
            '<button class="mtc-k mtc-fn" data-k="bs" aria-label="Backspace">&#9003;</button>' +
            '<button class="mtc-k mtc-fn" data-k="pct" aria-label="Percent">%</button>' +
            '<button class="mtc-k mtc-op" data-k="/" aria-label="Divide">&divide;</button>' +

            '<button class="mtc-k" data-k="7">7</button>' +
            '<button class="mtc-k" data-k="8">8</button>' +
            '<button class="mtc-k" data-k="9">9</button>' +
            '<button class="mtc-k mtc-op" data-k="*" aria-label="Multiply">&times;</button>' +

            '<button class="mtc-k" data-k="4">4</button>' +
            '<button class="mtc-k" data-k="5">5</button>' +
            '<button class="mtc-k" data-k="6">6</button>' +
            '<button class="mtc-k mtc-op" data-k="-" aria-label="Subtract">&minus;</button>' +

            '<button class="mtc-k" data-k="1">1</button>' +
            '<button class="mtc-k" data-k="2">2</button>' +
            '<button class="mtc-k" data-k="3">3</button>' +
            '<button class="mtc-k mtc-op" data-k="+" aria-label="Add">+</button>' +

            '<button class="mtc-k mtc-fn" data-k="neg" aria-label="Change sign">&plusmn;</button>' +
            '<button class="mtc-k" data-k="0">0</button>' +
            '<button class="mtc-k" data-k="." aria-label="Decimal point">.</button>' +
            '<button class="mtc-k mtc-eq" data-k="=" aria-label="Equals">=</button>' +
          '</div>' +

          '<section class="mtc-hist" id="mtcHist" aria-label="Calculator history" hidden>' +
            '<div class="mtc-h-head">' +
              '<div>' +
                '<div class="mtc-h-title">History</div>' +
                '<div class="mtc-h-sub" id="mtcHistCount">0 of 25 saved</div>' +
              '</div>' +
              '<div class="mtc-h-actions">' +
                '<button class="mtc-h-clear" id="mtcHistClear" type="button" hidden>Clear all</button>' +
                '<button class="mtc-h-close" id="mtcHistClose" type="button" aria-label="Close history"><i class="fas fa-xmark" aria-hidden="true"></i></button>' +
              '</div>' +
            '</div>' +
            '<p class="mtc-h-empty" id="mtcHistEmpty">No calculations yet. Press = and the result is saved here.</p>' +
            '<ul class="mtc-h-list" id="mtcHistList" hidden></ul>' +
          '</section>' +
        '</div>' +
      '</div>' +
    '</section>';
  document.body.appendChild(root);

  function $(id) { return document.getElementById(id); }
  var probe = $('mtcProbe'), dropEl = $('mtcDrop'), fab = $('mtcFab');
  var win = $('mtcWin'), winIn = $('mtcWinIn'), head = $('mtcHead'), closeBtn = $('mtcClose');
  var screenEl = $('mtcScreen'), exprEl = $('mtcExpr'), resEl = $('mtcResult'), keysEl = $('mtcKeys');
  var histBtn = $('mtcHistBtn'), badgeEl = $('mtcBadge'), histPanel = $('mtcHist');
  var listEl = $('mtcHistList'), emptyEl = $('mtcHistEmpty'), countEl = $('mtcHistCount');
  var clearBtn = $('mtcHistClear'), histClose = $('mtcHistClose');

  /* ─────────────────────── geometry & positioning ─────────────────────── */
  function vw() { return document.documentElement.clientWidth; }
  function vh() { return window.innerHeight; }
  function safe() {
    var cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  }
  function bounds(w, h) {
    var s = safe();
    var minY = EDGE + s.t;
    return {
      minX: EDGE, maxX: Math.max(EDGE, vw() - w - EDGE),
      minY: minY, maxY: Math.max(minY, vh() - h - EDGE - s.b)
    };
  }
  function clampPos(p, w, h) {
    var b = bounds(w, h);
    return { x: Math.min(Math.max(p.x, b.minX), b.maxX), y: Math.min(Math.max(p.y, b.minY), b.maxY) };
  }
  // Positions are stored as 0–1 fractions of the free space, so they still
  // make sense after a rotation or on a different screen size.
  function toFrac(p, w, h) {
    var b = bounds(w, h);
    return {
      fx: b.maxX > b.minX ? (p.x - b.minX) / (b.maxX - b.minX) : 0,
      fy: b.maxY > b.minY ? (p.y - b.minY) / (b.maxY - b.minY) : 0
    };
  }
  function fromFrac(f, w, h) {
    var b = bounds(w, h);
    return { x: b.minX + f.fx * (b.maxX - b.minX), y: b.minY + f.fy * (b.maxY - b.minY) };
  }
  // Uses the CSS `translate` property (not `transform`): it is applied outside
  // `scale`, so the pop / press / snap scaling never shifts where the icon sits.
  function setXY(el, p) {
    el.style.translate = Math.round(p.x) + 'px ' + Math.round(p.y) + 'px';
  }

  function defaultIconPos() {
    var desktop = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    var s = safe();
    // Mobile: sit above the floating bottom-nav pill. Desktop: near the corner.
    return { x: vw() - FAB - 14, y: vh() - FAB - (desktop ? 28 : 112) - s.b };
  }

  var iconPos = { x: 0, y: 0 };
  var winPos = { x: 0, y: 0 };
  var winOpen = false;

  (function initIconPos() {
    var f = readJSON(K_ICON);
    var p = validFrac(f) ? fromFrac(f, FAB, FAB) : defaultIconPos();
    iconPos = clampPos(p, FAB, FAB);
    setXY(fab, iconPos);
  })();

  function saveIconPos() { lsSet(K_ICON, JSON.stringify(toFrac(iconPos, FAB, FAB))); }
  function saveWinPos() {
    lsSet(K_WIN, JSON.stringify(toFrac(winPos, win.offsetWidth, win.offsetHeight)));
  }

  /* ───────────────────── icon visibility (10-minute hide) ───────────────────── */
  var returnTimer = null;
  var statusTimer = null;

  function hiddenUntil() {
    var v = parseInt(lsGet(K_HIDE), 10);
    if (!isFinite(v)) return 0;
    return Math.min(v, Date.now() + HIDE_MS); // never trust a value further out than 10 min
  }
  function isSnoozed() { return hiddenUntil() > Date.now(); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function renderStatus() {
    var el = $('mtCalcStatus');
    var left = hiddenUntil() - Date.now();
    if (left > 0) {
      if (!statusTimer) statusTimer = setInterval(renderStatus, 1000);
    } else if (statusTimer) {
      clearInterval(statusTimer); statusTimer = null;
    }
    if (!el) return;
    if (left > 0) {
      var s = Math.ceil(left / 1000);
      el.textContent = 'Icon hidden — back in ' + Math.floor(s / 60) + ':' + pad2(s % 60);
      el.className = 'mtc-status mtc-status-off';
    } else {
      el.textContent = winOpen ? 'Calculator is open on screen' : 'Icon is on screen';
      el.className = 'mtc-status';
    }
  }

  function popFab() {
    fab.classList.remove('mtc-pop'); void fab.offsetWidth; fab.classList.add('mtc-pop');
  }
  function pingFab() {
    fab.classList.remove('mtc-ping'); void fab.offsetWidth; fab.classList.add('mtc-ping');
  }

  function applyVisibility(pop) {
    var show = !winOpen && !isSnoozed();
    var wasShown = !fab.classList.contains('mtc-hidden');
    fab.classList.toggle('mtc-hidden', !show);
    if (show && !wasShown) {
      iconPos = clampPos(iconPos, FAB, FAB);
      setXY(fab, iconPos);
      if (pop) popFab();
    }
    clearTimeout(returnTimer);
    var left = hiddenUntil() - Date.now();
    if (left > 0) returnTimer = setTimeout(function () { applyVisibility(true); }, left + 30);
    renderStatus();
  }

  function hideFor10() {
    lsSet(K_HIDE, String(Date.now() + HIDE_MS));
    applyVisibility();
    toast('Calculator hidden for 10 min');
  }

  // Timers pause while a phone sleeps / a tab is in the background — re-check on return.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) applyVisibility(true); });
  window.addEventListener('focus', function () { applyVisibility(true); });
  window.addEventListener('storage', function (e) { if (e.key === K_HIDE) applyVisibility(true); });

  /* ───────────────────── icon: tap / drag / hold-to-remove ───────────────────── */
  var drag = null, holdTimer = null, lastDragEnd = 0;
  var over = false, snapPos = { x: 0, y: 0 };

  function measureDrop() {
    var x = dropEl.querySelector('.mtc-drop-x');
    var bottom = parseFloat(getComputedStyle(x).bottom) || 96;
    var cx = vw() / 2;
    var cy = vh() - bottom - 32; // circle is 64px
    snapPos = { x: cx - FAB / 2, y: cy - FAB / 2 };
    return { cx: cx, cy: cy };
  }
  var dropC = { cx: 0, cy: 0 };

  function startDrag() {
    drag.active = true;
    dropC = measureDrop();
    fab.classList.add('mtc-dragging');
    dropEl.classList.add('mtc-show');
  }

  function paintFab() {
    var wasOver = over;
    var icx = iconPos.x + FAB / 2, icy = iconPos.y + FAB / 2;
    over = Math.hypot(icx - dropC.cx, icy - dropC.cy) < SNAP_PX;
    fab.classList.toggle('mtc-over', over);
    dropEl.classList.toggle('mtc-over', over);
    if (over && !wasOver) buzz(10);
    setXY(fab, over ? snapPos : iconPos);
  }

  fab.addEventListener('pointerdown', function (e) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: iconPos.x, oy: iconPos.y,
             moved: false, held: false, active: false };
    try { fab.setPointerCapture(e.pointerId); } catch (err) {}
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      if (drag && !drag.active) { drag.held = true; startDrag(); buzz(15); }
    }, HOLD_MS);
  });

  fab.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > MOVE_PX) {
      drag.moved = true;
      clearTimeout(holdTimer);
      if (!drag.active) startDrag();
    }
    if (!drag.moved) return;
    iconPos = clampPos({ x: drag.ox + dx, y: drag.oy + dy }, FAB, FAB);
    paintFab();
  });

  function endDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    clearTimeout(holdTimer);
    var d = drag; drag = null;
    try { fab.releasePointerCapture(d.id); } catch (err) {}
    if (!d.active) return; // plain tap — the click handler opens the calculator

    lastDragEnd = Date.now();
    var dropped = over && !cancelled;
    over = false;
    fab.classList.remove('mtc-dragging', 'mtc-over');
    dropEl.classList.remove('mtc-show', 'mtc-over');

    if (dropped) {
      // Remember its old home so it returns there, then shrink away into the ✕.
      iconPos = { x: d.ox, y: d.oy };
      saveIconPos();
      fab.classList.add('mtc-vanish');
      setTimeout(function () {
        fab.classList.remove('mtc-vanish');
        setXY(fab, iconPos);
        hideFor10();
      }, 150);
    } else {
      setXY(fab, iconPos);
      if (d.moved) saveIconPos();
    }
  }
  fab.addEventListener('pointerup', function (e) { endDrag(e, false); });
  fab.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  fab.addEventListener('contextmenu', function (e) { e.preventDefault(); }); // long-press menu off

  fab.addEventListener('click', function () {
    if (Date.now() - lastDragEnd < 400) return; // that was a drag / hold, not a tap
    openWin();
  });

  /* ─────────────────────────── window: open / close / move ─────────────────────────── */
  function openWin() {
    if (winOpen) return;
    winOpen = true;
    win.classList.remove('mtc-hidden');
    var w = win.offsetWidth, h = win.offsetHeight;
    var f = readJSON(K_WIN);
    // First time: grow out of the icon's corner. After that: wherever you left it.
    var p = validFrac(f) ? fromFrac(f, w, h) : { x: iconPos.x + FAB - w, y: iconPos.y + FAB - h };
    winPos = clampPos(p, w, h);
    setXY(win, winPos);
    winIn.style.transformOrigin =
      (iconPos.x + FAB / 2 - winPos.x) + 'px ' + (iconPos.y + FAB / 2 - winPos.y) + 'px';
    winIn.classList.remove('mtc-pop'); void winIn.offsetWidth; winIn.classList.add('mtc-pop');
    applyVisibility();
    try { win.focus({ preventScroll: true }); } catch (err) {}
    update();
  }

  function closeWin() {
    if (!winOpen) return;
    if (!histPanel.hidden) closeHistory(false);
    winOpen = false;
    win.classList.add('mtc-hidden');
    applyVisibility(true);
  }
  closeBtn.addEventListener('click', closeWin);

  var wdrag = null;
  head.addEventListener('pointerdown', function (e) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('.mtc-x')) return;
    wdrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: winPos.x, oy: winPos.y, moved: false };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
    win.classList.add('mtc-moving');
  });
  head.addEventListener('pointermove', function (e) {
    if (!wdrag || e.pointerId !== wdrag.id) return;
    var dx = e.clientX - wdrag.sx, dy = e.clientY - wdrag.sy;
    if (!wdrag.moved && Math.hypot(dx, dy) > 3) wdrag.moved = true;
    if (!wdrag.moved) return;
    winPos = clampPos({ x: wdrag.ox + dx, y: wdrag.oy + dy }, win.offsetWidth, win.offsetHeight);
    setXY(win, winPos);
  });
  function endWinDrag(e) {
    if (!wdrag || e.pointerId !== wdrag.id) return;
    try { head.releasePointerCapture(wdrag.id); } catch (err) {}
    if (wdrag.moved) saveWinPos();
    wdrag = null;
    win.classList.remove('mtc-moving');
  }
  head.addEventListener('pointerup', endWinDrag);
  head.addEventListener('pointercancel', endWinDrag);

  window.addEventListener('resize', function () {
    iconPos = clampPos(iconPos, FAB, FAB);
    setXY(fab, iconPos);
    if (winOpen) {
      winPos = clampPos(winPos, win.offsetWidth, win.offsetHeight);
      setXY(win, winPos);
    }
  });

  /* ───────────────────────── Settings → "Add Calculator" ───────────────────────── */
  window.mtCalcAdd = function () {
    var wasOnScreen = !isSnoozed();
    lsSet(K_HIDE, '0');
    if (typeof window.closeSettings === 'function') window.closeSettings();
    if (winOpen) { renderStatus(); toast('Calculator is already open'); return; }
    if (wasOnScreen) {
      // Already showing — bring it back to the default corner so it can't stay lost.
      iconPos = clampPos(defaultIconPos(), FAB, FAB);
      setXY(fab, iconPos);
      saveIconPos();
    }
    applyVisibility(true);
    pingFab();
    toast(wasOnScreen ? 'Calculator is on screen' : 'Calculator added');
  };
  window.mtCalc = { open: openWin, close: closeWin, add: window.mtCalcAdd, refresh: renderStatus };

  /* ═══════════════════════════ CALCULATOR ═══════════════════════════ */
  var SYM = { '+': '+', '-': '\u2212', '*': '\u00D7', '/': '\u00F7' };

  var cur = '0';          // number being typed / shown
  var prev = null;        // stored left-hand number
  var op = null;          // pending operator
  var fresh = false;      // next digit starts a new number
  var done = false;       // just pressed equals
  var err = false;        // showing an error
  var overwrite = false;  // number came from history; next digit replaces it
  var expr = '';          // small line above the result
  var trail = '';         // full expression so far, e.g. "5 + 3 ×"

  function loadHistory() {
    var arr = readJSON(K_HIST);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (h) {
      return h && typeof h.x === 'string' && h.x.length <= 200 &&
             typeof h.r === 'string' && /^-?[0-9.]+(e-?[0-9]+)?$/.test(h.r);
    }).slice(0, MAX_HISTORY);
  }
  var history = loadHistory();
  function saveHistory() { lsSet(K_HIST, JSON.stringify(history)); }

  function toStr(n) {
    n = parseFloat(n.toPrecision(12));
    var s = String(n);
    if (s.indexOf('e') !== -1 || Math.abs(n) >= 1e15) {
      s = n.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e');
    }
    return s;
  }
  function fmt(s) {
    if (s.indexOf('e') !== -1) return s;
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var parts = s.split('.');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '\u2212' : '') + int + (parts.length > 1 ? '.' + parts[1] : '');
  }
  function clip(s) { return s.length > 26 ? '\u2026' + s.slice(-25) : s; }

  function update() {
    var text;
    if (err) {
      text = "Can't divide by 0";
      resEl.className = 'mtc-result mtc-msg';
    } else {
      text = fmt(cur);
      var len = text.length;
      resEl.className = 'mtc-result' + (len > 14 ? ' mtc-xs' : len > 11 ? ' mtc-sm' : len > 8 ? ' mtc-md' : '');
    }
    resEl.textContent = text;
    exprEl.textContent = expr ? clip(expr) : '\u00A0';
    if (history.length) { badgeEl.hidden = false; badgeEl.textContent = history.length; }
    else { badgeEl.hidden = true; }
  }

  function reset() {
    cur = '0'; prev = null; op = null;
    fresh = false; done = false; err = false; overwrite = false;
    expr = ''; trail = '';
  }
  function compute(a, o, b) {
    var r;
    if (o === '+') r = a + b;
    else if (o === '-') r = a - b;
    else if (o === '*') r = a * b;
    else if (o === '/') { if (b === 0) return null; r = a / b; }
    return isFinite(r) ? r : null;
  }
  function fail() { reset(); err = true; update(); }

  function startNew() {
    if (err) reset();
    if (fresh || done) {
      cur = '0'; fresh = false;
      if (done) { expr = ''; trail = ''; done = false; }
    } else if (overwrite) {
      cur = '0';
    }
    overwrite = false;
  }
  function digit(d) {
    startNew();
    if (cur === '0') cur = d;
    else if (cur.replace(/[-.]/g, '').length < MAX_DIGITS) cur += d;
    update();
  }
  function dot() {
    startNew();
    if (cur.indexOf('.') === -1) cur += '.';
    update();
  }
  function operator(o) {
    if (err) return;
    var v = parseFloat(cur);
    if (op && fresh) {
      trail = trail.slice(0, -1) + SYM[o];            // pressed twice: swap operator
    } else if (op) {
      var r = compute(prev, op, v);                   // chain: 5 + 3 × …
      if (r === null) return fail();
      trail += ' ' + fmt(toStr(v)) + ' ' + SYM[o];
      prev = r; cur = toStr(r);
    } else {
      prev = v;
      trail = fmt(toStr(v)) + ' ' + SYM[o];
    }
    op = o; fresh = true; done = false; overwrite = false;
    expr = trail;
    update();
  }
  function equals() {
    if (err || !op) return;
    var b = parseFloat(cur);
    var r = compute(prev, op, b);
    if (r === null) return fail();
    var full = trail + ' ' + fmt(toStr(b));
    var res = toStr(r);

    history.unshift({ x: full, r: res });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    saveHistory();

    expr = full + ' =';
    cur = res; prev = null; op = null; trail = '';
    done = true; fresh = false; overwrite = false;
    update();
  }
  function percent() {
    if (err) return;
    cur = toStr(parseFloat(cur) / 100);
    update();
  }
  function negate() {
    if (err || cur === '0') return;
    cur = cur.charAt(0) === '-' ? cur.slice(1) : '-' + cur;
    update();
  }
  function backspace() {
    if (err) { reset(); update(); return; }
    if (done || fresh || overwrite) return;
    cur = cur.slice(0, -1);
    if (cur === '' || cur === '-') cur = '0';
    update();
  }
  function handle(k) {
    if (/^[0-9]$/.test(k)) digit(k);
    else if (k === '.') dot();
    else if (k === '+' || k === '-' || k === '*' || k === '/') operator(k);
    else if (k === '=') equals();
    else if (k === 'ac') { reset(); update(); }
    else if (k === 'bs') backspace();
    else if (k === 'pct') percent();
    else if (k === 'neg') negate();
  }

  /* ───────────────────────────── history panel ───────────────────────────── */
  var clearTimer = null;
  function disarm() {
    clearTimeout(clearTimer); clearTimer = null;
    clearBtn.textContent = 'Clear all';
    clearBtn.classList.remove('mtc-armed');
  }
  function renderHistory() {
    listEl.textContent = '';
    history.forEach(function (h, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mtc-h-item';
      b.setAttribute('data-i', String(i));
      b.setAttribute('aria-label', 'Use ' + fmt(h.r) + ' from ' + h.x);
      var x = document.createElement('span'); x.className = 'mtc-h-x'; x.textContent = h.x + ' =';
      var r = document.createElement('span'); r.className = 'mtc-h-r'; r.textContent = fmt(h.r);
      b.appendChild(x); b.appendChild(r); li.appendChild(b); listEl.appendChild(li);
    });
    var n = history.length;
    emptyEl.hidden = n > 0;
    listEl.hidden = n === 0;
    clearBtn.hidden = n === 0;
    countEl.textContent = n + ' of ' + MAX_HISTORY + ' saved';
    disarm();
  }
  function setInert(state) { screenEl.inert = state; keysEl.inert = state; }
  function openHistory() {
    renderHistory();
    histPanel.hidden = false;
    setInert(true);
    histBtn.setAttribute('aria-expanded', 'true');
    histClose.focus();
  }
  function closeHistory(refocus) {
    histPanel.hidden = true;
    setInert(false);
    histBtn.setAttribute('aria-expanded', 'false');
    if (refocus !== false) histBtn.focus();
  }
  function recall(i) {
    var h = history[i];
    if (!h) return;
    if (err) reset();
    cur = h.r; fresh = false;
    if (op) {
      overwrite = true;          // mid-calculation: use it as the next number
    } else {
      prev = null; trail = ''; done = true; overwrite = false;
      expr = h.x + ' =';
    }
    closeHistory();
    update();
  }

  histBtn.addEventListener('click', openHistory);
  histClose.addEventListener('click', function () { closeHistory(); });
  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-i]');
    if (btn) recall(parseInt(btn.getAttribute('data-i'), 10));
  });
  clearBtn.addEventListener('click', function () {
    if (clearTimer) {                       // second tap within 3 s → really clear
      history = []; saveHistory(); renderHistory(); update();
      histClose.focus();
      return;
    }
    clearBtn.textContent = 'Tap again to clear';
    clearBtn.classList.add('mtc-armed');
    clearTimer = setTimeout(disarm, 3000);
  });

  /* ───────────────────────────── key input ───────────────────────────── */
  keysEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-k]');
    if (btn) handle(btn.getAttribute('data-k'));
  });

  function flash(k) {
    var btn = keysEl.querySelector('button[data-k="' + k.replace(/"/g, '') + '"]');
    if (!btn) return;
    btn.classList.add('mtc-pressed');
    setTimeout(function () { btn.classList.remove('mtc-pressed'); }, 110);
  }

  // Keyboard works only while the window is open, and never steals keystrokes
  // from the app's own amount / note / search fields.
  document.addEventListener('keydown', function (e) {
    if (!winOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    var inside = win.contains(t);
    if (!inside && t !== document.body && t !== document.documentElement) return;

    var key = e.key, k = null;
    if (!histPanel.hidden) {
      if (key === 'Escape') { e.preventDefault(); closeHistory(); }
      return;
    }
    if (/^[0-9]$/.test(key)) k = key;
    else if (key === '.' || key === ',') k = '.';
    else if (key === '+' || key === '-' || key === '*' || key === '/') k = key;
    else if (key === 'Enter' || key === '=') k = '=';
    else if (key === 'Backspace') k = 'bs';
    else if (key === 'Delete') k = 'ac';
    else if (key === '%') k = 'pct';
    else if (key === 'Escape') { e.preventDefault(); closeWin(); return; }
    if (k === null) return;
    e.preventDefault();
    handle(k);
    flash(k);
  });

  /* ───────────────────────────── start-up ───────────────────────────── */
  update();
  applyVisibility(true);
})();
