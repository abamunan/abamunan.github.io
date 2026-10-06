/* ================================================================
   owner.js — Munan.hub owner identity helper
   Load as a normal (blocking) script, before nav.js.

   IMPORTANT: this is for SHOWING / HIDING things (links, menu items,
   page redirects). It is NOT security. Anyone can edit JavaScript in
   their own browser. Real protection for private data must come from
   Firestore security rules (see STYLE-MIGRATION-PLAN.md, Part I):

     function isOwner() {
       return request.auth != null
         && request.auth.token.email == 'allmunanabdullah@gmail.com'
         && request.auth.token.email_verified == true;
     }
   ================================================================ */
(function () {
    'use strict';
    var EMAIL = 'allmunanabdullah@gmail.com';

    window.MunanOwner = {
        EMAIL: EMAIL,

        /** true only for the verified owner account (pass a Firebase user). */
        isOwner: function (user) {
            return !!user &&
                user.emailVerified === true &&
                String(user.email || '').trim().toLowerCase() === EMAIL;
        },

        /** Cached "this browser last saw the owner signed in" flag (cosmetic only). */
        cached: function () {
            try {
                return localStorage.getItem('munan_auth') === 'true' &&
                       localStorage.getItem('munan_owner') === '1';
            } catch (e) { return false; }
        },

        /** Remember the result of an owner check. */
        remember: function (isOwner) {
            try {
                if (isOwner) localStorage.setItem('munan_owner', '1');
                else         localStorage.removeItem('munan_owner');
            } catch (e) {}
            document.documentElement.classList.toggle('is-owner', !!isOwner);
        }
    };

    // Apply the cached flag immediately so owner-only links do not flash.
    document.documentElement.classList.toggle('is-owner', window.MunanOwner.cached());
})();
