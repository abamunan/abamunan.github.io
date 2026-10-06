# Round 6 — Personal apps (changelog)

## Pages
| Page | What changed |
|---|---|
| `diary.html` | Now `<body class="v2 app app-diary">` with `site.css?v=2` + `app.css?v=1` (no `style.css`). Hand-written navbar and the 3 background blobs removed; `nav.js` injects the shared navbar, `footer.js` kept. The brown/orange gradient, the espresso `--ink` palette and the Fraunces italic labels are gone (Bricolage / Figtree / Hind Siliguri). Entry rows, tabs, editor, banners, read overlay, gate and toast use the tokens. The title "Munan's Diary" is now the page's single `<h1>` (was a `<span>`). Added `noindex`, canonical, Open Graph |
| `english-tracker.html` | Own palette (`--bg --card --mut --ac --ac2 --warn`, light + OS-dark + manual dark) removed; the old names are mapped to the site tokens in `app.css` (`body.app-et`). Shared navbar added (its theme button is hidden because the page has its own 🌓 button that also saves to the cloud state). Kept: sticky title bar, 5-tab bottom nav, desktop sidebar, sub-tabs, cloud-sync UI. Bar and sidebar now sit under the navbar. Real `<title>`, description, canonical, Open Graph. `id="main"` + skip link added |
| `garments-accounts.html` | Done in two passes. **Pass 1 (variables):** the three navy `:root` blocks are removed; `--accent --accent2 --danger --surface --card-bg --card-border --text-* --radius-* --font` are mapped to the site tokens in `app.css` (`body.app-ga`). **Pass 2 (components):** top bar is an ink bar, text on brand colours uses `--on-accent` (so it stays readable in dark), calculator title bar / keys, toast, badges. Layout, tables, partner logic and the print report are untouched. Poppins removed. `noindex`, canonical, Open Graph added |

## New shared file: `app.css` (v1)
Token mapping per page (`.app-diary`, `.app-et`, `.app-ga`), navbar offset (`padding-top: var(--nav-h)`), no glass, the `fadeUp` / `cardIn` keyframes the diary used to get from `style.css`, and a few reusable blocks (`.app-stat`, `.app-empty`, `.app-table-wrap`, `.app-formrow`). `site.css`, `tool.css`, `nav.js`, `theme.js`, `footer.js`, `owner.js`, `diary.js` are **byte-identical** to Round 5.

## JavaScript: what changed
**Nothing.** For all three pages the inline `<script>` bodies are identical to Round 5 (compared as text), `diary.js` is byte-identical, and the localStorage keys are the same. Element IDs: diary lost `id="navbar"` (the shared `nav.js` now injects it); english-tracker gained `id="main"`; garments unchanged. No Firestore paths, Firebase config, export code or the garments print-report template were edited.

## Class collisions with `site.css` (handled in `app.css`, not renamed)
english-tracker: `.stat`, `.hero`, `.toast`, `.flex`. garments: `.wrap`, `.section`, `.empty`, `.field`, `.hint`, `.badge`, `.toast`. The page rules come later and win; `app.css` only resets what they do not set (for example the 132px `.hero` padding and the `toastIn` animation).

## Checked (static only)
- HTML tag balance of the 3 pages; CSS braces balanced; one `<h1>` each.
- Inline JS, IDs, storage keys compared with Round 5 (see above).
- Leftover hard-coded colours in the three pages' CSS are only: status dots, the calculator's translucent overlays/shadows, the english-tracker hero's white text, the garments print report (separate window, not touched).

## NOT tested
**No browser was available here, so none of the visual or sign-in checks from the plan were run** (no screenshots at 320-1280 px, no light/dark comparison, no sign-in, no sync across two devices, no diary PDF, no garments report print). Treat this round as "built and statically checked", not "tested".

## Differences from the plan
- No `footer.js` on `english-tracker` and `garments-accounts`: they are full-height apps with a fixed sidebar / bottom nav, and the footer would sit under the sidebar. The diary keeps the footer.
- The shared navbar does not hide on scroll on these pages (`data-nav-hide="off"`), because the apps have their own sticky bars.
- `english-tracker` keeps its own bottom tab bar and sidebar instead of the plan's "compact top bar + sidebar" template; only colours, fonts and the navbar changed.
- The diary no longer uses Fraunces anywhere (the plan allowed it for entry text only; I did not keep it). The PDF export layout in `diary.js` still has its own colours, untouched.
- `garments-accounts` and `english-tracker` now follow the site `theme` key instead of the OS dark setting, same as the Round 5 tools.
- `noindex, nofollow` added to `diary` and `garments-accounts` (private pages, same as `dashboard`). `english-tracker` left indexable because Round 8 plans to add it to `sitemap.xml`. Tell me if you want it the other way round.

## Needs you
1. **Sign in on each page** and check: diary write / edit / delete / PDF, english-tracker sync (🌓 button, language button, sync dot), garments add / edit / delete and a month report print.
2. **Look at dark mode** on all three, especially garments tables and the floating calculator.
3. **Phones:** english-tracker bottom nav must not be covered by anything; the navbar is 64px tall and fixed above the sticky title bar.
4. **Margins:** `site.css` resets all browser default margins. Anything that relied on a default `<p>` / `<h3>` margin may look tighter. Tell me where.
5. `STYLE-MIGRATION-PLAN.md` Part D still lists the original Round 6 text.

## Noticed, not changed
- `garments-accounts.html` is still ~197 KB with all CSS inline; moving it to a file is a Round 8 idea.
- `diary.js` PDF export uses its own hex colours (`#0284c7` etc.). Fine for a printed page, but it is the old sky blue.
