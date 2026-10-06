# Munan.hub — New Style Analysis and Site-Wide Migration Plan

**Goal:** Bring the new homepage look ("Field Notebook") to all 29 pages, in safe rounds, without breaking any tool, login, or saved data.

**How to read this file**
1. Part A explains the new style in detail.
2. Part B shows what the site looks like today (audit of all 29 pages).
3. Part C is the strategy (how we will build it once and reuse it).
4. Part D is the round-by-round plan (what changes, in which page, in which order).
5. Part E to H cover risks, testing, decisions I need from you, and a prompt you can paste to start each round.

---

## Confirmed decisions (from Munan)

1. **One brand color for every page: green + lime.** No separate accent per tool (a tool may only keep its own small icon-tile color).
2. **Navbar is injected by `nav.js`**, the same way `footer.js` injects the footer. One file to edit.
3. **`part1.html` (Private Drive) and `bot1.html` are owner-only: only `allmunanabdullah@gmail.com`.** They are not public pages. See **Part I** for how this must be done (a login check in the page alone is not enough).

---

## Part A — Analysis of the new style ("Field Notebook")

### A1. Idea in one line
A calm, paper-like field notebook: bone-colored background, deep forest-green ink, one loud lime "highlighter" color, thick clean outlines, and big confident headings. No glass, no gradients, no floating bubbles.

### A2. What it replaces ("Sky Glass", the old look)

| Area | Old (`style.css`) | New (homepage) |
|---|---|---|
| Background | Animated sky-blue/purple/pink mesh gradient that follows the mouse | Flat bone `#EEF1EA` (dark: `#0D1512`) |
| Cards | Frosted glass (`rgba(255,255,255,.55)` + blur) | Solid paper `#FAFBF7` with a 1.5px outline |
| Accent | Sky blue `#0284c7` (dark: neon cyan `#00d4ff`) | Forest green `#0A6F48` (dark: mint `#3FD39A`) + lime `#DDF25B` |
| Font | Poppins for everything | Bricolage Grotesque (headings) + Figtree (text) + Hind Siliguri (Bangla) |
| Navbar | 52px, bright sky-blue bar, white logo | 64px, translucent bone bar, thin bottom line |
| Hover | Card lifts 6px and scales, glow shadow | Border turns ink, lifts 3px, arrow circle turns lime and rotates |
| Decoration | Blobs, bubbles, particles | One memorable object: the hanging tag card |
| Buttons | Small rounded rectangles | Pill buttons (solid ink / outlined) |

**Problems in the old style that the new one fixes**
- White logo text on a light sky-blue bar is hard to read.
- `backdrop-filter` + animated background is heavy on phones.
- Every page picked its own accent (blue, orange, green, red, amber, navy, sepia), so the site feels like several different websites.
- Poppins on everything looks generic.

### A3. Design tokens

**Light**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#EEF1EA` | Page background (bone) |
| `--paper` | `#FAFBF7` | Cards, panels |
| `--ink` | `#11221D` | Main text, inverse panels |
| `--muted` | `#44564E` | Body copy |
| `--soft` | `#5B6C64` | Meta text, labels |
| `--line` | `#D3DBD0` | Borders, dividers |
| `--lagoon` | `#0A6F48` | Brand green: links, active states |
| `--lagoon-tint` | `#DDEBE1` | Icon tiles, hover rows, tags |
| `--marker` | `#DDF25B` | The one loud highlight (buttons in dark, arrows on hover, underline) |
| `--on-ink` | `#F1F5EE` | Text on dark panels |

**Dark**

| Token | Value |
|---|---|
| `--bg` | `#0D1512` |
| `--paper` | `#131E19` |
| `--ink` | `#E7EFEA` |
| `--muted` | `#B3C1B9` |
| `--soft` | `#8FA097` |
| `--line` | `#243229` |
| `--lagoon` | `#3FD39A` |
| `--lagoon-tint` | `#173126` |
| `--marker` | `#DDF25B` (same) |

**Rules for the marker (lime):** it is a *background* color with dark text on top (`#11221D`). Never use lime as text color on a light background, because the contrast is too low.

**Legacy aliases** (so old components keep working while we migrate): `--accent → --lagoon`, `--card-bg → --paper`, `--card-border → --line`, `--text-main → --ink`, `--text-muted → --muted`, `--text-soft → --soft`, `--nav-bg → translucent bg`.

### A4. Typography

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display / headings | Bricolage Grotesque | 600–800 | Tight letter-spacing (`-.02em` to `-.035em`) |
| Body / UI | Figtree | 400–700 | 16px base, line-height 1.6 |
| Bangla | Hind Siliguri | 400, 600 | Fallback in both stacks |
| Code / numbers (tools only) | JetBrains Mono or DM Mono | 400–500 | Only inside tools, not for the shell |

Scale: hero `clamp(2.7rem, 7.4vw, 5.4rem)`, section title `clamp(1.8rem, 4vw, 2.5rem)`, card title `1.2–1.35rem`, body `.95–1.05rem`, meta `.8–.9rem`.

