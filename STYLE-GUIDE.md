# Munan.hub Style Guide ("Field Notebook")

Short reference for building or migrating a page. Live demo of every component: open `styleguide.html`.

## 1. Page skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page name | Munan.hub</title>
    <meta name="description" content="One clear sentence.">
    <link rel="icon" type="image/png" href="icon.png">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=Hind+Siliguri:wght@400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

    <script src="theme.js"></script>   <!-- blocking, first: sets dark/light before paint -->
    <script src="owner.js"></script>
    <link rel="stylesheet" href="site.css?v=2">
</head>
<body class="v2">
    <a class="skip" href="#main">Skip to content</a>
    <main id="main">
        <header class="page-head">
            <div class="wrap">
                <ol class="crumbs"><li><a href="index.html">Home</a></li><li aria-hidden="true">/</li><li aria-current="page">This page</li></ol>
                <span class="kicker">Section name</span>
                <h1 class="page-title">One clear title</h1>
                <p class="page-lead">One sentence that says what this page is for.</p>
            </div>
        </header>
        <div class="wrap"> ...content... </div>
    </main>
    <script src="nav.js"></script>     <!-- injects the navbar -->
    <script src="footer.js"></script>  <!-- injects the footer -->
</body>
</html>
```

Rules
- Exactly one `<h1>` per page.
- Never write navbar or footer HTML by hand. `nav.js` and `footer.js` inject them.
- Do not load `style.css` on a migrated page. Load `site.css` only.
- When `site.css` changes, bump the number in `site.css?v=2`.
- Keep `theme.js` first. It must be a normal blocking script.

## 2. Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#EEF1EA` | `#0D1512` | Page background |
| `--paper` | `#FAFBF7` | `#131E19` | Cards, panels, inputs |
| `--ink` | `#11221D` | `#E7EFEA` | Main text, solid buttons |
| `--muted` | `#44564E` | `#B3C1B9` | Body copy |
| `--soft` | `#5B6C64` | `#8FA097` | Meta text, labels |
| `--line` | `#D3DBD0` | `#243229` | All borders |
| `--lagoon` | `#0A6F48` | `#3FD39A` | Brand green: links, active states |
| `--lagoon-tint` | `#DDEBE1` | `#173126` | Icon tiles, hover, tags |
| `--marker` | `#DDF25B` | `#DDF25B` | The one loud highlight |

- **Lime (`--marker`) is a background only**, with dark text (`--on-marker`) on top. Never use it as text on a light background.
- Status colours: `--ok`, `--warn`, `--err`, `--info` (each has a `-bg` pair).
- One brand for the whole site. A tool may use a different colour only for its small icon tile.

## 3. Type

| Role | Font | Notes |
|---|---|---|
| Headings | Bricolage Grotesque 600-800 | `var(--display)`, tight letter-spacing |
| Body / UI | Figtree 400-700 | `var(--body)`, 16px, line-height 1.6 |
| Bangla | Hind Siliguri | Already in both font stacks |
| Code | JetBrains Mono / DM Mono | `var(--mono)`, tools only |

## 4. Components (class names)

| Need | Use |
|---|---|
| Page title block | `.page-head` `.kicker` `.page-title` `.page-lead` `.crumbs` |
| Long text | `.prose` (max 720px) |
| Card / panel | `.panel` (plain), `.tracker` (feature card), `.post`, `.comic` |
| Rows | `.util-list` > `.util` or `.link-row` with `.tile`, `.row-title`, `.row-desc`, `.go` |
| Buttons | `.btn-solid` `.btn-line` `.btn-ghost` `.btn-sm`, add `.btn-danger` to a solid button |
| Form | `.field` + `label` + `.input` / `.select` / `.textarea`, `.hint`, `.field-error`, `.check`, `.switch`, `.dropzone`, `.form-row` |
| Table | `.table-wrap` > `table.table` (`.num` for numbers) |
| Tabs | `.tabs` > `.tab[aria-selected]`, panels `.tab-panel[hidden]`; `.tabs.pills` for pill style |
| Feedback | `.alert .alert-ok / -warn / -err / -info`, `.toast-stack` > `.toast`, `.progress`, `.badge`, `.spinner` |
| Dialog | `.modal` > `.modal-card` (+ `.modal-actions`) |
| Numbers | `.stat` |
| Layout | `.wrap`, `.grid-2`, `.grid-3`, `.flex`, `.gap-1..3`, `.mt-1..4` |
| Owner-only element | add attribute `data-owner-only` (hidden unless the owner is signed in) |

Hover pattern for anything clickable: border turns ink, lifts 3px, arrow circle (`.go`) turns lime and rotates.

## 5. Spacing and shape
- Content width 1120px (`.wrap`), side padding 24px (18px under 480px).
- Section top padding 72px (56px on mobile).
- Border: always 1.5px solid `--line`. Almost no shadows (only the lime offset on the tag card and modal).
- Radius: cards 20px, panels 28px, tiles 14px, inputs 12px, buttons and chips fully round.

