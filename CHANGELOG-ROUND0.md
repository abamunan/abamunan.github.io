# Round 0 — Foundation (changelog)

## New files
| File | Purpose |
|---|---|
| `site.css` | Shared design system: tokens (light/dark), reset, navbar + mobile menu, buttons, hero, cards, list rows, page header, prose, forms, table, tabs, modal, toast, alerts, progress, badges, spinner, footer, utilities, print rules |
| `nav.js` | Injects the navbar on every page (like `footer.js`). Includes the **mobile menu**, active-link highlight, hide-on-scroll, login/dashboard button, theme toggle, owner-only links |
| `owner.js` | `MunanOwner` helper: owner email, `isOwner(user)` (email + verified), cached flag. Cosmetic only |
| `STYLE-GUIDE.md` | Short how-to for building pages in the new style |
| `styleguide.html` | Live demo of every component (`noindex`, not linked anywhere) |
| `CHANGELOG-ROUND0.md` | This file |

## Changed files
| File | Change |
|---|---|
| `index.html` | Now uses `site.css`, `nav.js`, `owner.js`. The big inline `<style>` and the inline nav, theme-toggle, scroll-hide and login-button code were removed. Navbar links are now site-wide (Projects, Blog, Comics, Notes, About, Contact). The **Files** row is hidden from everyone except the signed-in owner. `<noscript>` fallback links added |
| `theme.js` | Mouse-reactive mesh is skipped on pages with `body.v2`. New: tab/iframe sync through the `storage` event, `MunanTheme.sync(iframe)`. Public API unchanged |

## Not changed (on purpose)
- `style.css`, `footer.js`, `auth.js`, `firebase-config.js` and **all other pages**. They look and work exactly as before.
- `english-tracker.html` and `index.html`'s content/design are the versions from the previous steps.

## Behaviour notes
- `nav.js` asks Firebase once per browser session whether the signed-in user is the owner (only for signed-in visitors; visitors who are not signed in load nothing extra). The result is cached in `localStorage` as `munan_owner` for show/hide only.
- `site.css` is only for pages with `<body class="v2">`. Old pages are unaffected.

## Tested
- Navbar injection, 6 links, active link, login/dashboard label, theme toggle + persistence, mobile menu (open, Esc, link click), no horizontal scroll at 320/360/390/768/1024/1280 px.
- Owner logic with a fake Firebase: visitor (hidden), signed-in non-owner (hidden), owner (shown), owner email but unverified (hidden).
- `styleguide.html`: tabs, modal, toast, light and dark.
- `about.html` still loads `style.css` (old look unchanged).

## Not tested / needs you
- Real Firebase login (sandbox has no internet). After pushing, sign in as the owner and check that **Files** appears in the navbar and on the home page, and that it does not appear when signed out.
- Font Awesome and Google Fonts load from CDN. Check icons and fonts on the live site.
- **Firestore rules (Part I, Step 1 of the plan) are still your job in the Firebase console.** Nothing in this round protects `secrets/privateDrive`.

## Known follow-ups
- `projects.html` still has the public "Coming Soon" card linking to `bot1.html` (Round 2/3).
- Other pages still show their old navbar until their round.