### A5. Layout and spacing
- Content width: `--wrap: 1120px`, side padding 24px (18px under 480px).
- Section rhythm: 72px top padding (56px on mobile), 30px under section header.
- Grids: 2-column tracker grid, auto-fit post/comic grids (`minmax(340px, 1fr)`), 3-row link lists.
- Radius: cards 20px, panels 28px, tiles 12–14px, buttons and chips 999px, tag card 10px.
- Borders are always **1.5px solid**; shadows are almost never used (only the hard lime offset on the tag card).

### A6. Component library (what we will reuse everywhere)

| Component | Class names (homepage) | Behavior |
|---|---|---|
| Navbar | `.navbar`, `.nav-logo`, `.nav-links`, `.nav-login-btn`, `.theme-toggle` | 64px, hides on scroll down, blur background, login becomes "Dashboard" when signed in |
| Hero | `.hero`, `.hero-title`, `.hero-lead`, `.hero-cta` | Staggered rise animation |
| Tag card | `.tag-card` | Rotated -2°, swings in, straightens on hover |
| Buttons | `.btn-solid`, `.btn-line` | Pill. Solid = ink (dark mode: lime). Hover = green |
| Section head | `.section-head`, `.section-title`, `.section-sub`, `.more-link` | Title left, "All …" link right with lime underline |
| Feature card | `.tracker` | Tile + arrow circle + title + text + chips |
| List row | `.util`, `.link-row` | Tile, title/desc, arrow circle; stacked in a rounded container |
| Tile | `.tile` | Green-tint square with an icon |
| Arrow circle | `.go` | Turns lime and rotates -45° on hover |
| Chip | `.chip` | Outlined pill for tags |
| Post card | `.post` | Colored side bar from `posts.js` colors |
| Comic card | `.comic` | Gradient cover from `webcomic.js` colors |
| Dark band | `.notes-band` | Ink-colored panel with lime icon and button |
| Empty state | `.empty` | Dashed outline, centered message |
| Footer | `footer.site-footer` (from `footer.js`) | Name left, outlined round social icons right |
| Skip link | `.skip` | Hidden until focused |

### A7. Motion and accessibility (already built in)
- Motion: hero rise (0.7s), tag swing, hover lift, blinking cursor. All turned off under `prefers-reduced-motion`.
- Focus: 3px green outline (lime in dark mode).
- Skip-to-content link, `aria-label` on the theme toggle, keyboard (Enter/Space) support on the toggle.
- Images have `alt`, `width`, `height`, and the profile photo has `fetchpriority="high"`.
- Mobile: no horizontal scroll from 320px to 1280px (tested).

### A8. How it is wired today (important for the plan)
- All new styles are in an inline `<style>` inside `index.html`.
- They override `style.css` only on the homepage because the page uses `body.home` and redefines the tokens on `:root`.
- That is why the other pages did not change. It also means **nothing is reusable yet** — Round 0 fixes this.

### A9. Known gaps in the new style (to fix during migration)
1. **No mobile menu.** On screens under 760px the nav links are hidden. Inner pages need a real menu (slide-down sheet).
2. **Tokens live inside `index.html`.** They must move to a shared file.
3. **No inner-page patterns yet:** page header (title + breadcrumb), form controls, tables, tabs, modals, toasts, progress bars, alerts. We must design these once.
4. **Tool pages need a "workbench" layout** (toolbar + canvas/dropzone + result panel). The homepage has no equivalent.
5. **Theme toggle only exists on the homepage.** Inner pages cannot switch theme.
6. **Icons depend on the Font Awesome CDN.** If the CDN is slow or blocked, icons turn into empty boxes.
7. **Three different Font Awesome versions** (6.4.0, 6.5.0, 6.5.1) are used across pages.

---

## Part B — Audit of the current site (29 pages)

### B1. Shared files

| File | What it does | Used by |
|---|---|---|
| `style.css` (19 KB) | Old tokens, mesh background, navbar, `.card`, `.btn`, footer, some page-specific dark rules (TypeMaster, contact) | 21 pages |
| `theme.js` | Dark/light logic, mouse-reactive mesh, `MunanTheme` API | 7 pages |
| `footer.js` | Injects the footer into the page | 21 pages |
| `posts.js`, `webcomic.js` | Data for blog and comics | index, blog, webcomic |
| `auth.js`, `firebase-config.js` | Login and Firebase setup | login, others |
| `mt.css` (64 KB), `mt-calc.css`, `mt-insights.css`, `ht.css`, `ht-insights.css` | Money and Health tracker styles | moneytracker, healthtracker |

