/* ================================================================
   nav.js — Munan.hub shared navbar injector
   Same idea as footer.js: no navbar HTML is needed in any page.

   USAGE (per page)
     <head>
       <script src="theme.js"></script>        <!-- blocking, first -->
       <script src="owner.js"></script>
       <link rel="stylesheet" href="site.css?v=1">
     </head>
     <body class="v2">
       ...page content...
       <script src="nav.js"></script>
       <script src="footer.js"></script>
     </body>

   Optional body attributes
     data-nav-hide="off"   do not hide the bar when scrolling down
     data-nav-active="blog.html"   force which link is highlighted
   ================================================================ */
(function () {
    'use strict';

    var LINKS = [
        { href: 'projects.html', label: 'Projects' },
        { href: 'blog.html',     label: 'Blog' },
        { href: 'webcomic.html', label: 'Comics' },
        { href: 'notes.html',    label: 'Notes' },
        { href: 'about.html',    label: 'About' },
        { href: 'contact.html',  label: 'Contact' }
    ];
    // Shown only to the verified owner (cosmetic — real protection is Firestore rules)
    var OWNER_LINKS = [
        { href: 'part1.html', label: 'Files', icon: 'fa-lock' }
    ];

    function init() {
        var body = document.body;
        var current = body.getAttribute('data-nav-active') ||
                      (location.pathname.split('/').pop() || 'index.html');
        var signedIn = false;
        try { signedIn = localStorage.getItem('munan_auth') === 'true'; } catch (e) {}

        function linkHTML(l, extra) {
            var cur = (l.href === current) ? ' aria-current="page"' : '';
            var icon = l.icon ? '<i class="fas ' + l.icon + '" aria-hidden="true"></i>' : '';
            return '<a href="' + l.href + '"' + cur + (extra || '') + '>' + icon + l.label + '</a>';
        }
        var main  = LINKS.map(function (l) { return linkHTML(l); }).join('');
        var owner = OWNER_LINKS.map(function (l) { return linkHTML(l, ' data-owner-only'); }).join('');
        var authHref  = signedIn ? 'dashboard.html' : 'login.html';
        var authLabel = signedIn ? 'Dashboard' : 'Login';
        var authIcon  = signedIn ? 'fa-gauge' : 'fa-user-circle';

        var html =
            '<nav class="navbar" id="navbar" aria-label="Main">' +
                '<a class="nav-logo" href="index.html" aria-label="Munan.hub home">Munan<span>.hub</span></a>' +
                '<div class="nav-links">' + main + owner + '</div>' +
                '<div class="nav-right">' +
                    '<a href="' + authHref + '" class="nav-login-btn" id="authBtn">' +
                        '<i class="fas ' + authIcon + '" aria-hidden="true"></i><span class="lbl">' + authLabel + '</span></a>' +
                    '<button type="button" class="theme-toggle" id="themeBtn" aria-label="Switch light or dark theme"><i class="fas fa-moon" aria-hidden="true"></i></button>' +
                    '<button type="button" class="nav-burger" id="navBurger" aria-label="Open menu" aria-expanded="false" aria-controls="navSheet"><i class="fas fa-bars" aria-hidden="true"></i></button>' +
                '</div>' +
            '</nav>' +
            '<div class="nav-sheet" id="navSheet" hidden>' + main + owner +
                '<a class="sheet-login" id="sheetAuth" href="' + authHref + '">' + authLabel + '</a>' +
            '</div>';

        // Remove any legacy navbar, then inject ours first in <body>
        var old = document.getElementById('navbar');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        body.insertAdjacentHTML('afterbegin', html);

        var nav    = document.getElementById('navbar');
        var burger = document.getElementById('navBurger');
        var sheet  = document.getElementById('navSheet');

        /* theme toggle */
        var themeBtn = document.getElementById('themeBtn');
        if (window.MunanTheme && themeBtn) window.MunanTheme.bindToggle(themeBtn);

        /* mobile menu */
        function setMenu(open) {
            sheet.hidden = !open;
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
            burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
            burger.querySelector('i').className = open ? 'fas fa-xmark' : 'fas fa-bars';
            if (open) nav.classList.remove('navbar-hidden');
        }
        burger.addEventListener('click', function () { setMenu(sheet.hidden); });
        sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !sheet.hidden) { setMenu(false); burger.focus(); }
        });
        document.addEventListener('click', function (e) {
            if (!sheet.hidden && !sheet.contains(e.target) && !burger.contains(e.target)) setMenu(false);
        });
        window.addEventListener('resize', function () { if (window.innerWidth > 900 && !sheet.hidden) setMenu(false); });

        /* hide on scroll down, show on scroll up */
        if (body.getAttribute('data-nav-hide') !== 'off') {
            var last = window.scrollY;
            window.addEventListener('scroll', function () {
                var y = window.scrollY;
                if (!sheet.hidden) { last = y; return; }
                if (y > last && y > 90) nav.classList.add('navbar-hidden');
                else nav.classList.remove('navbar-hidden');
                last = y;
            }, { passive: true });
        }

        /* owner-only links: cached flag first, verified in the background */
        verifyOwner();
    }

    // Ask Firebase once per browser session (only for signed-in visitors)
    function verifyOwner() {
        var Owner = window.MunanOwner;
        if (!Owner) return;
        var signedIn = false, checked = false;
        try {
            signedIn = localStorage.getItem('munan_auth') === 'true';
            checked  = sessionStorage.getItem('munan_owner_checked') === '1';
        } catch (e) {}
        if (!signedIn) { Owner.remember(false); return; }
        if (checked) return;

        var V = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
        Promise.all([import('./firebase-config.js'), import(V)]).then(function (m) {
            var auth = m[0].auth, fb = m[1];
            var unsub = fb.onAuthStateChanged(auth, function (user) {
                Owner.remember(Owner.isOwner(user));
                try { sessionStorage.setItem('munan_owner_checked', '1'); } catch (e) {}
                if (typeof unsub === 'function') unsub();
            });
        }).catch(function () { /* offline or blocked: keep the cached flag */ });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
