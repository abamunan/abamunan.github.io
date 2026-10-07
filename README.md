# Munan.hub

Personal link-hub, portfolio and project showcase for **Abdullah All Munan** — built with plain HTML, CSS and JavaScript, hosted on GitHub Pages.

🔗 Live: [abamunan.github.io](https://abamunan.github.io/) *(update if you use a custom domain)*

---

## ✨ What's on the site

- **Hero / intro** — profile photo, typing-animation tagline
- **Quick Links** — About Me, My Toolbox, GitHub Profile, Files, Blog, WebComics, Get in Touch
- **My Projects** — browser-based tools built from scratch (TypeMaster, Money Tracker, Photo Resizer, Diary, PDF Toolkit), plus a **View All Projects** card linking to the full collection
- **Academic** — study notes viewer
- **Blog preview** — latest posts, pulled from `posts.js`
- **WebComics preview** — latest strips, pulled from `webcomic.js`
- **Dark / light theme toggle** — shared logic across all pages via `theme.js`

## 📁 File structure

```
├── index.html, projects.html, about.html, tools.html, contact.html   # Public pages
├── blog.html, webcomic.html, notes.html, reader.html                  # Content + study viewer
├── privacy.html, terms.html, styleguide.html                          # Legal + live style guide
├── login.html, dashboard.html, part1.html, contactRep.html             # Auth / owner-only pages
│
├── TypeMaster.html, photo-resizer.html, pdf-toolkit.html,              # Tools (use tool.css)
│   booklet-maker.html, poster-splitter.html, resolution-changer.html,
│   invert-colors.html, drive-folder-fetch.html, bot1.html
├── diary.html, english-tracker.html, garments-accounts.html            # Private apps (app.css)
├── moneytracker.html, healthtracker.html                                # Fullscreen PWA trackers
│   (+ mt.css, mt-calc.css, mt-insights.css, ht.css, ht-insights.css, mt*.js, ht*.js)
│
├── site.css                  # Shared design system "Field Notebook" (tokens, navbar, components)
├── tool.css                  # Layer for tool pages
├── app.css                   # Layer for private apps and trackers (old variable names -> tokens)
├── theme.js                  # Dark/light theme (blocking, runs before first paint)
├── nav.js, footer.js         # Shared navbar and footer, injected into every page
├── owner.js                  # Owner-only helper (convenience only; real protection is Firestore rules)
├── posts.js, webcomic.js     # Blog and webcomic data
│
├── manifest-*.json           # PWA manifests (Money Tracker, Health Tracker)
├── icon.png, Image.jpeg      # Favicon, profile photo
├── sitemap.xml, robots.txt   # Crawler files
└── STYLE-GUIDE.md, CHANGELOG-ROUND*.md, STYLE-MIGRATION-PLAN.md
```

Design rules, tokens and per-page recipes are in **[STYLE-GUIDE.md](STYLE-GUIDE.md)** (also viewable as `styleguide.html`). The history of the restyle is in the `CHANGELOG-ROUND*.md` files.

> Some file names above (e.g. `posts.js`, `webcomic.js`, individual project pages) are referenced by `index.html`/`projects.html` but maintained separately — make sure they're present in the repo root alongside these files.

## 🚀 Deploying (GitHub Pages)

1. Push all files to the repo's default branch (root, not a subfolder).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, pick the branch and `/ (root)`.
4. Save — your site will be live at `https://<username>.github.io/<repo>/` (or `https://<username>.github.io/` if the repo is named `<username>.github.io`).
5. If you use a **custom domain**, update the URLs in `index.html`, `projects.html`, `sitemap.xml` (currently set to `https://abamunan.github.io/`) to match.

## ➕ Adding a new project

1. Build the tool as a standalone `.html` file and add it to the repo root.
2. Add a card to `projects.html`'s `.projects-grid` (copy an existing `.project-card` block) and, if it should also appear on the homepage, to `index.html` too.
3. Copy the head of a similar page (title, description, canonical, Open Graph, `theme.js`, `site.css?v=3`, fonts) and use `<body class="v2">`.
4. If the page should be indexed by search engines, add it to `sitemap.xml`; private pages get `noindex`.

## 🔍 SEO

- Unique `<title>`, meta description, canonical URL and Open Graph tags on every public page; one `<h1>` per page
- `Person` / `CollectionPage` structured data (JSON-LD)
- Semantic heading hierarchy (h1 → h2 → h3, via `role="heading"` where the visual markup uses non-heading tags)
- `sitemap.xml` + `robots.txt` for crawlers

## 🛠 Tech

No build step, no framework — plain HTML/CSS/JS. Fonts (Bricolage Grotesque, Figtree, Hind Siliguri) via Google Fonts, icons via Font Awesome 6.5.1 (CDN). Bump the `?v=` number on `site.css` / `app.css` / `tool.css` links whenever those files change.
