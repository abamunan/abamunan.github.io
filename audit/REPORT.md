# 🔍 Full-Stack UI/UX Audit Report — Munan.hub

**Auditor:** Antigravity AI (Senior Front-End Auditor)
**Date:** 2026-11-08
**Reference Theme:** MoneyTracker (`apps/money/app.css` + `site.css`)
**Scope:** All 28+ HTML pages, 10 CSS files, 15+ JS files, PWA configs

---

## 1. Project Overview

### File Tree (Key Files)

```
abamunan.github.io-main/
├── CORE PAGES (use site.css "Field Notebook" v3)
│   ├── index.html            — Homepage / portfolio landing
│   ├── login.html            — Auth (email + Google sign-in)
│   ├── dashboard.html        — User dashboard (post-login)
│   ├── about.html            — About / bio page
│   ├── blog.html             — Blog listing + modal reader
│   ├── contact.html          — Contact form (FormSubmit)
│   ├── projects.html         — Project showcase listing
│   ├── privacy.html          — Privacy policy
│   ├── terms.html            — Terms of service
│   ├── notes.html            — Subject notes listing
│   ├── tools.html            — Tool directory page
│   └── webcomic.html         — Webcomic listing + viewer
│
├── PRIVATE APPS (use app.css → maps to site.css tokens)
│   ├── diary.html            — Personal diary (site.css + app.css)
│   ├── part1.html            — Private Drive access (site.css)
│   ├── english-tracker.html  — English fluency tracker (site.css + app.css, ~3700 LOC)
│   └── garments-accounts.html— Garment accounting app (site.css + app.css, ~3300 LOC)
│
├── TOOL PAGES (use site.css + tool.css)
│   ├── booklet-maker.html    — PDF booklet creator
│   ├── pdf-toolkit.html      — Multi-tool PDF processor (~1900 LOC)
│   ├── photo-resizer.html    — Image resizer
│   ├── poster-splitter.html  — Poster splitting tool
│   ├── resolution-changer.html— Image resolution tool
│   ├── invert-colors.html    — Color inverter (~2100 LOC)
│   ├── drive-folder-fetch.html— Google Drive folder browser
│   └── TypeMaster.html       — Typing speed test
│
├── STANDALONE PAGES (OWN theme — NOT on site.css)
│   ├── contactRep.html       — Pink-themed contact reply (Dancing Script + Poppins)
│   ├── reader.html           — Fullscreen document reader (site.css, no nav/footer)
│   ├── bot1.html             — AI chatbot docs (site.css)
│   └── styleguide.html       — Living style guide demo
│
├── PWA APPS (apps/ directory — own CSS, own tokens)
│   ├── apps/money/           — Money Tracker PWA ★ REFERENCE THEME
│   │   ├── index.html
│   │   ├── app.css           — 2388 lines, full glassmorphism design system
│   │   ├── main.js           — SPA router
│   │   ├── manifest.json
│   │   ├── sw.js             — Service worker
│   │   ├── components/       — UI components (sheets, calculator, charts)
│   │   ├── views/            — Tab views (today, history, insights, plan, manage, accounts, export, more)
│   │   ├── domain/           — Business logic
│   │   ├── data/             — Storage, backup, sync
│   │   └── tests/            — Selenium + JS tests
│   ├── apps/health/          — Health Tracker PWA (mirrors money's design)
│   │   ├── index.html
│   │   ├── app.css           — 144 lines, same token values as money
│   │   └── (same structure as money/)
│   └── apps/shared/          — Shared components
│       ├── ui.css            — 54 lines, shared component styles
│       └── *.js              — Shared JS (tabbar, toast, sheet, confirm, etc.)
│
├── CSS FILES
│   ├── site.css              — 610 lines, "Field Notebook" design system v3 ★ MAIN SITE CSS
│   ├── style.css             — 419 lines, ⚠️ LEGACY ("Poppins" era) — COMPLETELY DIFFERENT THEME
│   ├── app.css               — 110 lines, private app token bridge
│   ├── tool.css              — 153 lines, tool page layer
│   └── garments-calc.css     — 14979 bytes, garments app styles
│
├── JS FILES
│   ├── theme.js              — Shared dark/light toggle
│   ├── owner.js              — Owner detection
│   ├── auth.js               — Firebase auth logic
│   ├── firebase-config.js    — Firebase init (API key exposed)
│   ├── nav.js                — Dynamic navbar injection
│   ├── footer.js             — Dynamic footer injection
│   ├── posts.js              — Blog post data
│   ├── webcomic.js           — Webcomic data
│   ├── more.js               — "More" menu logic
│   ├── diary.js              — Diary app logic (55760 bytes)
│   └── garments-calc.js      — Garments calculator
│
├── CONFIG / DOCS
│   ├── STYLE-GUIDE.md        — Style guide documentation
│   ├── STYLE-MIGRATION-PLAN.md— Migration plan (39625 bytes)
│   ├── ROADMAP.md            — Project roadmap
│   ├── design.md             — Design decisions
│   ├── README.md             — Project readme
│   ├── firestore.rules       — Firestore security rules
│   ├── robots.txt, sitemap.xml, CNAME
│   ├── package.json          — Minimal (no build step)
│   └── manifest-*.json       — PWA manifests (legacy, at root)
│
└── ASSETS
    ├── *.png, *.jpg           — Images (root level, not organized)
    ├── loading*.json          — Lottie animations
    └── Renilla_reniformis.pptx— Unrelated PowerPoint file
```

