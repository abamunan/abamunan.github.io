# Round 8 — Cleanup and quality pass (changelog)

## Removed
- `style.css` deleted. No page linked it any more (checked all 30 pages); only comments mentioned it.
- `theme.js`: the mouse-reactive background mesh (`initMeshParallax`, `--mx` / `--my`) removed; the theme logic itself is unchanged. `node --check` passes.

## SEO
- `sitemap.xml` rebuilt: 7 -> 20 URLs (all indexable pages, incl. `english-tracker.html`, tools, `reader`, `bot1`, `privacy`, `terms`), with `lastmod` 2026-10-07. Private pages (`noindex`) and `login.html` are not listed.
- `styleguide.html` got a meta description. `index.html` Font Awesome 6.5.0 -> 6.5.1 (all pages now use 6.5.1). `reader.html` theme colour unified to `#0A6F48`.
- Checked on all pages: one `<h1>` (except the embedded `invert-colors.html`), unique titles and descriptions, canonical equals the file name, `lang` and viewport present, Open Graph image set.
- `robots.txt` unchanged (still disallows `login` and `dashboard`).

## Accessibility
- 72 form controls and 9 icon-only buttons got an `aria-label` (attribute only, no markup moved). Controls already named by a wrapping `<label>` were left alone. Labels come from the placeholder / neighbouring label text, then hand-written names for ambiguous ones (e.g. "Account (lent)", "Timer duration").
- Skip link + `id="main"` added on `diary.html`; `role="main"` on the garments content container.
- Colour contrast calculated for `ink / muted / soft / lagoon / ok / warn / err / info` on `bg` and `paper`, light and dark, plus text on brand colours: **all pass AA (4.5:1)**; lowest is `ok` on `bg` in light mode at 4.76.

## Performance / hygiene
- `site.css`, `app.css`, `tool.css` links bumped to `?v=3` on all 29 pages (they were a mix of `v=1` and `v=2`).
- Fonts: every page already uses `display=swap` and preconnect (except `invert-colors.html`, an embedded frame). Weights were not trimmed (see below).
- `README.md` rewritten file structure + deploy / add-page notes; `STYLE-GUIDE.md` section 12 added.

## Checked (static only)
- All 14 JS files and 25 inline scripts pass `node --check`.
- Compared with the start of this round: inline scripts byte-identical on every page; only ID change is `id="main"` on the diary.
- HTML tag balance on all 30 pages; every local `href` / `src` points to an existing file.

## NOT done / NOT tested
- **No browser, so the Part F regression checklist was not run** (no screenshots, no sign-in, no PDF/print, no 320 px check). This is now the biggest open item: Rounds 6, 7 and 8 are all untested visually.
- Not done: font weight trimming (needs a per-page look at which weights are really used), lazy-loading images (the 5 images in use are logos, avatars or above-the-fold, so lazy-loading would hurt), self-hosting Font Awesome (optional), `aria-current` on nav links (`nav.js` already sets it on the active link; not changed).
- Not done: keyboard focus-order audit and touch-target audit. Needs a browser.
- `fullscreen trackers` (`moneytracker`, `healthtracker`) have no `<main>` landmark; wrapping their views risks the view-switching code.

## Needs you
1. Open each page once (light + dark, phone width) and tell me anything that looks wrong; a short list is enough.
2. Keep or drop `english-tracker.html` in the sitemap (it needs a login, so search engines see only the sign-in screen).
3. If you want fewer font weights or Font Awesome self-hosted, say so and I will do it as a separate step.
