# Munan.hub নতুন পেজ গাইড

এই ফাইলটি নতুন public page বা tool page বানানোর copy-ready reference।
নতুন পেজে theme, navbar, typography, spacing এবং accessibility আলাদা করে
ব্যাখ্যা করার দরকার নেই—এই গাইডের নিয়ম অনুসরণ করলেই shared site context
স্বয়ংক্রিয়ভাবে পাওয়া যাবে।

বিস্তারিত component/token reference: [STYLE-GUIDE.md](STYLE-GUIDE.md)

## 1. আগে ঠিক করুন

- **সাধারণ content page:** `about.html`, `blog.html` বা `projects.html`-এর
  skeleton অনুসরণ করুন।
- **Tool page:** `<body class="v2 tool">`, `tool.css` এবং tool-page recipe ব্যবহার
  করুন।
- **Private app:** `<body class="v2 app app-xx">`, `app.css` এবং app recipe ব্যবহার
  করুন।
- **Private/owner-only page:** দরকার হলে `noindex` দিন এবং sensitive data-এর
  আসল protection server/Firestore rules-এ রাখুন; `data-owner-only` শুধু UI hide
  করে।

## 2. Copy-ready HTML shell

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page title | Munan.hub</title>
  <meta name="description" content="এক বাক্যে পেজটির উদ্দেশ্য লিখুন।">
  <link rel="canonical" href="https://munan.me/new-page.html">
  <link rel="icon" type="image/png" href="icon.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <script src="theme.js"></script>
  <script src="owner.js"></script>
  <link rel="stylesheet" href="site.css?v=3">
</head>
<body class="v2">
  <a class="skip" href="#main">Skip to content</a>
  <main id="main">
    <header class="page-head">
      <div class="wrap">
        <ol class="crumbs">
          <li><a href="index.html">Home</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Page name</li>
        </ol>
        <span class="kicker">Section</span>
        <h1 class="page-title">Clear page title</h1>
        <p class="page-lead">এই পেজটি কী করে তার এক বাক্যের পরিচয়।</p>
      </div>
    </header>
    <div class="wrap">
      <section class="prose">
        <h2>First section</h2>
        <p>Page content goes here.</p>
      </section>
    </div>
  </main>
  <script src="nav.js"></script>
  <script src="footer.js"></script>
</body>
</html>
```

## 3. বাধ্যতামূলক নিয়ম

1. `theme.js` head-এ blocking script হিসেবে আগে রাখুন—dark/light theme flash
   এড়াতে।
2. Navbar বা footer HTML নিজে লিখবেন না; `nav.js` এবং `footer.js` inject করবে।
3. প্রতিটি পেজে একটিমাত্র `<h1>` রাখুন এবং heading order (`h1` → `h2` → `h3`)
   ঠিক রাখুন।
4. Shared design-এর জন্য `site.css` token/class ব্যবহার করুন। নতুন রঙ, shadow,
   font বা প্রায়-একই component বানানোর আগে [STYLE-GUIDE.md](STYLE-GUIDE.md)
   দেখুন।
5. Navbar scroll down করলে লুকায় এবং scroll up করলে ফিরে আসে—কোনো পেজে
   `data-nav-hide="off"` যোগ করবেন না।
6. Icon-only button-এ `aria-label`, image-এ meaningful `alt`, form input-এ
   দৃশ্যমান `<label>` দিন। Clickable control-এর touch target কমপক্ষে 40px রাখুন।
7. Page-specific CSS inline না রেখে প্রয়োজন হলে `new-page.css` নামে আলাদা ফাইল
   দিন এবং `site.css`-এর পরে load করুন।

## 4. Content ও layout recipe

- Main wrapper: `.wrap`
- Intro: `.page-head`, `.kicker`, `.page-title`, `.page-lead`, `.crumbs`
- Long copy: `.prose`
- Card/panel: `.panel`
- Two/three-column layout: `.grid-2`, `.grid-3`
- Buttons: `.btn-solid`, `.btn-line`, `.btn-ghost`, `.btn-sm`
- Status: `.alert-ok`, `.alert-warn`, `.alert-err`, `.alert-info`
- Form controls: `.field`, `.input`, `.select`, `.textarea`, `.hint`
- Tables: `.table-wrap` এবং `.table`

রঙের জন্য `var(--bg)`, `var(--paper)`, `var(--ink)`, `var(--muted)`,
`var(--soft)`, `var(--line)`, `var(--lagoon)`, `var(--lagoon-tint)` এবং
`var(--marker)` ব্যবহার করুন। Dark theme-এর জন্য আলাদা colour hard-code করবেন না।

## 5. SEO ও wiring checklist

- [ ] Unique title, description, canonical এবং প্রয়োজন হলে Open Graph metadata
- [ ] Public হলে `sitemap.xml`-এ URL যোগ করা
- [ ] Navigation-এ দেখাতে হলে `nav.js`-এর `LINKS`-এ link যোগ করা
- [ ] Homepage/project listing-এ দেখাতে হলে সংশ্লিষ্ট card যোগ করা
- [ ] Private হলে `noindex` এবং authentication/Firestore rules যাচাই করা
- [ ] সব internal link-এর filename সঠিকভাবে পরীক্ষা করা
- [ ] Mobile width, keyboard focus, light theme এবং dark theme পরীক্ষা করা
- [ ] Shared CSS বদলালে সব HTML-এ `site.css?v=` version bump করা

## 6. শেষ ধাপ

1. Existing page থেকে সবচেয়ে কাছের skeleton copy করুন।
2. Placeholder text, title, links এবং active navigation ঠিক করুন।
3. Browser-এ 375px mobile এবং desktop width-এ পরীক্ষা করুন।
4. `git diff --check` চালান।
5. Public page হলে sitemap/card/navigation update বাদ গেছে কি না আবার দেখুন।