## 6. Accessibility checklist
- Visible focus ring (built in). Do not remove outlines.
- Buttons at least 40px tall. Icon-only buttons need `aria-label`.
- Every input has a `<label>`. Errors use `.field-error` and `aria-invalid="true"`.
- Images have `alt`, `width`, `height`.
- Do not rely on colour alone (add an icon or text).
- Respect `prefers-reduced-motion` (built in).

## 7. Owner-only pieces
- `owner.js` exposes `MunanOwner.isOwner(user)` (owner email **and** verified email).
- This only shows or hides things. Real protection must be Firestore rules (see `STYLE-MIGRATION-PLAN.md`, Part I).

## 8. Tool pages (Round 4)
- Body: `<body class="v2 tool">`; load `site.css?v=2` then `tool.css?v=1`.
- `tool.css` maps the old variable names (`--accent`, `--card-bg`, `--card-border`, `--text-main`, `--text-muted`, ...) to the new tokens, so tool-specific layout CSS can keep its names.
- Header: `.page-head` with `.crumbs`, `.kicker`, `.page-title`, `.page-lead`, then `<p class="tool-note">` for the one-line privacy note.
- Embedded pages (`invert-colors.html`) have no navbar and keep a small copy of the tokens in their own `:root`.
- Do not name a page class `.skip`, `.panel`, `.empty`, `.stat`, `.tab` or `.table` without checking `site.css` first.

## 9. Standalone tools and the reader (Round 5)
- Standalone tools (`booklet-maker`, `poster-splitter`, `resolution-changer`) use the same skeleton as section 8: `<body class="v2 tool">`, `site.css?v=2` then `tool.css?v=2`, `nav.js` then `footer.js`.
- Layout: `.tool-wrap` > `.tool-split` > a `.panel` (the tool) + a side column (`.tool-steps` of `.tool-step`, or a `.panel.tool-howto`). It stacks under 960px.
- Option buttons the script toggles with `.active`: `.tool-seg` (grid of pills) or `.tool-chips` (row of pills). Preview image or canvas: `.tool-preview`.
- Drop zone: `<div class="dropzone drop">`; if the script toggles a drag class, style it in the page (`.drop.drag`).
- Errors and warnings the script shows with a `.show` class: give the element `alert alert-err` / `alert-warn` and set `display:none` / `display:flex` on `.show` in the page.
- Bangla pages: `<html lang="bn">`, add `rc`-style overrides so headings use Hind Siliguri at a real weight (700) with `letter-spacing:0` and `line-height:1.25`. Load Hind Siliguri 400;500;600;700.
- A `<footer>` element in a page is removed by `footer.js`. Put the privacy sentence in `.tool-note` instead.
- Do not name a page class `.panel` when it must be `position:fixed` (site `.panel + .panel` adds a top margin). The reader uses `.rd-panel`.
- Reader (`reader.html`) is a full-viewport app: `<body class="v2 reader">`, `site.css` only (no `tool.css`, no `nav.js`). Its own bar has the logo, title, reading-mode buttons, and a theme toggle. Paper / Sepia / Dark only filter the document frame; they are a reader feature, not a site palette.

## 10. Personal apps (Round 6)
- Apps (`diary`, `english-tracker`, `garments-accounts`) use `<body class="v2 app app-xx" data-nav-hide="off">`, `theme.js` -> `owner.js` -> `site.css?v=2` -> `app.css?v=1`, then `nav.js` (and `footer.js` only on pages that scroll normally, not on fixed-sidebar apps).
- `app.css` maps each page's old variable names to the site tokens under `body.app-diary`, `body.app-et`, `body.app-ga`. Add a new block there for a new app instead of defining colours in the page.
- Text on a brand-coloured background: `color: var(--on-accent)` (white in light, dark ink in dark). Never plain `#fff`.
- Danger / success / warning use `--err`, `--ok`, `--warn`. Page-level `:root` colour blocks are not allowed.
- App chrome sits below the navbar: use `var(--nav-h)` for sticky or fixed offsets.
- Page classes that share a name with `site.css` (`.stat .hero .toast .wrap .section .empty .field .hint .badge`): the page rule must set every property it needs, and `app.css` resets leaks. Prefer a page prefix for new classes.

## 11. Fullscreen PWA trackers (Round 7)
- `moneytracker` and `healthtracker`: `<body class="v2 app-mt mt-app">` (+ `ht-app`). They keep their own top bar, drawer and bottom nav, so no shared navbar and no `app` class (it adds a navbar offset).
- Old variable names are mapped under `body.app-mt` / `body.ht-app` in `app.css`. `mt.css` must not define colours; use `--accent`, `--danger`, `--accent2`, `--warn`, `--card-bg` and friends.
- Charts read colours from CSS variables (`getComputedStyle`), never hex.
- Amber uses `--warn`; text on brand colours uses `--on-accent`; text on the top bar uses `--on-bar`.

