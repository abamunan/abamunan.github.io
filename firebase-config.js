// ============================================================
//  firebase-config.js  —  Munan.hub
//  Firebase initialization (App + Auth + Firestore)
//  CDN-based: works on GitHub Pages (no build step needed)
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyDl0Cqhjj-X9SjwMrrTWi_lW4ADsI8Gnq0",
    authDomain:        "login-system-309fc.firebaseapp.com",
    projectId:         "login-system-309fc",
    storageBucket:     "login-system-309fc.firebasestorage.app",
    messagingSenderId: "509365590175",
    appId:             "1:509365590175:web:2a1de8ab7688a96853aaaa"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