### Stylesheet Architecture Map

| Page Group | CSS Chain | Theme Match |
|---|---|---|
| Core pages (index, about, blog, etc.) | site.css → inline `<style>` | ✅ Matches reference |
| Tool pages (pdf-toolkit, photo-resizer, etc.) | site.css → tool.css → inline `<style>` | ✅ Matches reference |
| Private apps (diary, english-tracker, garments) | site.css → app.css → inline `<style>` | ✅ Matches reference |
| Money Tracker PWA | site.css → ui.css → money/app.css | ★ IS the reference |
| Health Tracker PWA | site.css → ui.css → health/app.css | ✅ Matches reference |
| **contactRep.html** | **NONE — fully inline** | ❌ **Completely different** |
| **TypeMaster.html (dark mode)** | site.css + tool.css + **style.css dark overrides** | ⚠️ **Legacy tokens** |
| **Any page loading style.css** | style.css | ❌ **Completely different theme** |

---

## 2. Reference Theme Summary

See [`audit/theme-tokens.css`](file:///d:/Portfolio/abamunan.github.io-main/audit/theme-tokens.css) for the full token file.

**Key characteristics:**
- **Light mode:** Mint-green glassmorphism — `--bg: #F3F8F5`, emerald primary `--lagoon: #0D8255`, `--marker: #10B981`
- **Dark mode:** Deep midnight blue-black — `--bg: #060913`, cyan primary `--lagoon: #38BDF8`, `--marker: #22D3EE`
- **Fonts:** Display = Bricolage Grotesque, Body = Figtree, Mono = JetBrains Mono
- **Cards:** `backdrop-filter: blur(24px) saturate(160%)`, 24px radius, 1px glass borders
- **Buttons:** pill (999px radius) or 14px radius, min-height 44-48px
- **Theme switch:** `[data-theme="dark"]` on `:root`, managed by `theme.js`

---

## 3. Executive Summary — Top 10 Problems (Ranked by Severity)

| # | Severity | Problem | Impact |
|---|----------|---------|--------|
| 1 | 🔴 Critical | **`style.css` is a completely different design system** — different font (Poppins at 14px), different color tokens (`--accent: #0284c7` vs `--lagoon: #0D8255`), different card/navbar/footer styles, different z-index scale, different animations | Every page using it gets a mismatched theme. Also, `style.css` dark-mode overrides use 14× `!important` which leak into pages that also load `site.css` |
| 2 | 🔴 Critical | **XSS via `innerHTML` with user data** — `dashboard.html:251` injects `user.displayName` via innerHTML without escaping | Account compromise via crafted display name |
| 3 | 🟠 High | **Firebase API key in plaintext** in `firebase-config.js:12` — plus client-side password check in `part1.html:190` | Key is accessible in source; password comparison is bypassable |
| 4 | 🟠 High | **156+ `innerHTML` assignments** across 22 files, many with template literals rendering user/dynamic data | Broad XSS attack surface |
| 5 | 🟠 High | **`contactRep.html` is a completely standalone page** — no `site.css`, no `theme.js`, no nav/footer, pink color scheme, Dancing Script font, no dark mode | Feels like a different website entirely |
| 6 | 🟡 Medium | **Massive inline `<style>` blocks** — diary.html has 455 lines, english-tracker.html has 1154 lines, garments-accounts.html has ~140 lines of inline CSS | Unmaintainable; duplicates patterns already in site.css |
| 7 | 🟡 Medium | **Hardcoded colors in JS** — login.html (`#ef4444`, `#f97316`, `#eab308`, `#22c55e`), tools.html (80+ hex colors for icons), style.css dark overrides (`#f1f5f9`, `#020617`, etc.) | Colors don't respect theme tokens; won't adapt to future theme changes |
| 8 | 🟡 Medium | **Inconsistent responsive breakpoints** — 8 different breakpoints used across pages (480, 560, 600, 700, 760, 768, 900, 960px) | Layouts break at different screen widths |
| 9 | 🟡 Medium | **Root-level image dumping** — `10.png`, `11.jpg`, `12.jpg`, `13.jpg`, `icon.png`, `image.jpg` plus a `.pptx` file sitting at project root | No asset organization; naming is meaningless |
| 10 | 🟡 Medium | **Duplicate CSS tokens** defined 4× — site.css, money/app.css, health/app.css, and app.css (english-tracker) all independently declare the same token values | Any token change must be repeated in 4 files |

---

## 4. Theme Inconsistency Table

### 4.1 The `style.css` vs `site.css` Conflict (the #1 problem)

These two files define **entirely different design systems**:

| Token | `site.css` (Reference) | `style.css` (Legacy) |
|-------|----------------------|---------------------|
| Font family | `Figtree`, `Bricolage Grotesque` | `Poppins`, `Hind Siliguri` |
| Base font size | `16px` | `14px` |
| `--bg` / background | `#F3F8F5` (mint) | `#e0f2fe → #fff` (blue gradient) |
| `--accent` / primary | `#0D8255` (emerald) | `#0284C7` (blue) |
| Dark primary | `#38BDF8` (cyan) | `#00D4FF` (neon cyan) |
| `--card-bg` | `rgba(255,255,255,.76)` glass | `rgba(255,255,255,.55)` glass |
| Navbar height | `64px` | `52px` |
| Navbar bg | Glass surface | `rgba(14,165,233,.88)` (blue) |
| Card radius | `24px` | `16px` |
| Button style | Pill (999px radius) | `8px` radius |
| Footer width | Full width, left-aligned | `480px` centered |
| Footer socials size | `40px` circles | `22px` circles |
| Scrollbar thumb | `var(--line)` | `rgba(2,132,199,.25)` |

**Files still loading `style.css`:** TypeMaster.html's dark-mode overrides at `style.css:336-419` are specifically targeting TypeMaster elements. This means `style.css` is actively used.

### 4.2 Per-Page Theme Deviation Matrix

| Page | Score | Key Deviations |
|------|-------|----------------|
| **index.html** | 9/10 | Minor: 15 inline `style=""`, some hardcoded `rgba()` in inline `<style>` (L55, L61), `#7bdab0` (L181) |
| **login.html** | 8/10 | Hardcoded password-strength colors in JS (L378: `#ef4444`, `#f97316`, `#eab308`, `#22c55e`), `#fff` in CSS (L75) |
| **dashboard.html** | 9/10 | Minor: 2 inline styles, JS-set display styles |
| **about.html** | 9/10 | `!important` in inline style (L142: `margin-bottom:18px !important`) |
| **blog.html** | 9/10 | JS-generated inline styles for strip colors (OK — uses CSS custom props) |
| **contact.html** | 10/10 | Clean — no inline styles, proper token usage |
| **projects.html** | 7/10 | **24 inline `style=""` attributes** — 12× `font-size:1.35rem`, 12× `font-size:.75rem` (should be CSS classes) |
| **privacy.html** | 9/10 | Legal page styles duplicated with terms.html (L30-51 identical) |
| **terms.html** | 9/10 | Legal page styles duplicated with privacy.html (L30-51 identical) |
| **tools.html** | 8/10 | 80+ hardcoded hex colors for tool icon backgrounds in JS data (L71-123) |
| **notes.html** | 9/10 | 2 hardcoded colors in JS data: `#16a34a` (L81), `#0284c7` (L96) |
| **diary.html** | 6/10 | **455-line inline `<style>` block**, 4 inline `style=""`, hardcoded `rgba()` values, `!important` on disabled button (L208), z-index mismatch (1500/2000/3000 vs site scale) |
| **reader.html** | 7/10 | 183-line inline `<style>`, 5 inline `style=""`, hardcoded `#fff`, `#11221D`, `rgba()` values, NO nav.js/footer.js, custom z-index scale (5-30) |
| **bot1.html** | 9/10 | Minor: `[hidden]{display:none !important}`, hardcoded dark-mode pre colors |
| **webcomic.html** | 8/10 | Missing focus trap in modal, `style="font-size:.4rem"` inline |
| **booklet-maker.html** | 9/10 | 1 inline `style=""`, clean otherwise |
| **styleguide.html** | 9/10 | 4 inline `style=""` for demo components (acceptable), missing meta tags |
| **part1.html** | 8/10 | 3 inline `style=""`, `console.error`, Firebase secrets stored on `window` |
| **english-tracker.html** | 7/10 | **1154-line inline `<style>`**, defines own glass tokens (`--et-glass-*`), hardcoded `#f59e0b` (L195), `!important` on focus (L65), 36 `innerHTML` uses |
| **garments-accounts.html** | 6/10 | **~140-line inline `<style>`**, uses legacy token names (`--accent2`, `--danger`, `--surface`), many hardcoded colors, 29 `innerHTML` uses |
| **pdf-toolkit.html** | 7/10 | 22 `innerHTML` uses, embedded iframe for invert-colors, massive inline JS |
| **photo-resizer.html** | 8/10 | 4 `innerHTML` uses, proper tool.css layer |
| **poster-splitter.html** | 8/10 | Minor issues only |
| **resolution-changer.html** | 8/10 | Proper tool.css layer |
| **invert-colors.html** | 7/10 | Large (~2100 LOC), embedded in pdf-toolkit iframe, own token system |
| **drive-folder-fetch.html** | 7/10 | Generates iframe with hardcoded font `Consolas, "Courier New"` (L889), 2 `innerHTML` |
| **TypeMaster.html** | 5/10 | **Uses `style.css` dark-mode overrides** with 14× `!important`, hardcoded colors (`#f1f5f9`, `#020617`, `#020617`, `#64748b`, etc.), `--surface` variable conflicts with site.css tokens |
| **contactRep.html** | 1/10 | **ZERO theme alignment** — own pink palette (`--pink-50` through `--pink-700`), Dancing Script + Poppins fonts, no site.css, no theme.js, no dark mode, no nav, no footer, no skip link, missing OG meta |
| **apps/money/** | 10/10 | ★ IS the reference theme |
| **apps/health/** | 10/10 | Perfect token match with reference |

### 4.3 Detailed Deviations (File:Line → Current → Should Be)

| File:Line | Current Value | Should Be (Reference Token) | Category |
|-----------|--------------|---------------------------|----------|
| `style.css:54` | `font-family: 'Poppins', 'Hind Siliguri'` | `var(--body)` = `'Figtree', 'Plus Jakarta Sans', ...` | Font |
| `style.css:57` | `font-size: 14px` | `16px` (site.css base) | Font size |
| `style.css:25` | `--accent: #0284c7` | `--lagoon: #0D8255` | Primary color |
| `style.css:43` | `--accent: #00d4ff` (dark) | `--lagoon: #38BDF8` | Dark primary |
| `style.css:26` | `--nav-bg: rgba(14,165,233,.88)` | `color-mix(in srgb, var(--bg) 84%, transparent)` | Navbar bg |
| `style.css:147` | `height: 52px` (navbar) | `var(--nav-h)` = `64px` | Navbar height |
| `style.css:209` | `border-radius: 16px` (card) | `var(--r-card)` = `24px` | Card radius |
| `style.css:240` | `border-radius: 8px` (button) | `999px` or `var(--r-input)` = `14px` | Button radius |
| `style.css:274-275` | `background: #f0f9ff; color: #334155` (footer) | `background: transparent; border-top: 1.5px solid var(--line)` | Footer |
| `style.css:342` | `background: rgba(255,255,255,0.06) !important` | `var(--glass-card)` | Card dark bg |
| `style.css:370` | `color: #f1f5f9 !important` | `var(--ink)` | Text color |
| `style.css:384-386` | All inputs: `!important` override on bg/color/border | Should use `var(--paper)`, `var(--ink)`, `var(--line)` | Form inputs |
| `login.html:378` | `['#ef4444','#f97316','#eab308','#22c55e']` | `[var(--err), var(--warn), var(--warn), var(--ok)]` | Strength colors |
| `contactRep.html:17` | `--pink-50:#fff0f7` (entire palette) | Site token system | Entire page |
| `contactRep.html:20` | `font-family: 'Poppins', ...` | `var(--body)` | Font |
| `diary.html:338` | `rgba(13,21,18,.55)` (overlay) | `rgba(17,34,29,.55)` (site.css modal) | Overlay color |
| `english-tracker.html:65` | `outline: 2px solid var(--ac) !important` | `outline: 2px solid var(--lagoon)` (no !important) | Focus |
| `tools.html:71-123` | 80+ hardcoded hex colors | Should use CSS variables or inline `style` bound to data | Icon colors |
| `projects.html:82-162` | 24× `style="font-size:1.35rem"` / `style="font-size:.75rem"` | CSS classes `.row-title` (already exists!) and `.go i` | Inline styles |

---

## 5. Other Issues by Category

### 🔴 CRITICAL — Security

| # | Issue | File:Line | Detail |
|---|-------|-----------|--------|
| S1 | XSS — user displayName rendered via `innerHTML` | `dashboard.html:251` | `greetMsg.innerHTML = \`Hello, <span>$\{name\}</span>\`` where name comes from `user.displayName`. A display name containing `<img onerror=...>` would execute. |
| S2 | Firebase API key in source | `firebase-config.js:12` | `apiKey: "AIzaSyDl0Cqhjj-X9SjwMrrTWi_lW4ADsI8Gnq0"` — while Firebase API keys are designed to be public, this should have domain restrictions in Firebase Console. |
| S3 | Client-side password gate | `part1.html:190` | `el.input.value === window.__drivePass` — password fetched from Firestore and compared client-side. Bypassable via devtools. |
| S4 | Secrets stored on `window` | `part1.html:158-159` | `window.__driveURL` and `window.__drivePass` — accessible from console. |

### 🟠 HIGH — `innerHTML` / XSS Surface

| # | File | innerHTML Count | Risk Level |
|---|------|----------------|------------|
| H1 | `english-tracker.html` | 36 | Medium — most data is local |
| H2 | `garments-accounts.html` | 29 | Medium — most data is local |
| H3 | `pdf-toolkit.html` | 22 | Low — file processing |
| H4 | `diary.js` | 20 | Medium — diary entries from Firestore |
| H5 | `blog.html` | 9 | Medium — `p.content` rendered as raw HTML (L167) |
| H6 | `tools.html` | 6 | Low — static data |
| H7 | `index.html` | 5 | Low — static data from posts.js/webcomic.js |

### 🟠 HIGH — Code Duplication

| # | Issue | Files | Lines |
|---|-------|-------|-------|
| D1 | **Token declaration repeated 4×** | `site.css:18-104`, `money/app.css:9-115`, `health/app.css:1-26`, `app.css:46-87` | ~400 lines total |
| D2 | **Legal page styles duplicated** | `privacy.html:30-51`, `terms.html:30-51` | 21 lines × 2 (byte-identical) |
| D3 | **Inline `<style>` blocks that duplicate site.css patterns** | diary (455 lines), english-tracker (1154 lines), reader (183 lines) | 1792 lines that could be reduced |
| D4 | **Google Fonts link duplicated** on every page | All 26 HTML files except contactRep | Same URL string repeated 25× |
| D5 | **`theme.js` + `owner.js` script tags** duplicated | All 25 pages | Same `<script>` tags |
| D6 | **Footer/nav injection** via JS on every page | `nav.js` + `footer.js` loaded on ~23 pages | Could be build-time includes |

### 🟡 MEDIUM — Accessibility

| # | Issue | File:Line | Detail |
|---|-------|-----------|--------|
| A1 | No focus trap in modals | `blog.html`, `webcomic.html`, `styleguide.html`, `part1.html` | Tab can escape modal dialogs |
| A2 | Missing `aria-hidden` on decorative icons | `index.html:535-551`, `diary.html` (15+ icons) | Screen reader announces icon Unicode |
| A3 | Missing `required` attribute on form inputs | `login.html:149,157,243,251,267,288` | JS-only validation, no native form validation |
| A4 | **No skip link, no dark mode** | `contactRep.html` | Only page without accessibility basics |
| A5 | Emoji icons not marked `aria-hidden` | `reader.html` dock buttons (📖🔖📝⏱🔗⌨) | Screen reader reads emoji names |
| A6 | Missing `alt` text on dynamically loaded images | `dashboard.html:101` (avatar has no initial `src`) | Broken image flash |

### 🟡 MEDIUM — `!important` Abuse

| # | File:Line | Declaration | Legitimate? |
|---|-----------|------------|-------------|
| I1 | `style.css:342-395` | **14 declarations** — all dark-mode input/card overrides | ❌ No — these fight `site.css` specificity because both files load |
| I2 | `site.css:150` | `display:none !important` (owner-only) | ✅ Yes — security-critical hide |
| I3 | `site.css:427` | `display:none !important` (nav-sheet above 901px) | ✅ Yes — responsive override |
| I4 | `site.css:453-454` | `animation/transition-duration: .001ms !important` | ✅ Yes — reduced-motion |
| I5 | `site.css:457` | Print hide: `display:none !important` | ✅ Yes — print stylesheet |
| I6 | `app.css:35-37` | `backdrop-filter: none !important` | ⚠️ Debatable — blanket override |
| I7 | `index.html:452-459` | Reduced-motion overrides | ✅ Yes |
| I8 | `about.html:39,142` | `margin-bottom:18px !important` (inline + class) | ❌ No — fix the cascade |
| I9 | `diary.html:208` | `transform:none !important; box-shadow:none !important` | ⚠️ Could use `:disabled` specificity |
| I10 | `english-tracker.html:65` | `outline: 2px solid var(--ac) !important` | ❌ No — raise specificity instead |

### 🟡 MEDIUM — JS Issues

| # | Issue | File:Line | Detail |
|---|-------|-----------|--------|
| J1 | Global variable pollution | `login.html` | 14+ global functions (`switchTab`, `showMsg`, `handleLogin`, etc.) |
| J2 | Global variable pollution | `webcomic.html` | 7 global functions + 3 global vars |
| J3 | Global variable pollution | `tools.html` | 8+ global vars (`MY_TOOLS`, `grid`, `input`, etc.) |
| J4 | `console.error` left in production | 14 files | See scan results (auth.js:130, diary.js:350, etc.) |
| J5 | `window.__driveURL/Pass` | `part1.html:158-159` | Secrets on window object |
| J6 | No error boundary on Firebase calls | Multiple | Some Firebase calls lack try/catch |

### 🟡 MEDIUM — Performance

| # | Issue | File | Detail |
|---|-------|------|--------|
| P1 | Blocking scripts in `<head>` | All pages | `theme.js` + `owner.js` are render-blocking (intentional for theme.js, questionable for owner.js) |
| P2 | Root-level images not optimized | `moneytracker-512.png` (901KB), `10.png` (299KB) | No WebP/AVIF, no srcset |
| P3 | Google Fonts loads 5 families | All pages | Bricolage Grotesque + Figtree + Hind Siliguri + Plus Jakarta Sans + JetBrains Mono |
| P4 | Font Awesome full CSS loaded | All pages | Only a handful of icons used per page; entire FA 6.5.1 CSS loaded |
| P5 | No `<link rel="preload">` for critical CSS | All pages | `site.css` could be preloaded |
| P6 | Lottie JSON files at root | `loading1.json` (163KB), `loading2.json` (140KB), `loading3.json` (93KB) | Unclear if still used |

### 🟢 LOW — SEO / Meta

| # | Issue | File | Detail |
|---|-------|------|--------|
| M1 | Missing `twitter:image` | All pages except index.html | OG image present but Twitter card image missing |
| M2 | Missing `robots` meta | `bot1.html`, `booklet-maker.html` | Defaults to index,follow (may be intentional) |
| M3 | Missing OG + Twitter meta | `contactRep.html` | No social sharing metadata |
| M4 | Missing `author`, `canonical` | `styleguide.html` | Incomplete meta |

### 🟢 LOW — Naming Inconsistencies

| # | Issue | Examples |
|---|-------|---------|
| N1 | Filename casing | `TypeMaster.html` (PascalCase) vs `booklet-maker.html` (kebab-case) vs `contactRep.html` (camelCase) |
| N2 | CSS class naming | site.css uses kebab-case (`.btn-solid`), app.css uses short names (`.addbtn`, `.ghostbtn`), english-tracker uses custom abbreviations (`.et-*`, `.pill.flame`) |
| N3 | JS naming | `handleLogin` vs `handleGoogle` vs `openForgotPassword` — mixed verb patterns |
| N4 | Legacy token names | `--accent` vs `--lagoon`, `--card-bg` vs `--paper`, `--text-main` vs `--ink` — aliases exist but usage is inconsistent |

---

## 6. Duplicate / Unused File List

### Likely Unused or Orphaned Files

| File | Size | Reason |
|------|------|--------|
| `Renilla_reniformis.pptx` | 220KB | PowerPoint file at project root — not referenced anywhere |
| `loading1.json` | 163KB | Lottie animation — not referenced in any scanned HTML |
| `loading2.json` | 140KB | Lottie animation — not referenced in any scanned HTML |
| `loading3.json` | 93KB | Lottie animation — not referenced in any scanned HTML |
| `asset` | 2 bytes | Empty or near-empty file |
| `apps/health/data/a` | 2 bytes | Empty placeholder |
| `apps/health/domain/a` | 2 bytes | Empty placeholder |
| `apps/health/charts.js` | 2 bytes | Empty/stub |
| `apps/money/tests/run.js` | 2 bytes | Empty stub (replaced by `run.mjs`) |
| `apps/health/tests/run.js` | 2 bytes | Empty stub (replaced by `run.mjs`) |
| `apps/money/tools/check-backup.js` | 2 bytes | Empty stub (replaced by `.mjs`) |
| `apps/shared/a.css` | 2 bytes | Empty placeholder |
| `10.png`, `11.jpg`, `12.jpg`, `13.jpg` | 825KB total | Numbered images with no clear purpose |
| `image.jpg` | 141KB | Generic name, unclear usage |
| `icon.png` | 87KB | Generic name |

### Duplicate / Redundant CSS

| Item | Files | Status |
|------|-------|--------|
| **`style.css` vs `site.css`** | Both at root | `style.css` is the OLD design system. `site.css` is the NEW one. Both are loaded by different pages and contain conflicting rules. |
| **Legal page styles** | `privacy.html:30-51`, `terms.html:30-51` | Byte-identical blocks |
| **Token declarations** | `site.css`, `money/app.css`, `health/app.css`, `app.css` | Same values declared independently 4× |
| **Root-level manifest files** | `manifest-moneytracker.json`, `manifest-healthtracker.json` | Likely superseded by `apps/money/manifest.json`, `apps/health/manifest.json` |
| **Root-level PWA icons** | `moneytracker-192.png`, `moneytracker-512.png`, `healthtracker-192.png`, `healthtracker-512.png` | Duplicated at `apps/money/icon-*.png`, `apps/health/icon-*.png` |

---

## 7. Proposed Refactor Plan

### Phase 1: Eliminate the Split-Brain CSS (Effort: 2-3 hours)

> [!CAUTION]
> The #1 source of inconsistency is `style.css` coexisting with `site.css`. They define competing design systems.

1. **Audit which pages actually load `style.css`** — grep shows TypeMaster.html dark-mode overrides live in style.css. The file may also be loaded by pages not yet migrated.
2. **Move TypeMaster dark-mode overrides** (style.css:336-419) into TypeMaster.html's inline `<style>` or into `tool.css`.
3. **Delete `style.css`** once all its consumers are migrated. This removes all 14 `!important` overrides and the conflicting Poppins/14px/blue theme.
4. **Replace all hardcoded colors** in the moved overrides with `site.css` tokens.

### Phase 2: Create Shared Components (Effort: 2-3 hours)

1. **Extract legal-page styles** from privacy.html/terms.html inline blocks → add `.legal`, `.legal-meta`, `.toc` classes to `site.css`.
2. **Create `.icon-arrow-sm` and `.row-title-lg`** classes in site.css to replace the 24 inline styles in projects.html.
3. **Add password-strength colors** as CSS variables: `--strength-weak: var(--err)`, etc.

### Phase 3: Consolidate Token Declarations (Effort: 1-2 hours)

1. **Make `site.css` the single source** of all token values.
2. **Remove duplicate `:root` token blocks** from `money/app.css`, `health/app.css`, and `app.css`. These files should only contain app-specific overrides, not re-declarations.
3. **Standardize breakpoints** to 4 canonical values: `480px`, `700px`, `900px`, `max-width: var(--wrap)`.

### Phase 4: Page-by-Page Cleanup (Effort: 4-6 hours)

For each page, in order of severity:

| Priority | Page | Action | Effort |
|----------|------|--------|--------|
| 1 | `contactRep.html` | Add site.css, theme.js, nav.js, footer.js; migrate to token system; add dark mode | 30 min |
| 2 | `TypeMaster.html` | Remove style.css dependency; use site.css/tool.css tokens for dark mode | 20 min |
| 3 | `diary.html` | Extract 455-line inline `<style>` → `diary-page.css`; replace hardcoded values with tokens | 40 min |
| 4 | `english-tracker.html` | Reduce 1154-line inline `<style>`; consolidate `--et-*` tokens into app.css bridge | 60 min |
| 5 | `garments-accounts.html` | Migrate legacy token names to standard names | 30 min |
| 6 | `reader.html` | Extract 183-line inline `<style>` → `reader-page.css` | 20 min |
| 7 | `projects.html` | Replace 24 inline styles with CSS classes | 10 min |
| 8 | `login.html` | Replace hardcoded JS colors with CSS variable reads | 10 min |
| 9 | `tools.html` | Move icon colors to CSS classes or data attributes | 20 min |
| 10 | All pages | Add missing `twitter:image` meta tag | 15 min |

### Phase 5: Security Fixes (Effort: 1-2 hours)

1. **Fix XSS in dashboard.html:251** — use `textContent` instead of `innerHTML` for user displayName.
2. **Audit all 156 `innerHTML` uses** — replace with `textContent` or DOM API where possible; sanitize where HTML is needed.
3. **Move client-side password check** in part1.html to a Cloud Function or Firestore security rule.
4. **Add Firebase API key restrictions** in Firebase Console (HTTP referrer restrictions).

### Phase 6: Cleanup (Effort: 30 min)

1. **Delete orphaned files:** `Renilla_reniformis.pptx`, `loading*.json` (if unused), `asset`, empty stubs (`a`, `a.css`, `charts.js`, `run.js`, `check-backup.js`).
2. **Move root images** to an `/images/` directory.
3. **Delete root-level PWA manifests/icons** if superseded by `apps/*/manifest.json`.
4. **Standardize file naming** to kebab-case.

---

## 8. Quick Wins (Under 10 Minutes Each)

| # | What | Where | Fix |
|---|------|-------|-----|
| 1 | Fix XSS in greeting | `dashboard.html:251` | Change `innerHTML` to `textContent` for the name span |
| 2 | Remove 24 inline styles | `projects.html:82-162` | Already have `.row-title` (font-size:1.08rem in site.css) and `.go i` — just remove the `style=""` |
| 3 | Add `twitter:image` everywhere | All pages | Copy the og:image content to a twitter:image meta tag |
| 4 | Extract legal CSS | `privacy.html:30-51` + `terms.html:30-51` | Move the 21 lines to site.css, remove from both pages |
| 5 | Add `required` to login inputs | `login.html:149,157,243,251,267,288` | Add `required` attribute to each input |
| 6 | Add `aria-hidden="true"` to decorative icons | `index.html:535-551`, `diary.html` (15+ icons) | Add attribute to `<i>` tags inside links |
| 7 | Delete empty files | `asset`, `apps/shared/a.css`, `apps/health/data/a`, `apps/health/domain/a`, `apps/health/charts.js` | Delete |
| 8 | Delete `Renilla_reniformis.pptx` | Root | Delete — not a web asset |
| 9 | Fix `contactRep.html` skip link | `contactRep.html` | Add `<a href="#main" class="skip">Skip to content</a>` |
| 10 | Add `meta name="robots"` | `bot1.html`, `booklet-maker.html` | Add `<meta name="robots" content="index, follow">` or `noindex` as appropriate |

---

## Questions for Owner

1. **Is `style.css` still intentionally loaded by any page?** Or is it purely a legacy file that TypeMaster's dark mode accidentally depends on? If it's legacy, we can safely delete it after migrating TypeMaster's overrides.

2. **Are the root-level Lottie files (`loading1.json`, `loading2.json`, `loading3.json`) still used?** They're 396KB total and I couldn't find references to them in any HTML file.

3. **Is `contactRep.html`'s unique pink theme intentional** (e.g., a fun personal page), or should it be migrated to the main site theme?

4. **The numbered images at root (`10.png`, `11.jpg`, `12.jpg`, `13.jpg`) and `image.jpg`, `icon.png`** — what are these for? Are they still referenced anywhere?

5. **Should `reader.html`** intentionally lack nav/footer (since it's a fullscreen reader), or is that an oversight?

6. **Firebase API key restrictions** — have you configured HTTP referrer restrictions in the Firebase Console for the API key in `firebase-config.js`?

7. **The `part1.html` password-gated content** — is the client-side password check acceptable, or should this be moved server-side?

---

> **No source files were modified, renamed, or deleted during this audit.**
> Awaiting your approval before making any changes.