### B2. Findings that affect the plan
1. **Theme logic is duplicated.** Only 7 pages load `theme.js`. About 13 other pages carry their own small inline copy that reads `localStorage('theme')`. The trackers and garments page have their own logic. → Unify on `theme.js`.
2. **Palettes are all different:** sky blue (most pages), orange (about), green (notes, photo-resizer), red (pdf-toolkit, diary), amber (trackers), navy (garments-accounts, bot1), sepia/cream (reader, poster-splitter, resolution-changer, booklet-maker).
3. **At least 9 font families** are loaded: Poppins, Sora, DM Sans, DM Mono, Lora, Fraunces, Inter, IBM Plex, JetBrains Mono (plus Hind Siliguri).
4. **No dark mode** on `booklet-maker`, `bot1`, `reader`.
5. **Missing `<h1>`** on about, contact, contactRep, dashboard, diary, login, part1, privacy, terms, TypeMaster, invert-colors, moneytracker, healthtracker (inner headings may exist, but no page-level `<h1>`). Bad for SEO and screen readers.
6. **Heavy inline CSS:** garments-accounts (~27 KB), diary (~25 KB), index (~19 KB), pdf-toolkit (~14 KB), TypeMaster (~14 KB).
7. **`pdf-toolkit.html` embeds tools in `<iframe>`s.** Theme must reach those embedded pages too.
8. **Background decoration:** `dashboard.html` still draws its own particles; `style.css` still has blob/bubble rules.
9. **Print and export layouts exist** (diary PDF, garments report). They must not be touched by the restyle.
10. **Firebase-dependent pages:** login, dashboard, diary, moneytracker, garments-accounts, english-tracker (and TypeMaster score sync — verify before editing). Their JS and element IDs must stay exactly the same.
11. **Two PWAs** (`manifest-moneytracker.json`, `manifest-healthtracker.json`) have their own `theme_color`.

### B3. Page inventory

Size = approximate HTML size. "Own CSS" = styles beyond `style.css`.

| # | Page | Type | Size | Palette today | Dark mode | Notes |
|---|---|---|---|---|---|---|
| 1 | `index.html` | Home | 39 KB | **New style (done)** | Yes | Template for everything |
| 2 | `about.html` | Content | 14 KB | Sky + orange | Yes (inline) | Has `.card`, `.section-label` |
| 3 | `contact.html` | Form | 9 KB | Sky | Yes | formsubmit.co form, keep action URL |
| 4 | `contactRep.html` | Confirmation | 10 KB | Sky + green | Yes | Success screen |
| 5 | `privacy.html` | Legal text | 9 KB | Sky | Yes | Long text, needs readable layout |
| 6 | `terms.html` | Legal text | 9 KB | Sky | Yes | Same as privacy |
| 7 | `projects.html` | Listing | 18 KB | Sky | Yes (`theme.js`) | 14 `.card`s, no English Tracker yet |
| 8 | `blog.html` | Listing/reader | 21 KB | Sky + Lora serif | Yes | Uses `posts.js`, `#post-id` anchors |
| 9 | `webcomic.html` | Listing/reader | 17 KB | Sky + Lora | Yes | Uses `webcomic.js` |
| 10 | `notes.html` | Listing | 15 KB | Green + Sora/DM Sans | Yes (`theme.js`) | Study notes list/viewer |
| 11 | `tools.html` | Listing | 31 KB | Blue + Sora/DM Sans | Yes | Software and extensions |
| 12 | `login.html` | Auth | 42 KB | Sky | Yes | Firebase auth, `auth.js` — high risk |
| 13 | `dashboard.html` | Hub (auth) | 17 KB | Sky | Yes | Firebase, own particles |
| 14 | `part1.html` | Private drive (**owner-only**) | 12 KB | Sky | Yes | Auth guard checks only "signed in + email verified" today. Secret (URL + password) read from Firestore `secrets/privateDrive` |
| 15 | `photo-resizer.html` | Tool | 21 KB | Sky + green | Yes | Canvas, client-side |
| 16 | `pdf-toolkit.html` | Tool | 82 KB | Sky + red | Yes | Canvas, iframes, many panels |
| 17 | `invert-colors.html` | Tool (embedded) | 92 KB | Slate | Yes (`theme.js`) | Probably the page embedded in pdf-toolkit (verify); no navbar |
| 18 | `TypeMaster.html` | Tool | 34 KB | Sky + DM Mono | Yes (`theme.js`) | Custom keyboard, table, `--surface` vars in `style.css` |
| 19 | `drive-folder-fetch.html` | Tool | 48 KB | Sky + JetBrains Mono | Yes (`theme.js`) | Code-style output |
| 20 | `booklet-maker.html` | Tool (standalone) | 15 KB | Cream + red-brown, Fraunces | **No** | No navbar/footer |
| 21 | `poster-splitter.html` | Tool (standalone) | 23 KB | Warm cream/orange, Fraunces | Yes (own) | No navbar/footer |
| 22 | `resolution-changer.html` | Tool (standalone, Bangla) | 16 KB | Warm cream/orange | Yes (own) | Bangla UI |
| 23 | `reader.html` | Document reader | 33 KB | Cream/red | **No** | Template with placeholder title |
| 24 | `bot1.html` | Technical guide (**owner-only**) | 19 KB | Navy + sky + green | **No** | Fully public today (static text in the HTML, no login). Linked from a "Coming Soon" card in `projects.html` |
| 25 | `diary.html` | App | 33 KB + `diary.js` | Sky + red + Fraunces | Yes (`theme.js`) | Firebase, PDF export |
| 26 | `english-tracker.html` | App | ~90 KB | Green (already close) | Yes (own) | Firebase, built this session |
| 27 | `garments-accounts.html` | App | ~197 KB | Navy | Yes (own) | Firebase, shared by 3 partners, print report |
| 28 | `moneytracker.html` | App (PWA) | 29 KB + 3 CSS + 3 JS | Navy + amber | Yes (own) | Firebase, charts, 36 vars |
| 29 | `healthtracker.html` | App (PWA) | 28 KB + 4 CSS + 3 JS | Navy + amber | Yes (own) | Charts, 47 vars |

