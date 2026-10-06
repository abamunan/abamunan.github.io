# Round 1 — Simple content pages (changelog)

## Pages restyled (T1 content / T3 form)
| Page | What changed |
|---|---|
| `about.html` | New page header (`<h1>` = "Curious by nature. Builder by choice."), photo styled like the tag-card photo (ink outline + lime offset), sections as outlined panels: About, Skills (chips with lime "learning" tags), Education (timeline), Hobbies (tile grid), Connect (link rows). Orange accent removed |
| `contact.html` | Centered paper card (max 560px), new inputs/textarea/pill button, email + GitHub chips below. **Form untouched**: same `action`, `method`, hidden `_captcha/_subject/_template/_next` fields, same `id`/`name`/`required` on every field (checked by script against the old file) |
| `contactRep.html` | Success state: big lime check tile, "Message delivered", Back to Home + Send another. Blobs and particle script removed. `noindex` added (it is a result page) |
| `privacy.html`, `terms.html` | 720px reading column, "On this page" contents list, numbered sections (01, 02 ...) with `#` anchor links, "Last updated" line using `<time>`. **Legal text is word-for-word the same** |

## On every page
- `style.css` replaced by `site.css?v=1`; added `theme.js`, `owner.js`, `nav.js`, `footer.js`.
- Old inline navbar, inline theme snippet and scroll-hide script removed (`nav.js` and `theme.js` do it).
- One `<h1>`, breadcrumb, skip link, `<main id="main">`, meta description, canonical, Open Graph + Twitter tags, `theme-color`.
- Font Awesome standardised to 6.5.1; Poppins removed, Figtree/Bricolage/Hind Siliguri used.
- Small page-specific CSS stays inline in each page (about, contact, contactRep, legal).

## Not changed
All other pages, `style.css`, `site.css`, `nav.js`, `theme.js`, `footer.js`, `index.html`.

## Tested (headless Chromium, file://)
- 5 pages x light/dark x 320/360/390/768/1024/1280 px = 60 checks: no horizontal scroll, navbar injected, exactly one footer, dark attribute applied, zero console errors.
- All internal links and `#anchors` resolve.
- Screenshots reviewed at 360 and 1280 px, light and dark.

## Not tested / needs you
- **Real form send.** Sandbox has no internet. After pushing, send one test message: it must email you and redirect to `contactRep.html`.
- Font Awesome icons and Google Fonts load from CDN, so icons showed as blank boxes in my screenshots. Check them on the live site.
- Lighthouse scores (needs a live URL).
- `index.html` still loads Font Awesome 6.5.0 (not touched this round). Change it to 6.5.1 in Round 8, or earlier if you want.
- `contact.html` `_subject` still says "munan07.github.io" (kept exactly as it was). Update it if that old name is wrong.
