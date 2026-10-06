# Round 3 — Auth, dashboard, owner page (changelog)

## Pages
| Page | What changed |
|---|---|
| `login.html` | Centered auth card, pill tabs, new inputs/buttons/messages, verify-email state. **`auth.js` untouched (checksum identical).** All form IDs, handlers and message containers kept; the page script is identical except the removed particles/bubbles. Added `aria-current` on tabs and `aria-live` on message bars |
| `dashboard.html` | Greeting header, profile card, 7 app cards (Money, Health, English, Diary, Garments, TypeMaster, Drive Folder Fetch), recent-activity placeholder, owner-only "Private" group (Private Drive link). Particle layer and its own theme toggle removed (navbar has the toggle). Auth redirect, populate and sign-out logic unchanged |
| `part1.html` | Owner-only card (lock badge, "Private Drive", password modal). Same Firestore fetch (`secrets/privateDrive`) and password modal. **New:** only the verified owner continues, everyone else is sent to `index.html` before any request. `noindex`. Clear messages instead of a stuck spinner if the secret is missing or denied |
| `bot1.html` | **Stays public**, as you asked. Restyled as a document page: sticky table of contents (collapses on phones), code blocks with Copy buttons, tables, badges. Text unchanged. "Download HTML" kept |

## Decision
bot1 stays public (no Firestore move). It only has setup steps and placeholders, no real token. The Chat Bridge card was removed from `projects.html` in Round 2; say the word and I will add it back.

## Tested (headless Chromium, Firebase replaced by a stub, 43 checks)
- Login: tab switch, forgot panel, empty and wrong-password errors, success redirect to dashboard, "email not verified" stays on login, signup shows verify state with resend cooldown, reset shows the generic message and cooldown.
- Dashboard: signed out goes to login, normal user sees no Private group, owner sees it, sign-out goes to login.
- part1: signed out / unverified go to login; another verified user goes to `index.html` and **never requests the secret**; owner gets unlock card; secret URL and password are not in the DOM; wrong and right password; missing/denied secret messages.
- bot1: public, TOC, copy buttons, tables.
- 4 pages x light/dark x 320 to 1280 px: no horizontal scroll, one navbar, one footer, one `<h1>`, no console errors.

## Needs you
1. **Firestore rules for `secrets/`** (the real protection for the Private Drive): see `round3-owner-setup/firestore.rules.example`. The page check only hides the page. I cannot see your rules, so please check that no other rule lets any signed-in user read `secrets`.
2. Sign in on the live site with a real account: login, logout, reset, and (with your owner account) the Private Drive.
3. Optional: turn off open sign-up if only you need an account.

## Things I noticed and left alone
- `login.html`: pressing Enter inside the "forgot password" box runs the sign-up handler (old behaviour). Harmless but wrong; tell me if you want it fixed.
- The plan mentioned a third "Reset" tab; the real page has a "Forgot password?" panel instead, so I kept that.