---

## Part C — Strategy

### C1. Principles
1. **Build once, reuse everywhere.** Move the style into shared files; pages only add small page-specific CSS.
2. **Restyle, don't rewrite.** Do not change JavaScript logic, Firebase code, element IDs, form names, or data formats.
3. **Opt-in per page.** Old and new styles live side by side until the last round, so a half-finished migration never breaks the site.
4. **One round = one safe release.** After every round the whole site still works and can be pushed.
5. **Tools keep their personality, not their palette.** Every page uses the green/lime system; a tool may keep its own *tile icon color*, nothing more.

### C2. New shared files (created in Round 0)

| File | Content |
|---|---|
| `site.css` | Tokens (light/dark), reset, typography, layout helpers, navbar, buttons, cards, list rows, chips, forms, tables, tabs, modals, toasts, alerts, progress, footer, utilities, print rules |
| `nav.js` | **(decided)** Injects the same navbar on every page (same idea as `footer.js`), mobile menu, scroll-hide, login/dashboard button, theme toggle, and owner-only links (shown only when the owner is signed in) |
| `owner.js` (tiny) | Holds `OWNER_EMAIL = 'allmunanabdullah@gmail.com'` and a `isOwner(user)` helper (email matches **and** `emailVerified`). Used by `nav.js`, `part1.html`, `bot1.html` |
| `theme.js` (updated) | Keep the API. Remove mouse-mesh effect. Add `MunanTheme.sync()` so iframes follow the parent |
| `footer.js` (updated) | Same markup; styles move into `site.css` |
| `STYLE-GUIDE.md` | Tokens, components, do and don't (short, for future pages) |
| `tool.css` (optional) | "Workbench" layout for tool pages: toolbar, dropzone, preview, result panel |
| `app.css` (optional) | Shared styles for app pages: sidebar/tab bar, stat cards, data tables, forms |

**Opt-in switch:** a page becomes "new style" by loading `site.css` instead of `style.css` and using `<body class="v2">`. Pages without this class stay on the old look.

### C3. Page templates

| Template | Pages | Structure |
|---|---|---|
| **T1 Content** | about, privacy, terms, contactRep | Navbar → page header (kicker + h1 + lead) → narrow reading column (max 720px) → footer |
| **T2 Listing** | projects, blog, webcomic, notes, tools | Navbar → page header → filter/search row (optional) → card grid or list rows → footer |
| **T3 Form/Auth** | contact, login | Navbar → centered paper card (max 480–560px) → footer |
| **T4 Tool** | photo-resizer, pdf-toolkit, TypeMaster, drive-folder-fetch, booklet-maker, poster-splitter, resolution-changer, invert-colors | Navbar (compact) → tool header → workbench (input panel + preview/result) → footer |
| **T5 App** | diary, english-tracker, garments-accounts, moneytracker, healthtracker, dashboard | Compact top bar + sidebar (desktop) / bottom tabs (mobile) → app content |
| **T6 Document** | reader, bot1 (owner-only) | Minimal bar → readable column with typographic scale → footer |

### C4. Old → new mapping (used in every round)

| Old | New |
|---|---|
| `--accent` sky blue | `--lagoon` |
| `--card-bg` glass | `--paper` solid |
| `--card-border` | `--line` |
| `body::before` mesh, `.blob`, `.bubble`, `.particle` | removed |
| `backdrop-filter` on cards | removed (keep only on navbar) |
| `.card` (lift + scale + top glow line) | outlined card, border→ink + 3px lift |
| `.btn` full-width small | `.btn-solid` / `.btn-line` pills (full width only in grids) |
| `.section-label` pill | `.kicker` small uppercase label above `h1/h2` |
| `.back-btn` | navbar logo + breadcrumb link |
| Poppins | Figtree (body) + Bricolage Grotesque (headings) |
| Sora, DM Sans, Lora, Fraunces, Inter, IBM Plex | removed (Lora allowed only in blog/reader article body, optional) |
| Colorful gradient icon squares | `.tile` green tint (optional per-tool accent) |
| Font Awesome 6.4 / 6.5.0 / 6.5.1 | one version, 6.5.1 |

### C5. Definition of done for every page
- Loads `site.css`, `theme.js`, `nav.js`, `footer.js`; no leftover `style.css` rules needed.
- One `<h1>`, correct heading order, `lang`, meta description, canonical, Open Graph.
- Light and dark both look right; theme toggle works and remembers.
- No horizontal scroll at 320, 360, 390, 768, 1024, 1280 px.
- Keyboard: tab order is logical, focus ring visible, skip link works.
- All buttons ≥ 40px tall on mobile.
- No console errors; all links resolve.
- Existing features behave exactly as before (see round-specific checks).

