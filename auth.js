// ============================================================
//  auth.js  —  Munan.hub Authentication Logic
//  Firebase 10.x CDN (ESM) — GitHub Pages compatible
// ============================================================

import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, sendEmailVerification, GoogleAuthProvider,
         signInWithPopup, onAuthStateChanged,
         sendPasswordResetEmail }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp, Timestamp }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";



// ── WHERE TO GO AFTER LOGIN ──────────────────────────────────
// Pages that bounce signed-out visitors send them to login.html?redirect=<page>.
// Garments also leaves its page name in sessionStorage ("gat_return").
// Only same-site relative .html paths are accepted (no http:, //, ..), so
// the parameter can't be used as an open redirect. Anything else -> dashboard.
function getRedirectTarget() {
    var target = "dashboard.html";
    try {
        var want = new URLSearchParams(window.location.search).get("redirect")
                || sessionStorage.getItem("gat_return") || "";
        if (/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.html$/.test(want) && want !== "login.html") {
            target = want;
        }
        sessionStorage.removeItem("gat_return");
    } catch (e) {}
    return target;
}

// ── SESSION STATE ────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        localStorage.setItem('munan_auth', 'true');
        localStorage.setItem('isLoggedIn', 'true');
        if (window.location.pathname.includes("login.html")) {
            window.location.href = getRedirectTarget();
        }
    } else {
        localStorage.removeItem('munan_auth');
        localStorage.removeItem('isLoggedIn');
    }
});

// ── LOGIN WITH EMAIL & PASSWORD ──────────────────────────────
// Note: no "registered with Google?" lookup on failure. With email-enumeration
// protection ON, fetchSignInMethodsForEmail always returns [] (dead code) and
// would otherwise reveal whether an email exists. login.html shows a static hint.
async function loginWithEmail(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!cred.user.emailVerified) {
        await signOut(auth);
        const err = new Error("Please verify your email before logging in.");
        err.code = "auth/email-not-verified";
        throw err;
    }
    localStorage.setItem('munan_auth', 'true');
    localStorage.setItem('isLoggedIn', 'true');
    window.location.href = getRedirectTarget();
}

// ── SIGNUP WITH EMAIL & PASSWORD ─────────────────────────────
async function signupWithEmail(name, email, phone, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    await setDoc(doc(db, "users", cred.user.uid, "profile", "info"), {
        name, email, phone: phone || "", created: serverTimestamp(),
    });
    await signOut(auth);
    return "Verification email sent! Check your inbox.";
}

// ── GOOGLE SIGN-IN ───────────────────────────────────────────
async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred     = await signInWithPopup(auth, provider);
    await setDoc(doc(db, "users", cred.user.uid, "profile", "info"), {
        name: cred.user.displayName || "", email: cred.user.email,
        phone: "", created: serverTimestamp(),
    }, { merge: true });
    localStorage.setItem('munan_auth', 'true');
    localStorage.setItem('isLoggedIn', 'true');
    window.location.href = getRedirectTarget();
}

// ── LOGOUT ───────────────────────────────────────────────────
async function logout() {
    await signOut(auth);
    localStorage.removeItem('munan_auth');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loggedInUser');
    window.location.href = "login.html";
}

// ── RESEND VERIFICATION ──────────────────────────────────────
async function resendVerificationEmail() {
    const user = auth.currentUser;
    if (user) await sendEmailVerification(user);
}

// ── RESET PASSWORD (with 5-min cross-device cooldown) ────────
const RESET_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function emailToKey(email) {
    // Firestore doc IDs can't contain certain chars; encode safely
    return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

// Returns: { allowed: true } or { allowed: false, remainingMs: number }
async function checkResetCooldown(email) {
    const key = emailToKey(email);
    try {
        const ref  = doc(db, "passwordResetCooldowns", key);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const lastSent = snap.data().lastSent;
            const lastMs   = lastSent?.toMillis ? lastSent.toMillis() : 0;
            const elapsed  = Date.now() - lastMs;
            if (elapsed < RESET_COOLDOWN_MS) {
                return { allowed: false, remainingMs: RESET_COOLDOWN_MS - elapsed };
            }
        }
        return { allowed: true };
    } catch (e) {
        // If Firestore check fails for any reason, don't block the user
        console.error("Cooldown check failed:", e);
        return { allowed: true };
    }
}

async function resetPassword(email) {
    const status = await checkResetCooldown(email);
    if (!status.allowed) {
        const err = new Error("COOLDOWN");
        err.code = "auth/reset-cooldown";
        err.remainingMs = status.remainingMs;
        throw err;
    }

    try {
        await sendPasswordResetEmail(auth, email);
    } catch (error) {
        // With email enumeration protection ON, Firebase normally succeeds
        // silently for unregistered emails. If it ever does throw
        // user-not-found, we deliberately swallow it here and treat it the
        // same as success — we never want to reveal whether an email exists.
        if (error.code === "auth/user-not-found") {
            // do nothing — fall through to recording cooldown + generic success
        } else {
            // Real errors (invalid email format, too-many-requests, network, etc.)
            // are still surfaced normally.
            throw error;
        }
    }

    // Record the timestamp so other devices also see the cooldown.
    // This happens regardless of whether an email was actually delivered,
    // which also avoids leaking account-existence info via cooldown timing.
    try {
        const key = emailToKey(email);
        await setDoc(doc(db, "passwordResetCooldowns", key), {
            lastSent: serverTimestamp(),
        });
    } catch (e) {
        console.error("Failed to record cooldown:", e);
    }
}

// Lets the UI show a live countdown without re-sending
async function getResetCooldownRemaining(email) {
    const status = await checkResetCooldown(email);
    return status.allowed ? 0 : status.remainingMs;
}

// Expose globally
window.MunanAuth = { loginWithEmail, signupWithEmail, loginWithGoogle, logout, resendVerificationEmail, resetPassword, getResetCooldownRemaining };
