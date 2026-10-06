# Round 5 — Standalone and document pages (changelog)

## Pages
| Page | What changed |
|---|---|
| `booklet-maker.html` | Was standalone (ink background, kraft-paper stack, Fraunces / IBM Plex). Now has the shared navbar and footer, a page header (breadcrumb, kicker, title, English + Bangla lead, privacy note), a tool panel and a "How to print" side card. **Dark mode added.** Stats are `.stat` cards, the sheet diagram uses ink outline + dashed fold line, download is the solid pill button. Bangla text kept word for word (marked `lang="bn"`) |
| `poster-splitter.html` | Same shell. Piece-count buttons are the pill group, orientation is the shared select, trim margin is a green range slider, progress bar uses the green tokens, grid lines on the preview are green with a white edge so they show on any image. The 4 steps are numbered cards in the side column. Old `<footer>` sentence moved into the privacy note (because `footer.js` removes any `<footer>`) |
| `resolution-changer.html` | Same shell, Bangla UI unchanged. Headings use Hind Siliguri at weight 700 (no faux-bold, no letter-spacing, taller line-height). Quick scales are pills, lock button is a green tile (grey when unlocked), upscale warning is the shared warning alert |
| `reader.html` | Keeps its own full-height title bar (not the shared navbar: it is a full-viewport app with fullscreen mode). Bar now has the site logo, kicker + title + caption, Paper / Sepia / Dark pills, fullscreen, open-in-Drive, back-to-Notes, and a **site theme toggle (dark mode added)**. Panels, dock, floating timer, inputs and buttons use the tokens. Lora and Inter removed. Real `<title>` ("Reader \| Munan.hub", then "<note title> — Reading \| Munan.hub" once a note is open), description, canonical, Open Graph |

## Shared file changed: `tool.css` (v1 -> v2, additive only)
New classes: `.tool-wrap`, `.tool-split`, `.tool-steps` / `.tool-step`, `.tool-howto`, `.tool-preview`, `.tool-seg`, `.tool-chips`, disabled state for `.btn-solid` on tool pages. Round 4 pages do not use any of them and still load `tool.css?v=1`. The 28 Round 0-4 page screenshots I compared are unchanged. `STYLE-GUIDE.md` has a new section 9.

## Shared edits to each page
- Head: `theme.js` (blocking) -> `owner.js` -> `site.css?v=2` -> `tool.css?v=2` (reader: no `tool.css`); Bricolage / Figtree / Hind Siliguri / JetBrains Mono; Font Awesome 6.5.1; description, canonical, Open Graph, Twitter tags.
- Skip link, `<main id="main">`, one `<h1>`, `nav.js` before `footer.js` (not on the reader).
- Fraunces, IBM Plex, Lora, Inter and all cream / orange / sepia / red-brown palettes removed.

## JavaScript: what changed (everything else is byte-identical)
- `booklet-maker.html`: **0 lines changed.**
- `resolution-changer.html`: **0 lines changed.**
- `poster-splitter.html`: 0 lines removed, 25 added, all inside `buildToolHtmlSnapshot()` (the "Download this tool (HTML)" button). The page now loads shared files and gets a navbar and footer injected, so a downloaded copy would have been broken and cluttered. The snapshot now removes the injected navbar / footer / breadcrumb / site scripts, points the two stylesheets at the live site, clears the stale theme state, and adds a one-line dark-mode check. PDF generation code is untouched.
- `reader.html`: 3 small edits. (1) the panel selector `'.panel'` -> `'.rd-panel'`; (2) the tab title gets `| Munan.hub`; (3) one line wires the new theme toggle (`MunanTheme.bindToggle`).