---

## Part D — Round-by-round plan

Effort: **S** = about 1 hour, **M** = 2–3 hours, **L** = half a day, **XL** = a day or more.
Risk: **Low** = text/layout only, **Med** = forms/data, **High** = auth, saved data, or large CSS.

### Round 0 — Foundation (no new pages restyled)
**Effort:** L · **Risk:** Low · **Pages:** `index.html` (refactor only)

Changes
1. Create `site.css` by moving the homepage `<style>` into it and turning page-only rules into reusable components. Remove the `body.home` scoping; use `body.v2`.
2. Add missing components: page header, kicker, breadcrumb, form controls (input, select, textarea, checkbox, switch, range, file dropzone), tables, tabs, modal, toast, alert, progress bar, badge, loader.
3. Create `nav.js` with the shared navbar, **mobile menu**, scroll-hide, login/dashboard button, theme toggle on every page. Create `owner.js` (owner email + `isOwner(user)` helper) and let `nav.js` show owner-only links only to the owner.
4. Update `theme.js`: keep the API, drop mouse-mesh, add iframe sync.
5. Update `footer.js` (markup unchanged, uses `site.css`).
6. Write `STYLE-GUIDE.md` with tokens and component snippets.
7. Switch `index.html` to `site.css` + `nav.js`. Output must look identical to today.
8. Standardize the Font Awesome link and the Google Fonts link (one snippet to paste into every page).

Do not touch: `style.css` (kept for old pages), any other page.

Acceptance: homepage unchanged visually; other 27 pages unchanged; toggle and mobile menu work on the homepage.

### Round 1 — Simple content pages (T1, T3)
**Effort:** M · **Risk:** Low–Med · **Pages:** `about`, `contact`, `contactRep`, `privacy`, `terms`

Changes
- Replace `style.css` with `site.css`, add `nav.js`, `theme.js`, `footer.js`; remove inline theme snippet.
- Add page header with `<h1>` (kicker + title + lead).
- `about.html`: turn `.card` blocks into outlined cards or timeline rows; remove the orange accent; photo styled like the tag-card photo.
- `contact.html`: centered paper card; restyle inputs, textarea, button; keep `action="https://formsubmit.co/…"`, `name` attributes, and hidden fields exactly the same.
- `contactRep.html`: success state with big check tile and two buttons (Home, Send another).
- `privacy.html`, `terms.html`: 720px reading column, numbered section headings, anchor links, "last updated" line.

Acceptance: contact form still sends and redirects to `contactRep.html`; legal pages readable on 360px.

### Round 2 — Listing pages (T2)
**Effort:** L · **Risk:** Low–Med · **Pages:** `projects`, `blog`, `webcomic`, `notes`, `tools`

Changes
- `projects.html`: reuse `.tracker` cards and `.util` rows; add **English Fluency Tracker**; **remove the public "Coming Soon" card that links to `bot1.html`** (the page becomes owner-only); add category filter chips (All, Trackers, Utilities, Learning) — filter in plain JS; keep the same project list.
- `blog.html`: list view with `.post` cards; article view with 680px column; keep `posts.js` data shape and `#post-<id>` deep links; body font Figtree (Lora optional for long article text).
- `webcomic.html`: series cards like homepage `.comic`; episode viewer with large images, previous/next buttons, keyboard arrows; keep `webcomic.js` shape.
- `notes.html`: subject cards or list rows with search; keep every existing link and viewer behavior.
- `tools.html`: grouped list rows (Software, Extensions, AI tools) with `.tile` icons; keep all links.

Acceptance: every old link still exists; deep links from the homepage open the right post; `posts.js` and `webcomic.js` unchanged.

### Round 3 — Auth, hub and owner-only pages (T3, T5-light, T6)
**Effort:** L · **Risk:** High (auth + security) · **Pages:** `login`, `dashboard`, `part1`, `bot1`

> Do **Part I, Step 1 (Firestore rules)** *before* this round, right now. It does not depend on the restyle.

Changes
- `login.html`: centered auth card; tabs (Login / Sign up / Reset) styled with the new tabs component; inputs and buttons restyled only. **Do not change** `auth.js`, form IDs, error message containers, or redirect logic.
- `dashboard.html`: greeting header, grid of app cards (Money, Health, English, Diary, Garments, Drive Folder…), recent activity placeholder; remove its own particle layer.
- `part1.html`: restyle as an owner-only page (lock icon, "Private Drive" header, unlock card). Add the owner check from Part I. Keep the existing password modal and Firestore fetch.
- `bot1.html`: becomes an owner-only shell that loads its content from Firestore after the owner check (Part I, Step 3), then renders it with the document layout (sticky table of contents, code blocks, callouts). The long guide text is removed from the public repo.
- `index.html`: the **Files** row (links to `part1.html`) is shown only when the owner is signed in, via `nav.js`/`owner.js`. Other visitors do not see it.

Acceptance: sign up, login, logout, password reset, "email not verified" flow, and redirect to dashboard all work; gated pages still redirect when signed out. **Owner-only checks (Part I, Step 5) all pass.**

