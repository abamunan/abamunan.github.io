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
├── privacy.html, terms.html                                           # Legal
├── login.html, dashboard.html, part1.html, contactRep.html             # Auth / owner-only pages
│
├── TypeMaster.html, photo-resizer.html, pdf-toolkit.html,              # Tools (use tool.css)
│   booklet-maker.html, poster-splitter.html, resolution-changer.html,
│   invert-colors.html, drive-folder-fetch.html,
│   bot1.html (Messenger to Telegram guide: public, in sitemap, linked from projects.html)
│   (TypeMaster.html is private: noindex, and redirects to login.html when signed out. It is still linked from the homepage and projects page.)
├── diary.html, english-tracker.html, garments-accounts.html            # Private apps (app.css)
│   (+ garments-calc.js/.css: Garments' own floating calculator, own `gat_calc_*` storage keys)
│
├── site.css                  # Shared design system "Field Notebook" (tokens, navbar, components)
├── tool.css                  # Layer for tool pages
├── app.css                   # Layer for private apps: diary, english-tracker, garments-accounts (old variable names -> tokens)
├── theme.js                  # Dark/light theme (blocking, runs before first paint)
├── nav.js, footer.js         # Shared navbar and footer, injected into every page
├── owner.js                  # Owner-only helper (convenience only; real protection is Firestore rules)
├── auth.js                   # Sign-in logic (login page)
├── firebase-config.js        # The ONLY place with the Firebase config; exports app, auth, db. Every page/script imports it
├── posts.js, webcomic.js     # Blog and webcomic data
│
├── apps/money/               # Money Tracker (ES modules, own PWA: manifest.json, sw.js, tests/)
├── apps/health/              # Health Tracker (ES modules, own PWA: manifest.json, sw.js, icons, tests/): Today, History, Insights, Guide, More (settings, backup/restore, export). Open /apps/health/index.html (linked from index.html and projects.html)
├── apps/shared/              # Code shared by apps (store, firestore, sheet, toast, tabbar, xlsx, download, ui.css, ...)
├── icon.png, Image.jpeg      # Favicon, profile photo
├── sitemap.xml, robots.txt   # Crawler files
├── firestore.rules           # Firestore security rules (publish from Firebase console)
└── STYLE-GUIDE.md, STYLE-MIGRATION-PLAN.md, ROADMAP.md   # Docs (the migration plan is history; ROADMAP has current decisions)
```

Design rules, tokens and per-page recipes are in **[STYLE-GUIDE.md](STYLE-GUIDE.md)**.

## 🚀 Deploying (GitHub Pages)

1. Push all files to the repo's default branch (root, not a subfolder).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, pick the branch and `/ (root)`.
4. Save — your site will be live at `https://<username>.github.io/<repo>/` (or `https://<username>.github.io/` if the repo is named `<username>.github.io`).
5. If you use a **custom domain**, update the URLs in `index.html`, `projects.html`, `sitemap.xml` (currently set to `https://abamunan.github.io/`) to match.

## ➕ Adding a new project

1. Build the tool as a standalone `.html` file and add it to the repo root.
2. Add a card to `projects.html`'s `.tracker-grid` (copy an existing `.tracker` block) and, if it should also appear on the homepage, to `index.html` too.
3. Copy the head of a similar page (title, description, canonical, Open Graph, `theme.js`, `site.css?v=3`, fonts) and use `<body class="v2">`.
4. If the page should be indexed by search engines, add it to `sitemap.xml`; private pages get `noindex`.

## 🔍 SEO

- Unique `<title>`, meta description, canonical URL and Open Graph tags on every public page; one `<h1>` per page
- `Person` / `CollectionPage` structured data (JSON-LD)
- Semantic heading hierarchy (h1 → h2 → h3, via `role="heading"` where the visual markup uses non-heading tags)
- `sitemap.xml` + `robots.txt` for crawlers

## 🛠 Tech

No build step, no framework — plain HTML/CSS/JS. Fonts (Bricolage Grotesque, Figtree, Hind Siliguri) via Google Fonts, icons via Font Awesome 6.5.1 (CDN). Bump the `?v=` number on `site.css` / `app.css` / `tool.css` links whenever those files change.