## Not changed (checked)
- Element IDs, localStorage keys (`theme` only), Firestore paths: unchanged. These four pages use no Firebase.
- Class renames, all HTML/CSS only: reader `.panel` -> `.rd-panel` (site.css `.panel + .panel` adds a top margin that would have shifted the fixed panels); poster `.field` / `.row` -> `.pf-row` and the shared `.field`; booklet `.tag` -> `.half-tag`.
- Fixed while there: poster's "Number of pieces" `<label for="gridSel">` pointed at an id that does not exist. It is now a proper labelled group.

## Tested (headless Chromium; Google Fonts, Font Awesome, Firebase blocked or stubbed)
- 4 pages x light/dark x 320, 360, 390, 768, 1024, 1280 px = **48 checks**: no horizontal scroll, one navbar + one footer on the 3 tools (none on the reader by design), one `<h1>`, no console or page errors.
- **Booklet Maker** (real pdf-lib 1.17.1, same version as the page): a 10-page PDF gives 2 blanks, 3 sheets, sheet-1 diagram "blank / 1 / 2 / blank", full order `12, 1, 2, 11, 10, 3, 4, 9, 8, 5, 6, 7`. The downloaded PDF has **the same page-for-page content as the one from the old page**. "Start over" and the non-PDF error message also match.
- **Poster Splitter**: with jsPDF replaced by a recorder, a 3x3 landscape poster with a 12 mm margin makes **109 jsPDF calls identical to the old page** (page size, every image slice, trim marks, filename `poster-3x3-A4.pdf`). The downloaded tool copy opens from disk, works, and has no navbar or footer.
- **Resolution Changer**: 900x700 image, width 450 locked -> height 350; unlocked height 300; 2x -> 1800x1400 with the upscale warning, hidden again at 50%; JPEG download `noise-450x350.jpg` is **byte-identical to the old page's file** (133,836 bytes).
- **Reader**: URL parameters, Drive embed and "open in Drive" links; Paper / Sepia / Dark keys; dock; all five panels open in the right place (under the bar on desktop, bottom sheet on phones); go-to-page; timer and floating timer; theme toggle saves to `theme`; fullscreen hides the bar; the "no document" message. Light 1280 px and dark 390 px.
- Round 0-4 pages and the homepage: 28 screenshots compared with the Round 4 build, identical (one homepage dark shot differed, but the old build also differs from itself between runs because of its animations; `index.html` is byte-identical).

## Differences from the plan
- **The reader does not get the shared navbar and footer.** It is a full-height app with a fullscreen mode, so it keeps its own title bar (T6 "minimal bar"). The plan only asked for the navbar on the three standalone tools.
- Breadcrumb is Home / Projects / <tool>, because `projects.html` is where these tools are linked from.
- The tool pages used to follow the OS dark setting on their own. They now follow the site's `theme` key like every other page, so a first-time visitor with an OS in dark mode sees light until they press the toggle.
- Reader icons (📖 🔖 📝 ⏱ 🔗 ⌨ ⤢ ↗ ←) stay as characters, so they do not depend on the Font Awesome CDN. Revisit in Round 8.

## Needs you
1. **Real-file check (I could not run it here):** jsPDF loads from a CDN that was blocked in my sandbox, so I compared the calls it receives, not the PDF it draws. Please make one poster PDF (say 3x3) on the live site and look at it or print one page. The Booklet Maker I did test with the real library.
2. **Reader with a real Drive file:** the frame is Google's, which my sandbox cannot reach. Open one note from Notes and check the page, bookmarks, timer and Sepia / Dark filters over a real PDF, in light and dark site theme.
3. **Fonts and icons** come from CDNs, so they were blank or fallback in my screenshots. Please look at the Bangla headings on `resolution-changer.html` with the real Hind Siliguri font.
4. On very narrow phones (320-360 px) the reader bar wraps to two rows of buttons. Nothing overflows, but tell me if you want the bar slimmer.

## Noticed, not changed
- Reader: pressing the timer's Reset sets the tab title to "Reading — Document" and drops the note's name. This was already the case before Round 5.
- Round 8: `reader.html` has no `?src=` fallback worth indexing; consider `noindex` for the bare URL.
