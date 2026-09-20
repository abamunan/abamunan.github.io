# Insights tab upgrade: delivery notes

## Files in this zip (flat)

| File | Status |
|---|---|
| `mt-insights.js` | **NEW** all new logic (loaded after `mt.js` and `mt-calc.js`) |
| `mt-insights.css` | **NEW** all new styles, every class prefixed `mti-` |
| `moneytracker.html` | **MODIFIED** (4 edits, listed below) |
| `mt.js`, `mt.css`, `mt-calc.js`, `mt-calc.css`, `style.css` | **UNTOUCHED** (byte-identical to your upload; verified with `cmp`) |

Deploy by replacing the files on GitHub Pages. No build step, no new dependencies.

---

## What was found in the data layer (as requested, before writing code)

1. **Budgets**: `EXPENSE_FIELDS[i].budget` (0 = none). Saved by `saveSettingsRemote()` to Firestore and `mt_categories_v1`.
2. **Goal**: one number, `SAVINGS_GOAL` (`mt_savings_goal_v1`). No start date and no saved-so-far ledger. The app's own "saved" figure is *budget-underspend pace*, not income minus expense.
3. **Accounts**: `ACCOUNTS[{id,label,icon,opening}]`. Balances are computed on the fly by `computeAccountBalances()`, which already applies unsettled debts. There is **no balance history**.
4. **Debts**: `{id,type('lent'|'borrowed'),person,amount,date,accountId,settled}`. There is **no due-date field**.
5. **Notes**: `note_<fieldId>` inside each day's data. One amount per category per day, so an "entry" is one category on one day.

---

## Edits to existing files (`moneytracker.html` only)

1. **Insights markup regrouped into four `.mti-pane` sub-tab panes** (Overview / Patterns / Trends / Forecast). Every original element ID is unchanged; the elements are only moved into panes. Verified by diffing the ID lists: additions only, zero removals or renames. New mount points added (`#mtiTabBar`, `#mtiPeriodBar`, `#mtiTips`, `#mtiBudgetCard`, `#mtiSavingsCard`, `#mtiNetWorthCard`, `#mtiBiggestCard`, `#mtiHeatmapCard`, `#mtiPaceChartCard`, `#mtiForecastAccCard`).
2. **New bottom sheet `#mtiDrillModal`** for the category drill-down. It uses the existing `.modal-overlay`/`.modal-box` classes (layer 300). The app's own `#categoryDetailModal` is untouched.
3. **`<link rel="stylesheet" href="mt-insights.css">`** added after `mt-calc.css`.
4. **`<script src="mt-insights.js"></script>`** added after `mt-calc.js`.

`renderInsightsTab()` keeps its name and signature: `mt-insights.js` wraps it, calls the original first (so all existing cards render exactly as before), then renders the new layer.

---

## Features