### Round 4 — Utility tools (T4)
**Effort:** L · **Risk:** Med · **Pages:** `photo-resizer`, `pdf-toolkit`, `invert-colors`, `TypeMaster`, `drive-folder-fetch`

Changes
- Add `tool.css` with the workbench layout: tool header (icon tile + title + one-line privacy note such as "files never leave your device"), dropzone, options panel, preview panel, action bar, result list.
- `photo-resizer`: dropzone, size presets as chips, before/after preview, download buttons.
- `pdf-toolkit`: tabs for Split / Rotate / Merge / Unlock / Invert as the new tab bar; keep every canvas and iframe; make iframe pages use the same tokens and follow the parent theme.
- `invert-colors`: compact layout without navbar (embedded), same tokens.
- `TypeMaster`: typing area as a paper panel with mono font; stats as 4 stat cards; keyboard keys restyled; move its dark rules out of `style.css` into `tool.css`.
- `drive-folder-fetch`: input row, code output block with copy button, status chips.

Acceptance: file processing results are byte-identical to before; PDF tabs and iframes work in both themes; TypeMaster WPM/accuracy numbers unchanged.

### Round 5 — Standalone and document pages (T4, T6)
**Effort:** M–L · **Risk:** Med · **Pages:** `booklet-maker`, `poster-splitter`, `resolution-changer`, `reader`

Changes
- Add the shared navbar and footer to the three standalone tools (they have none today).
- Replace the cream/orange/sepia palettes with the site tokens; drop Fraunces and IBM Plex.
- Add dark mode to `booklet-maker` and `reader`.
- `resolution-changer`: keep Bangla UI; use Hind Siliguri for headings where Bangla is shown.
- `reader.html`: document reader shell (title bar, page controls, reading column); optional "paper / sepia / dark" reading modes kept as a *reader feature*, not a site palette. Add `<title>`.

Acceptance: print/export output of booklet-maker and poster-splitter is unchanged (check a generated PDF); Bangla text renders correctly.

### Round 6 — Personal apps (T5)
**Effort:** L–XL · **Risk:** High (saved data) · **Pages:** `diary`, `english-tracker`, `garments-accounts`

Changes
- `app.css` created: compact top bar, sidebar on desktop, bottom tab bar on mobile, stat cards, data table, form rows, empty states.
- `english-tracker`: already uses a green palette — replace its custom tokens with the shared ones, use shared navbar, keep the 5-tab bottom nav and sub-tabs. Keep Firebase code untouched.
- `diary`: restyle sidebar/list/editor; keep Fraunces **only** for the entry text if you want a "paper journal" feel (optional); do not touch `diary.js`, Firestore paths, or the PDF export layout.
- `garments-accounts`: token swap only (navy → site tokens). Keep layout, tables, partner logic, print report. Because the file is ~197 KB, do this in two passes: (1) CSS variables, (2) components.

Acceptance: sign in, create, edit, delete, sync across two devices; diary PDF and garments report print identically; numbers on garments reports unchanged.

### Round 7 — Money Tracker and Health Tracker (T5)
**Effort:** XL · **Risk:** High · **Pages:** `moneytracker`, `healthtracker` (+ `mt.css`, `mt-calc.css`, `mt-insights.css`, `ht.css`, `ht-insights.css`)

Strategy: **map variables, don't rewrite markup.** These files have 36 and 47 CSS variables and about 100 KB of CSS.

Steps
1. Map `mt.css` variables to site tokens (`--accent` navy → lagoon, `--card-bg` → paper, `--nav-bg`, `--danger`, success, warning). Keep income/expense/warning semantic colors, but harmonize them with the palette.
2. Replace the app navbar with the shared compact bar; keep the PWA install behavior.
3. Restyle cards, tables, modals, calculator, insights charts. Update chart colors in `mt.js`, `mt-insights.js`, `ht.js`, `ht-insights.js` **only** where colors are hard-coded.
4. Update `manifest-*.json` (`theme_color`, `background_color`) and icons if the brand color changes.
5. Do Money Tracker first (7a), Health Tracker second (7b).

Acceptance: add/edit/delete transactions and vitals, monthly summary, PDF/CSV export, calculator, insights charts, Firebase save, and offline/PWA behavior all work as before.

### Round 8 — Cleanup and quality pass
**Effort:** M · **Risk:** Low

1. Delete old `style.css` (or reduce to a legacy stub) and remove blob/bubble/particle code and the mouse-mesh from `theme.js`.
2. Remove leftover inline theme snippets and duplicated Google Font / Font Awesome links.
3. SEO: unique `<title>` and meta description per page, one `<h1>`, canonical, Open Graph image, update `sitemap.xml` (add `english-tracker.html`), check `robots.txt`.
4. Accessibility audit: contrast (AA), focus order, labels on inputs, `aria-current` on active nav link.
5. Performance: preconnect and `display=swap` on fonts, remove unused font weights, lazy-load below-the-fold images, cache-bust `site.css?v=`.
6. Optional: self-host Font Awesome subset (or replace with inline SVG icons) so icons never break.
7. Update `README.md` and add `STYLE-GUIDE.md` link.
8. Run the full regression checklist (Part F) on all 29 pages.

