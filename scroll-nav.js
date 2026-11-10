(function () {
    'use strict';

    var targets = document.querySelectorAll('.rd-header, .appbar');
    if (!targets.length) return;

    function bind(target) {
        var scrollParent = target.parentElement;
        while (scrollParent && scrollParent !== document.body) {
            var style = window.getComputedStyle(scrollParent);
            if (/(auto|scroll|overlay)/.test(style.overflowY) &&
                scrollParent.scrollHeight > scrollParent.clientHeight) break;
            scrollParent = scrollParent.parentElement;
        }
        var last = scrollParent ? scrollParent.scrollTop : window.scrollY;
        var ticking = false;

        function update() {
            var y = scrollParent ? scrollParent.scrollTop : window.scrollY;
            if (y <= 8) target.classList.remove('scroll-nav-hidden');
            else if (y > last + 2) target.classList.add('scroll-nav-hidden');
            else if (y < last - 2) target.classList.remove('scroll-nav-hidden');
            last = y;
            ticking = false;
        }

        function onScroll() {
            if (!ticking) {
                window.requestAnimationFrame(update);
                ticking = true;
            }
        }

        (scrollParent || window).addEventListener('scroll', onScroll, { passive: true });
    }

    Array.prototype.forEach.call(targets, bind);
}());