**Phase 1**
- **A. Budget vs Actual**: per-category bars (green <75%, amber 75-100%, red >100%), spent / budget / remaining, projected month-end, sorted by % used, overall total row. Categories without a budget are hidden with a link to Settings → Budgets.
- **H. Smart tips** (max 3, rule-based, prioritised): pace over budget, category up >30%, no-spend streak, savings-rate drop, outlier entry (>3× category average), goal on/off track, overdue debts.
- **D. Calendar heatmap**: theme-aware, Sunday-first with Sun/Sat tinted (matches the app's own weekend definition). Tap a day to open it.
- **Sub-tabs** (remembered) and **collapsible cards** (chevron, state remembered).

**Phase 2**
- **B. Savings rate & goal**: this month, 6-month trend, months-to-goal at the current average saving.
- **C. Category drill-down** sheet: daily bars, top entries with notes (escaped), change vs previous month.
- **E. Cumulative pace chart**: this month vs last month plus a dashed total-budget line.
- **F. Biggest expenses**: top 5 entries, tap to open the day.
- **Tappable rows** in Pareto, Fixed vs Variable and Rolling Trend open the drill-down.
- **Period chips** 7d / 30d / 90d / This month / Custom.

**Phase 3**
- **G. Net worth**: see "What I did for net worth" below.
- **Forecast accuracy**: stores `{low, high}` and shows "Last month's estimate X–Y, actual Z (in range / N% over / N% under)".
- **Low-data hints**: "Needs at least 3 months" becomes a meter reading "2 of 3 months".

---

## Decisions you asked me to report

**Net worth (G): snapshot mode, not history.** The app stores no balance history, so a real trend cannot be reconstructed truthfully. I show the current net worth now and save one snapshot per calendar month under `mt_ins_networth` (this device only, no Firebase). The trend appears once two months have been recorded. Net worth = account balances + owed to you − you owe. `computeAccountBalances()` already moves unsettled-debt money in and out of accounts, so this is **not** double-counted. Verified by tests: lending, borrowing and settling each leave net worth unchanged.

**Period chips apply only to Biggest Expenses.** The heatmap is month-shaped by nature, and the existing renderers are bound to the selected month; applying a range to them would be a large refactor. Existing cards keep using the month selector, as you allowed.

---

## Assumptions (I did not stop to ask)

- **Weekend / week start:** the app has no week-start setting and treats Sun/Sat as the weekend, so the heatmap runs Sunday → Saturday.
- **Overdue debts:** no due date exists, so a debt is "overdue" if unsettled and older than 30 days (`DEBT_OVERDUE_DAYS`).
- **Tip thresholds:** category up >30% *and* ≥ ৳500; outlier = >3× the category's average with ≥4 entries and ≥ ৳500. All are constants at the top of `mt-insights.js`.
- **Entry granularity:** one category on one day is one "entry", because that is how data is stored.
- **Goal:** the tip and card use the app's own definition of goal progress (budget-underspend pace) so they agree with the Monthly tab. "Months to reach" uses actual income − expense averaged over up to 6 months, and is labelled as such.
- **Forecast accuracy:** the app's forecast is private to `renderForecastAndPace` (only its text reaches the DOM), so `mt-insights.js` recomputes it with the same formula. A test confirms the stored range equals the range the app prints. If you ever change the forecast formula in `mt.js`, update `computeForecastRange()` to match.
- **Forecast storage:** saved under the *target* month, only while viewing the real current month, so browsing history can't overwrite a prediction.

---

## Things you should know (honest limitations)

1. **Three existing cards are taller.** Pareto (+52px), Fixed vs Variable (+63px) and the Rolling Trend list (+66px) now have 44px rows so the rows meet your tap-target rule. I found that invisible hit-area tricks fail on stacked rows (a later row's overlay covers the earlier one), so real height was the only reliable route. The other six original cards are pixel-identical to the untouched app (measured). If you would rather keep the original row height, delete the `.mti-row-tap { min-height: 44px }` rule in `mt-insights.css`.
2. **Charts were not seen rendering.** Chart.js could not load in my offline test environment, so I tested chart *data* (points, cumulative sums, the budget line, null future days) but not pixels. Please eyeball the drill-down bars, the pace chart and the existing comparison chart on your device.
3. **Tap targets on the app's own controls** (year/month selectors and the original rows outside the three lists above) were not audited or changed.
4. **Existing app quirk (not changed, per your rule):** the Monthly tab's goal card prints a negative saving without a minus sign and with raw decimals (e.g. `৳ 11,237.895`). My card shows the same number correctly signed (`− ৳ 11,238`).
5. **Biggest Expenses is dominated by fixed bills** (rent) because you specified top 5 single entries. The period chips let you narrow the window.
6. **Not tested:** real Firebase sync, real touch hardware / iOS Safari, or the calculator overlay interaction beyond layer order (calculator z-index stays 400).

---

## Manual test checklist

**Setup:** open the app on a phone-width window (390px) and on desktop; try light and dark.

Sub-tabs and cards
- [ ] Insights shows four pills: Overview / Patterns / Trends / Forecast. The last one you used is remembered after a reload.
- [ ] Scroll down: the pill bar stays visible **directly under** the top bar and is still tappable.
- [ ] Tap a card title: it collapses and shows a rotated chevron; reload and it stays collapsed.
- [ ] Existing cards (Pareto, Fixed vs Variable, Frequency, etc.) show the same numbers as before.

Overview
- [ ] Smart tips: at most 3, most important first; nothing shown when there is no data.
- [ ] Budget vs Actual: colours change at 75% and 100%; rows sorted by % used; total row present; projected month-end shown for the current month; unbudgeted categories hidden with a Settings link that opens the Budgets tab.
- [ ] Savings Rate & Goal: rate matches (income − expense) ÷ income; 6-month bars; goal number matches the Monthly tab (but signed); months-to-goal shown.
- [ ] Net Worth: equals accounts + owed to you − you owe. Add a debt and confirm it does not change unexpectedly. First run shows "1 of 2 monthly snapshots".
- [ ] Biggest Expenses: top 5; tapping one opens that day.
- [ ] Period chips: 7d / 30d / 90d change the Biggest Expenses window; Custom shows two date fields and Apply; reversed dates are swapped.

Patterns
- [ ] Heatmap: correct weekday alignment for the 1st; weekends tinted; darker = more spending; tap a day opens it.
- [ ] Tap a Pareto or Fixed-vs-Variable row: the category sheet opens.

Trends
- [ ] Tap a Rolling Trend row: the category sheet opens. YoY appears only with 12+ months of history.

Forecast
- [ ] Cumulative Pace chart draws two lines and a dashed budget line; future days are not drawn.
- [ ] Forecast Accuracy: shows "No saved estimate" first; next month it shows last month's range vs the actual.
- [ ] With under 3 months of data, cards show a meter such as "2 of 3 months" instead of "Needs at least…".

Category sheet
- [ ] Shows total, entries, average, change vs previous month, daily bars, top entries with notes; tapping an entry or a bar opens that day; Esc / overlay tap / ✕ closes it; "See every entry" opens the app's own category popup.
- [ ] A note containing `<b>` or `<script>` shows as plain text.

Layering and safety
- [ ] Open the calculator while the sheet is open: the calculator stays on top.
- [ ] Nothing new appears in Firebase. Only `mt_ins_*` keys are written in localStorage.
- [ ] No console errors on any tab, with no data, with one month, and with 12+ months.

---

## How this was tested

Headless Chromium (Playwright) against the assembled files, with the network blocked and a fake Chart.js. 9 suites, **162 checks**, all passing; many compare the app against an independent Python recalculation from raw stored data (net worth, savings rate, top-5 entries over 7d/30d/90d/custom windows, drill-down totals, cumulative pace, forecast range). Additional audits: only `mt_ins_*` writes, all existing app data byte-identical afterward, zero network calls, layer order, 508 controls measured for tap-target size, contrast measured from rendered pixels (≥ 5.9:1), and original cards compared with the untouched app.