---

## Part E — Risks and how we handle them

| Risk | Where | Mitigation |
|---|---|---|
| Owner-only pages readable by others | part1, bot1 | Server-side Firestore rules (Part I). A JavaScript check in the page is only a convenience, never the protection |
| Breaking login or saved data | login, dashboard, diary, trackers, garments, english-tracker | Restyle only; never rename IDs, classes used by JS, form names, or Firestore paths. Test sign-in and a save after every round |
| Theme flash (white flash in dark mode) | all pages | `theme.js` stays a blocking script in `<head>` |
| Two themes fighting during migration | mixed pages | Opt-in `body.v2`; old pages keep `style.css` until their round |
| Hard-coded colors in JS (charts, canvas) | trackers, pdf-toolkit, TypeMaster | Search for `#hex` and `rgb(` in `.js` files each round; read colors from CSS variables where possible |
| Print/PDF layouts change | diary, garments, booklet-maker, poster-splitter | Keep `@media print` blocks untouched; compare a printed sample before and after |
| Iframe pages ignore theme | pdf-toolkit ↔ invert-colors | `MunanTheme.sync()` + `postMessage` or shared `localStorage` event |
| Bangla text breaks | resolution-changer, index, blog | Always include Hind Siliguri in font stacks |
| CDN failure (fonts/icons) | all | System-font fallbacks; later optional self-hosting |
| Large files hard to edit | garments (~197 KB), pdf-toolkit (82 KB), invert-colors (92 KB) | Token swap first, components second; work in small diffs |
| Browser cache shows old CSS | GitHub Pages | Add `?v=2` to `site.css` and bump on each round |
| Data loss from `localStorage` key changes | english-tracker, trackers | Do not change storage keys (the theme key stays `theme`) |

---

## Part F — Regression checklist (run after each round)

**Visual**
- [ ] Light and dark mode look correct; no unreadable text.
- [ ] 320, 360, 390, 768, 1024, 1280 px: no horizontal scroll, nothing cut off.
- [ ] Navbar: logo, links, mobile menu, theme toggle, login/dashboard button.
- [ ] Footer appears once, links work.

**Functional**
- [ ] Every link on the page resolves (no 404).
- [ ] Forms submit; validation messages show.
- [ ] Page-specific features work (see round acceptance lines).
- [ ] Sign in → open app → save → refresh → data still there (Firebase pages).
- [ ] Theme choice persists across pages and reload.

**Quality**
- [ ] Browser console shows no errors.
- [ ] One `<h1>`; headings in order; images have `alt`.
- [ ] Keyboard-only navigation works; focus is visible.
- [ ] Lighthouse: Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.

---

## Part G — Decisions and open questions

**Decided**

| # | Question | Answer |
|---|---|---|
| 1 | Brand color | One brand: green + lime on every page |
| 2 | Navbar | `nav.js` injects it on every page |
| 8 | `part1.html` and `bot1.html` | Owner-only (`allmunanabdullah@gmail.com`) |

**Still open (my recommendation in the last column; I will use it unless you say otherwise)**

| # | Question | Recommendation |
|---|---|---|
| 3 | Keep a serif for reading (blog, reader)? | Yes, optional: Lora only for long article text. Everything else Figtree |
| 4 | Keep reader "sepia / paper" modes? | Yes, as a reader feature, not as a site palette |
| 5 | Mobile navigation style | Slide-down menu from the navbar. The apps use their own bottom tabs |
| 6 | Self-host icons and fonts? | Not now. Revisit in Round 8 |
| 7 | Money and Health trackers: keep amber? | Keep amber only for warnings and alerts, not as the brand color |
| 9 | Keep Bangla labels where they exist? | Yes, exactly as they are |
| 10 | Should anyone be able to **sign up** on `login.html`? | If only you need accounts, turn off sign-up (or keep it, but then all private data must be protected by the owner rule in Part I) |

---

## Part H — How to start each round (copy this prompt)

```text
I am migrating my GitHub Pages site (Munan.hub) to the new "Field Notebook" style.
I have attached the latest repo zip and STYLE-MIGRATION-PLAN.md.

Please do ROUND <number> only: <round name>.

Rules:
1. Follow the plan for this round exactly. Do not touch pages from other rounds.
2. Restyle only. Do not change JavaScript logic, Firebase code, element IDs,
   form names, localStorage keys, or Firestore paths.
3. Use site.css, nav.js, theme.js and footer.js from the repo.
4. Test light and dark mode at 360, 768 and 1280 px, and tell me what you tested.
5. If something in the plan does not match the real code, tell me before changing it.
6. Return the full updated repo as a zip with the same folder structure,
   plus a short CHANGELOG for this round.
```

---

## Part I — Owner-only pages (`part1.html`, `bot1.html`)

### I1. The important fact
This site is static files on GitHub Pages. **Anything inside an HTML file is downloadable by anyone** who types the URL, and if the repo is public the file is also visible on GitHub. A check like "if the user is not the owner, redirect" runs in the visitor's browser, so it only hides the page. It does **not** protect the content.

