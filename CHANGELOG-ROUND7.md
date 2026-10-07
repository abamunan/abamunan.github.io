# Round 7 — Trackers (changelog)

## Pages
| Page | What changed |
|---|---|
| `moneytracker.html` | `style.css` removed; now `site.css?v=2` + `app.css?v=2` with `theme.js` / `owner.js` in `<head>`. `<body class="v2 app-mt mt-app">`. New fonts (Bricolage / Figtree / Hind Siliguri), Font Awesome 6.5.1, real `<title>`, description, canonical, Open Graph, `noindex`. The topbar title is now the page `<h1>` (same class). Splash, topbar, side drawer, bottom nav, modals, Day / Monthly / Yearly / Insights views, calculator keep their layout |
| `healthtracker.html` | Same treatment, `<body class="v2 app-mt mt-app ht-app">`. Teal `--ht-*` colours now map to the brand green; BMI bands use `--info / --ok / --warn / --err` |
| `mt.css` | Colour tokens and both theme blocks removed (mapped in `app.css`); only radius / transition / shadow scales stay. Amber (`#d97706`, `#fbbf24`) -> `--warn`; red / green / navy `rgba()` tints -> `color-mix()` of `--err / --ok / --lagoon`; white text on brand backgrounds -> `--on-accent` / `--on-bar`; card shadows removed (modal and drawer shadows kept); splash is brand green (light) / page background (dark) |
| `mt-calc.css`, `mt-insights.css`, `ht.css`, `ht-insights.css` | Same token swaps, `backdrop-filter` removed, Poppins fallback removed |
| `app.css` (v2) | New `body.app-mt` + `body.ht-app` blocks: old variable names mapped to site tokens, `--text-*` / `--muted` aliases, 14px base size, resets for `.section-head .section-title .toast .empty` leaks from `site.css`. Round 6 blocks unchanged |
| `manifest-*.json` | `theme_color` -> `#0A6F48`, `background_color` -> `#EEF1EA` |

## JavaScript: what changed
- `mt.js`, `mt-calc.js`, `mt-insights.js`: **byte-identical** (their charts already read `--danger / --accent2 / --text-main` from CSS, so they pick up the new palette by themselves).
- `ht.js` (+1 helper line, 3 chart lines) and `ht-insights.js` (2 chart lines): teal chart colours replaced by the `--lagoon` token via a small `htLagoon()` helper. Print / PDF templates, category palette, and BMI chart colours are untouched.
- Inline scripts, element IDs, all 94 `onclick` handlers, localStorage keys, Firestore code: unchanged.

## Differences from the plan
- **No shared navbar and no `app` class on these two pages.** They are fullscreen PWAs with their own top bar (menu, fullscreen, search, settings, home), side drawer and bottom nav, so I kept those and only restyled them. `footer.js` is still loaded as before.
- PWA install icons (`moneytracker-192.png`, `healthtracker-*.png` ...) are **not** regenerated; they still have the old colours.
- Category colours (the picker palette in `mt.js`) stay as they were: they are the user's data colours.
- Money/Health PDF and Excel exports keep their own colours (printed documents).
- `noindex, nofollow` added (private pages).

## NOT tested
Same limit as Round 6: **no browser here.** Not run: Day / Monthly / Yearly / Insights views, add / edit / delete, debts, budgets, backup export / import, calculator drag, PDF / Excel export, health metrics and BMI colours, light + dark, 320 px width, installed-PWA launch.

## Needs you
1. Open both pages signed in, in light and dark. Look at splash, topbar (ink bar with light text), cards, budget bars, insights heat-map, calculator window.
2. Check the topbar buttons and the bottom nav on a phone.
3. Re-add the app to the home screen once to pick up the new theme colour, and tell me if you want new icons.
4. Typography is now Figtree instead of Poppins, so some numbers and labels may wrap differently.

## Noticed, not changed
- `mt.css` is ~60 KB with many `!important` rules; worth a cleanup pass later.
- `mt.js` is ~170 KB in one file.
