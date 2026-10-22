/* ================================================================
   footer.js — Munan.hub Shared Footer Injector
   Dynamically builds and injects the site footer into every page.
   Add <script src="footer.js"></script> at the bottom of every
   page's <body>. No hardcoded footer HTML needed in any HTML file.
   ================================================================ */

(function () {
    'use strict';

    const footerHTML = `
<footer class="site-footer">
    <div class="footer-divider"></div>
    <div class="footer-dev">Powered by</div>
    <div class="footer-name">Abdullah All <span>Munan</span></div>
    <div class="footer-socials">
        <a href="mailto:allmunanabdullah@gmail.com" title="Email"><i class="fas fa-envelope"></i></a>
        <a href="contact.html" title="Contact Page"><i class="fas fa-paper-plane"></i></a>
        <a href="https://www.facebook.com/share/18E4oCwqfT/" target="_blank" rel="noopener noreferrer" title="Facebook"><i class="fab fa-facebook"></i></a>
        <a href="https://www.linkedin.com/in/abdullah-all-munan-b447133b2" target="_blank" rel="noopener noreferrer" title="LinkedIn"><i class="fab fa-linkedin"></i></a>
        <a href="https://github.com/abamunan" target="_blank" rel="noopener noreferrer" title="GitHub"><i class="fab fa-github"></i></a>
        <a href="https://x.com" target="_blank" rel="noopener noreferrer" title="X / Twitter"><i class="fab fa-x-twitter"></i></a>
    </div>
    <div class="footer-bottom">
        <i class="fas fa-hands-praying" style="margin-right:6px;opacity:.6;"></i>
        Tawakkul &amp; Grind &nbsp;&middot;&nbsp; &copy; 2026 Munan
    </div>
</footer>`;

    // Remove any existing hardcoded footer on the page
    const existingFooters = document.querySelectorAll('footer');
    existingFooters.forEach(function (f) {
        f.parentNode.removeChild(f);
    });

    // Also remove legacy .footer-note, .footer-card divs that some pages use
    const legacyFooterNote = document.querySelector('.footer-note');
    if (legacyFooterNote) legacyFooterNote.parentNode.removeChild(legacyFooterNote);

    // Inject new footer at end of <body>
    document.body.insertAdjacentHTML('beforeend', footerHTML);
})();