Real protection means the private data is **not in the page or the repo**. It lives in Firestore, and **Firestore security rules** only release it to the owner.

### I2. What exists today

| Page | Today | Problem |
|---|---|---|
| `part1.html` | Redirects to login if not signed in or email not verified. Then reads the Drive link + password from Firestore `secrets/privateDrive`. The secret is not in the HTML (good) | The page check allows **any** signed-in user with a verified email, not only you. Anyone can create an account on `login.html`. Whether they can read the secret depends on your Firestore rules, which are not in the repo and which I have not seen |
| `bot1.html` | A static guide (about 19 KB of text and code) in the HTML. No login check | Fully public today. It is also linked from a "Coming Soon" card in `projects.html` and old copies remain in Git history |

### I3. Required steps

**Step 1 — Firestore rules (do this now, before any restyle).** Add an owner rule and make sure no broader rule lets other signed-in users read these paths. In Firestore rules, rules are OR-ed, so a general `allow read: if request.auth != null` anywhere above would still expose everything.

```text
function isOwner() {
  return request.auth != null
    && request.auth.token.email == 'allmunanabdullah@gmail.com'
    && request.auth.token.email_verified == true;
}

match /secrets/{doc}      { allow read, write: if isOwner(); }
match /private_docs/{doc} { allow read, write: if isOwner(); }
```
Keep your existing per-user rule for the apps: `match /users/{uid}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }`.

**Step 2 — `part1.html` page guard (convenience layer).** After sign-in, if `!isOwner(user)`, redirect to `index.html` and never show the unlock UI. Keep the existing Firestore fetch and password modal.

**Step 3 — `bot1.html` becomes a shell.**
1. Copy the guide content into a Firestore document `private_docs/bot1` (fields: `title`, `html` or `markdown`, `updated`).
2. Replace `bot1.html` with a shell: navbar, loading state, owner check, fetch the document, render it. Non-owners are redirected.
3. Remove the guide text from the public repo.
4. If the old text is sensitive, note that it stays in Git history. Either accept that (it only contains setup instructions and placeholders, no real tokens as far as I could see), or rewrite the repo history, or move the repo to private.

**Step 4 — Hide the doors.**
- `index.html`: the **Files** row is rendered only for the owner (via `nav.js`/`owner.js`).
- `projects.html`: remove the public `bot1` "Coming Soon" card.
- Add `<meta name="robots" content="noindex, nofollow">` to both pages, and keep them out of `sitemap.xml`. (Note: `robots.txt` is public and lists paths, so prefer the meta tag and do not list private paths there.)
- Optional: add an owner-only "Private" group inside `dashboard.html`.

**Step 5 — Test like an attacker.**
- [ ] Signed out: opening `part1.html` and `bot1.html` redirects to login; nothing private flashes on screen.
- [ ] Signed in as a **second** test account (verified email): both pages redirect away, and a direct Firestore read of `secrets/privateDrive` and `private_docs/bot1` returns "permission denied".
- [ ] Signed in as the owner: both pages work.
- [ ] "View source" on `bot1.html` shows no guide text.
- [ ] Search the repo for the Drive URL and password: none present.
- [ ] Firestore Rules Playground (Firebase console) confirms the same.

### I4. Optional hardening (recommended)
- Turn off open **sign-up** on `login.html` if only you need an account (or require manual approval).
- Move the Drive password out of the client flow entirely if possible (for example, share the Drive folder only with your Google account so the link alone is useless).
- Never put tokens, API keys or passwords in HTML or JS files in this repo.

---

## Appendix 1 — Suggested file layout after migration

```text
/
├── index.html … (29 pages)
├── site.css          # tokens + shared components
├── tool.css          # tool workbench layout (optional)
├── app.css           # app shell layout (optional)
├── nav.js            # shared navbar
├── owner.js          # owner email + isOwner() helper
├── footer.js         # shared footer
├── theme.js          # theme logic
├── auth.js, firebase-config.js, posts.js, webcomic.js, diary.js
├── mt*.css/js, ht*.css/js     # tracker files (re-themed in Round 7)
├── STYLE-GUIDE.md
└── STYLE-MIGRATION-PLAN.md
```

## Appendix 2 — Summary table (page → round)

| Round | Pages | Count | Risk |
|---|---|---|---|
| 0 | Foundation (+ `index.html` refactor) | 1 | Low |
| 1 | about, contact, contactRep, privacy, terms | 5 | Low–Med |
| 2 | projects, blog, webcomic, notes, tools | 5 | Low–Med |
| 3 | login, dashboard, part1, bot1 (owner-only, see Part I) | 4 | High |
| 4 | photo-resizer, pdf-toolkit, invert-colors, TypeMaster, drive-folder-fetch | 5 | Med |
| 5 | booklet-maker, poster-splitter, resolution-changer, reader | 4 | Med |
| 6 | diary, english-tracker, garments-accounts | 3 | High |
| 7 | moneytracker, healthtracker | 2 | High |
| 8 | Cleanup, SEO, accessibility, performance | all | Low |
| | **Total pages covered** | **29** | |
