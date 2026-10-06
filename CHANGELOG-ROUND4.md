# Round 4 — Utility tools (changelog)

## Pages
| Page | What changed |
|---|---|
| `photo-resizer.html` | New page header (breadcrumb, kicker, title, lead, privacy note). Presets are pills (active = ink, dark mode = lime). Dropzone, cards, progress and buttons now use the green tokens. Old navbar, blobs and particles removed |
| `pdf-toolkit.html` | Same header. The 7 tool tabs keep their markup and become pill tabs (active = ink / lime). Colour Inverter iframe kept and follows the theme |
| `invert-colors.html` | Still standalone and navbar-free (it is embedded). Its own colour variables now hold the Field Notebook values for light and dark, font is Figtree, glass and glow removed |
| `TypeMaster.html` | Old navbar replaced by `nav.js`. Real `<h1>`. The 3 stats are now separate stat cards. Typing text and keys use the mono font and new tokens. Its own old-nav CSS removed |
| `drive-folder-fetch.html` | Same header. Own colour block removed so status colours come from `site.css`. Panels, tree, code output and status chips use the new tokens |

## New file: `tool.css` (v1)
Loaded after `site.css` on `<body class="v2 tool">`. It maps the old per-page variable names (`--accent`, `--card-bg`, `--card-border`, `--text-main`, `--text-muted`, `--surface`, `--border`, `--correct`, `--wrong`, ...) onto the new tokens, removes `backdrop-filter`, adds the `.tool-note` privacy chip, aligns each tool column with the page header, and gives mobile buttons a 40px minimum height. This is how every tool keeps its own layout CSS while getting the new palette.

## Shared edits to each page
- Head: `theme.js` (blocking) → `owner.js` → `site.css?v=2` → `tool.css?v=1`; Figtree / Bricolage / JetBrains Mono; Font Awesome 6.5.1; description, canonical, Open Graph, Twitter tags.
- Page `<style>` blocks: hard-coded blues, greens, reds and whites replaced with tokens; Poppins and DM Mono replaced; glow shadows removed.
- Skip link, `<main id="main">`, `nav.js` before `footer.js`.

## Not changed (checked by diff)
- All page JavaScript is unchanged except removed decoration and navbar code (particles, scroll-hide) that `nav.js` now provides. `invert-colors.html`: 0 JS lines changed.
- One class rename: in `drive-folder-fetch.html` the "not downloadable" row class `skip` is now `is-skip` (CSS and the one template line), because `site.css` already uses `.skip` for the skip-to-content link.
- Element IDs, localStorage keys and Firestore paths: unchanged.

## Tested (headless Chromium, third-party CDNs and Firebase replaced by stubs)
- 5 pages x light/dark x 320, 360, 390, 768, 1024, 1280 px = 60 checks: no horizontal scroll, one navbar, one footer, one `<h1>` (embedded invert-colors excluded from navbar/footer/h1), no page errors.
- Photo Resizer: loaded a 900x700 noisy PNG, 800x600 preset, Resize All gave 148.0 kB (limit 150 kB), download named `noise_800x600.jpg`. Both themes.
- PDF Toolkit: all 7 tabs open; iframe loads and picks up dark theme with the new colours.
- TypeMaster: typed the practice text, WPM / accuracy / time update (same behaviour as the original under the same stubs).
- Drive Folder Fetch: bad link shows the existing validation message.

## Differences from the plan
- TypeMaster has 3 stats (WPM, accuracy, time), not 4, so there are 3 stat cards.
- Tool header uses the standard `.page-head` plus a privacy note, not a separate icon-tile header.
- `invert-colors.html` keeps its own variable block (copied from the tokens) instead of loading `site.css`, so the iframe stays isolated.
- TypeMaster's dark rules were not moved into `tool.css`: the page no longer loads `style.css`, so they were simply replaced by tokens.
- PDF tab pills are styled buttons; I did not add `role="tablist"` because the tabs are built by existing JS.

## Needs you
1. **Real-file check (I could not run it here):** pdf.js and pdf-lib load from CDNs that were blocked in my sandbox. Please run one file through each PDF tab (Rotate, Split, Merge, Compress, Lock, Rearrange, Colour Inverter) and compare with the old output.
2. Drive Folder Fetch with a real API key and public folder, including "save to folder".
3. TypeMaster signed in: finish a session and confirm it appears in Session History after refresh.
4. Icons and fonts come from CDNs, so they were blank in my screenshots.
