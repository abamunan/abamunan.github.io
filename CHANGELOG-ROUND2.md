# Round 2 — Listing pages (changelog)

## Pages restyled (T2 listing)
| Page | What changed |
|---|---|
| `projects.html` | `.tracker` cards with green tiles, original tags and action verbs kept. **English Fluency Tracker added** (tagged "Login needed", because the tracker redirects to login when signed out). **Chat Bridge ("Coming Soon" → `bot1.html`) removed.** Category chips: All 7, Trackers 1, Utilities 6, Learning 1 (plain JS, no reload). JSON-LD list updated with the English tracker |
| `blog.html` | `.post` cards with the colour bar from `posts.js`; search + tag chips with counts; article opens in a 680px reading modal. `#post-<id>` deep links still work (homepage links tested). Title is a real link (keyboard + screen reader friendly), focus returns to the card on close, Esc closes |
| `webcomic.html` | Series cards like the homepage `.comic`, now showing the cover image when `coverImage` is set. Episode viewer: large image, Previous/Next (sticky at the bottom), counter, arrow-key and Esc support, Bangla text in Hind Siliguri |
| `notes.html` | Subject heading + level badge, notes as list rows, search with live count. Reader links (`reader.html?src=&title=&caption=`) built the same way |
| `tools.html` | Grouped list rows per tag (Software & builders, AI tools, Browser extensions, Productivity, Social, Media), search, category chips with counts. All 43 links open in a new tab with `noopener noreferrer` |

## Shared
- `site.css` is now **v2**: added only new classes (`.searchbar`, `.fchip`, `.group-head`, `.stretch`, `.listing`, `.list-tools`). Nothing existing was edited. All migrated pages (index + Round 1 + Round 2) now load `site.css?v=2`. `STYLE-GUIDE.md` example updated to v2.
- Same page pattern as Round 1: `nav.js`, `theme.js`, `footer.js`, one `<h1>`, breadcrumb, skip link, meta description, canonical, Open Graph, Font Awesome 6.5.1, `<noscript>` message on the JS-rendered pages.
- Old inline navbar, theme snippet, blobs, particles and scroll-hide code removed from all five pages.

## Not changed (checked by checksum / diff)
- `posts.js` and `webcomic.js`: byte-identical.
- The `NOTE_SUBJECTS` list in notes.html and the `MY_TOOLS` list in tools.html: identical to the old files (the "edit only this section" banner is kept).
- `bot1.html` and `part1.html` files are untouched. Only the public link to `bot1.html` was removed.

## Tested (headless Chromium)
- 5 pages x light/dark x 320/360/390/768/1024/1280 px = 60 checks: no horizontal scroll, navbar once, footer once, exactly one `<h1>`, zero console errors.
- Blog: `blog.html#post-01` opens the right post, card click opens, Esc closes, empty search state.
- Webcomic: open viewer, → / ← keys, Previous disabled on episode 1, Esc closes.
- Projects: each filter chip, no `bot1.html` link left, English tracker present.
- Notes: reader link + count. Tools: 43 rows in 6 groups, search ("google" = 9), AI chip = 10.
- Round 0 and Round 1 pages re-checked after the `site.css` v2 bump: still clean.
- All internal links resolve.

## Needs you
- Click through on the live site: icons and fonts come from CDNs (blank icon boxes in my screenshots).
- The "Trackers" and "Learning" chips each hold only one item (English Fluency Tracker), because the plan says to keep the same project list. If you want Money Tracker, Health Tracker, TypeMaster and Diary listed here too, say so and I will add them.
- Facebook/X/Messenger link previews cache old titles; use their debug tools if you want the new titles to show quickly.
