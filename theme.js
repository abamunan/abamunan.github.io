/* ================================================================
   theme.js — Munan.hub shared theme logic
   Single source of truth for dark/light mode across all pages.

   USAGE:
   1. Include as a BLOCKING script in <head>, before any CSS that
      depends on [data-theme], and before <body> renders:

        <script src="theme.js"></script>

      Must NOT use `defer` or `async` — this has to run and set the
      attribute before first paint, or you'll get a flash of the
      wrong theme. (It's tiny and synchronous, so it's cheap.)

   2. If the page has a visible toggle button, wire it up once the
      button exists in the DOM:

        document.addEventListener('DOMContentLoaded', () => {
            MunanTheme.bindToggle(document.getElementById('themeBtn'));
        });

      Pages with no toggle button (e.g. diary.html) can skip step 2
      entirely — the theme still applies correctly on load, it just
      can't be changed from that page.
   ================================================================ */

(function () {
    const STORAGE_KEY = 'theme';

    function isDark() {
        return localStorage.getItem(STORAGE_KEY) === 'dark';
    }

    // Applies the theme to both <html> and <body> (some pages' CSS
    // targets one, some the other — setting both keeps every page
    // in sync regardless of which selector its stylesheet uses).
    function apply(dark) {
        if (dark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body && document.body.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.body && document.body.removeAttribute('data-theme');
        }
    }

    // ── RUN IMMEDIATELY (before <body> exists) ──────────────────
    // Sets <html> right away so the very first paint is already
    // correct. <body> doesn't exist yet at this point if the script
    // is blocking in <head>, so we also reapply on DOMContentLoaded
    // to catch the <body> attribute for pages/CSS that key off it.
    apply(isDark());
    document.addEventListener('DOMContentLoaded', () => apply(isDark()));

    // ── MOUSE-REACTIVE BACKGROUND MESH ──────────────────────────
    // Nudges the --mx/--my CSS vars (consumed by --main-bg's radial
    // gradient positions in style.css) toward the cursor, so the
    // gradient mesh gently drifts with the mouse. rAF-throttled and
    // eased so it never fights the pointermove event rate, and
    // skipped entirely under prefers-reduced-motion or on touch-only
    // devices (no meaningful hover position there anyway).
    function initMeshParallax() {
        // Pages on the new design system (body.v2) have no mesh background.
        if (document.body && document.body.classList.contains('v2')) return;
        const prefersReduced = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isTouchOnly = window.matchMedia &&
            window.matchMedia('(hover: none)').matches;
        if (prefersReduced || isTouchOnly) return;

        const MAX_OFFSET = 6; // vw-ish max drift in %, keep subtle
        let targetX = 0, targetY = 0;   // -1..1, where cursor is
        let currentX = 0, currentY = 0; // eased current value
        let ticking = false;

        function onPointerMove(e) {
            targetX = (e.clientX / window.innerWidth) * 2 - 1;
            targetY = (e.clientY / window.innerHeight) * 2 - 1;
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(tick);
            }
        }

        function tick() {
            // Ease toward target so movement feels fluid, not jumpy.
            currentX += (targetX - currentX) * 0.06;
            currentY += (targetY - currentY) * 0.06;
            const root = document.documentElement.style;
            root.setProperty('--mx', (currentX * MAX_OFFSET).toFixed(2) + '%');
            root.setProperty('--my', (currentY * MAX_OFFSET).toFixed(2) + '%');
            if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
                requestAnimationFrame(tick);
            } else {
                ticking = false;
            }
        }

        window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    document.addEventListener('DOMContentLoaded', initMeshParallax);

    // ── KEEP TABS AND IFRAMES IN SYNC ───────────────────────────────
    // The 'storage' event fires in every OTHER same-origin document
    // (other tabs and iframes) when the theme key changes, so a toggle
    // on one page updates the rest without a reload.
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) apply(isDark());
    });
    // Also accept an explicit message from a parent page (same origin only).
    window.addEventListener('message', (e) => {
        if (e.origin !== window.location.origin) return;
        const d = e.data;
        if (d && d.munanTheme) apply(d.munanTheme === 'dark');
    });

    // ── PUBLIC API ───────────────────────────────────────────────
    window.MunanTheme = {
        /** Returns 'dark' or 'light'. */
        current() {
            return isDark() ? 'dark' : 'light';
        },
        /** Switches theme and persists it. */
        toggle() {
            const next = !isDark();
            localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
            apply(next);
            return next ? 'dark' : 'light';
        },
        /** Explicitly set 'dark' or 'light'. */
        set(theme) {
            const dark = theme === 'dark';
            localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
            apply(dark);
        },
        /** Pushes the current theme into an iframe (same-origin) right now. */
        sync(frameEl) {
            try {
                const w = frameEl && frameEl.contentWindow;
                if (w) w.postMessage({ munanTheme: isDark() ? 'dark' : 'light' }, window.location.origin);
            } catch (e) {}
        },
        /**
         * Wires a toggle button: click switches theme and updates the
         * button's icon. Call once the button exists in the DOM.
         * Safe to call with null/undefined (no-op) for pages with no
         * visible toggle.
         */
        bindToggle(buttonEl) {
            if (!buttonEl) return;
            const icon = buttonEl.querySelector('i');
            const syncIcon = () => {
                if (!icon) return;
                icon.className = isDark() ? 'fas fa-sun' : 'fas fa-moon';
            };
            syncIcon();
            buttonEl.addEventListener('click', () => {
                window.MunanTheme.toggle();
                syncIcon();
            });
        }
    };
})();
