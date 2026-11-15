/* ================================================================
   diary.js  —  Munan.hub Diary Tool Logic
   Firebase 10.x CDN (ESM) — same project as auth.js / login.html
   ================================================================ */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, sendEmailVerification }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection, doc, setDoc, updateDoc, deleteDoc, getDoc,
    query, where, orderBy, limit, startAfter, getDocs, serverTimestamp,
    writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── FIREBASE ─────────────────────────────────────────────────
// App, auth and db come from the shared firebase-config.js.

// ── CONSTANTS ────────────────────────────────────────────────
const MAX_SECTIONS = 10;
const COLLECTION   = "diaryEntries";

// ── STATE ────────────────────────────────────────────────────
let currentUser   = null;
let editingDocId  = null;      // null = creating new entry; set = editing existing doc
let editingUpdatedAt = null;   // Firestore Timestamp of the loaded doc's updatedAt, snapshotted
                                // at load time — used for stale-edit conflict detection
let sectionIdSeq  = 0;         // increments to give each section row a unique DOM id
let historyPageSize = 10;      // 10 | 50 — page size for the paginated History list
let cachedEntries = [];        // entries currently rendered in History, reused for PDF export
let lastVisibleDoc = null;     // Firestore query cursor (doc snapshot) for "Load more"
let hasMoreHistory = true;     // whether another page might exist
let historyLoading = false;    // guards overlapping loadHistory()/loadMoreHistory() calls
let historySearchTerm = "";    // client-side search across entries currently loaded
let readingEntry  = null;      // entry currently open in the read overlay (null = overlay closed)
let deleteInFlight = false;    // guards double-click / repeated delete submissions
let lastFocusedBeforeOverlay = null; // element to restore focus to when the read overlay closes
let draftSaveTimer = null;     // debounce handle for the local draft autosave
let isDirty = false;           // true only while the Write form holds edits that are NOT saved to Firestore
let historyReqId = 0;          // "latest request wins" token for History fetches (fixes the loadHistory race)
let pendingNewRef = null;      // doc ref reserved for a NEW entry whose save timed out — retry reuses it (no duplicates)
const SAVE_TIMEOUT_MS = 15000; // Firestore writes never reject while offline; give up waiting after this long
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const SAFE_ID_RE  = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_TITLE   = 200;
const MAX_CONTENT = 30000;

// ── DOM REFS ─────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const gate            = $("#diary-gate");
const gateContent     = $("#diary-gate-content");
const appRoot         = $("#diary-app");

const entryDateInput  = $("#entry-date");
const entryTimeInput  = $("#entry-time");
const sectionsContainer = $("#sections-container");
const addSectionBtn   = $("#add-section-btn");
const sectionCapMsg   = $("#section-cap-msg");
const wordCountEl     = $("#word-count");
const characterCountEl = $("#character-count");
const sectionCountEl  = $("#section-count");
const saveEntryBtn    = $("#save-entry-btn");
const saveBtnLabel    = $("#save-btn-label");
const clearFormBtn    = $("#clear-form-btn");
const editingBanner   = $("#editing-banner");
const editingBannerText = $("#editing-banner-text");
const cancelEditBtn   = $("#cancel-edit-btn");

const entryListEl     = $("#entry-list");
const loadMoreBtn     = $("#history-load-more-btn");
const downloadPdfBtn  = $("#download-pdf-btn");
const exportAllBtn    = $("#export-all-pdf-btn");
const exportJsonBtn   = $("#export-json-btn");
const importJsonInput = $("#import-json-input");
const filterBtns      = document.querySelectorAll(".diary-filter-btn");
const historySearch   = $("#history-search");
const historySearchWrap = $("#history-search-wrap");
const clearHistorySearch = $("#clear-history-search");
const historySummary  = $("#history-summary");
const searchAllBtn    = $("#search-all-btn");
const toastEl         = $("#diary-toast");

const readOverlay      = $("#diary-read-overlay");
const readBackBtn      = $("#diary-read-back-btn");
const readEditBtn      = $("#diary-read-edit-btn");
const readDeleteBtn    = $("#diary-read-delete-btn");
const readDateEl       = $("#diary-read-date");
const readTimeEl       = $("#diary-read-time");
const readSectionsEl   = $("#diary-read-sections");

const draftBanner      = $("#draft-banner");
const draftBannerText  = $("#draft-banner-text");
const draftDiscardBtn  = $("#draft-discard-btn");

const staleConflictBanner = $("#stale-conflict-banner");
const staleConflictText   = $("#stale-conflict-text");
const staleConflictReloadBtn = $("#stale-conflict-reload-btn");

// NOTE: Theme is handled entirely by the shared theme.js script tag
// in <head> (loaded before this module). It applies the persisted
// theme on load and exposes window.MunanTheme for any page that has
// a visible toggle button. This page has none, so there's nothing
// to wire up here — see theme.js for the single source of truth.

// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

/** Stringifies any error shape (Error instance, plain object, string, etc.) for logging. */
function safeStringifyError(err) {
    try {
        if (err instanceof Error) {
            return JSON.stringify({ name: err.name, code: err.code, message: err.message, stack: err.stack });
        }
        return JSON.stringify(err, Object.getOwnPropertyNames(err || {}));
    } catch {
        return String(err);
    }
}

/** Builds a guaranteed-non-blank, human-readable message from any error shape. */
function buildErrorMessage(err, actionLabel) {
    if (err && err.code === "diary/timeout") {
        return `${actionLabel} is taking too long — your text is kept as a draft on this device. Check your connection, then press Save again.`;
    }
    if (err && err.code === "permission-denied") {
        return `${actionLabel} blocked: you don't have permission (check Firestore rules or that you're logged in).`;
    }
    if (err && (err.code === "unauthenticated" || err.code === "auth/user-token-expired")) {
        return `${actionLabel} failed: your session has expired. Please log in again.`;
    }
    if (err && err.code === "not-found") {
        return `${actionLabel} failed: that entry no longer exists — it may have already been deleted.`;
    }
    if (err && err.code === "failed-precondition") {
        return `${actionLabel} failed: a required Firestore index is missing. Check the browser console for a link to create it.`;
    }
    if (err && err.code === "unavailable") {
        return `${actionLabel} failed: couldn't reach the server. Check your connection and try again.`;
    }
    const code = err && err.code;
    const message = err && err.message;
    if (code || message) {
        return `${actionLabel} failed: ${code || "unknown-code"} — ${message || "no message"}`;
    }
    // Last resort — guarantees we never show a blank toast.
    return `${actionLabel} failed: ${safeStringifyError(err) || "unknown error (see console)"}`;
}

// ════════════════════════════════════════════════════════════
//  SMALL SHARED HELPERS
// ════════════════════════════════════════════════════════════
/** Firestore Timestamp | {seconds,nanoseconds} (old JSON backups) | number -> milliseconds (or null). */
function toMs(t) {
    if (t == null) return null;
    if (typeof t === "number") return t;
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
    return null;
}

/** Rejects with code "diary/timeout" if the promise hasn't settled in `ms`. The underlying write keeps going. */
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const e = new Error("timeout");
            e.code = "diary/timeout";
            reject(e);
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Best-effort read of a doc's updatedAt. A failed read AFTER a successful write must not look like a failed save. */
async function readUpdatedAt(ref) {
    try {
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data().updatedAt || null : null;
    } catch (err) {
        console.warn("Could not read back updatedAt:", err);
        return null;
    }
}

// ════════════════════════════════════════════════════════════
//  AUTH GATE
// ════════════════════════════════════════════════════════════
function renderLoggedOutGate() {
    gateContent.innerHTML = `
        <div class="diary-gate-card">
            <i class="lock-icon fas fa-lock"></i>
            <h2>Login required</h2>
            <p>Your diary is private. Log in to write, view, and export your entries.</p>
            <a href="login.html?redirect=diary-classic.html" class="diary-btn diary-btn-primary">
                <i class="fas fa-right-to-bracket"></i> Go to Login
            </a>
        </div>`;
    gate.style.display = "flex";
    appRoot.style.display = "none";
}

function renderUnverifiedGate(user) {
    gateContent.innerHTML = `
        <div class="diary-gate-card">
            <i class="lock-icon fas fa-envelope-circle-check"></i>
            <h2>Verify your email</h2>
            <p>${escapeHtml(user.email || "This account")} isn't verified yet. Open the verification email, then press “I've verified”.</p>
            <button type="button" class="diary-btn diary-btn-primary" id="check-verify-btn">
                <i class="fas fa-check"></i> I've verified
            </button>
            <button type="button" class="diary-btn diary-btn-ghost" id="resend-verify-btn" style="margin-top:10px;">
                <i class="fas fa-paper-plane"></i> Resend email
            </button>
        </div>`;
    gate.style.display = "flex";
    appRoot.style.display = "none";

    $("#check-verify-btn").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            await user.reload();
            if (user.emailVerified) {
                await user.getIdToken(true); // refresh the token so Firestore rules see email_verified = true
                window.location.reload();
            } else {
                showToast("Still not verified — check your inbox (and spam).", true);
                btn.disabled = false;
            }
        } catch (err) {
            console.error("Verification check failed:", err);
            showToast(buildErrorMessage(err, "Checking"), true);
            btn.disabled = false;
        }
    });
    $("#resend-verify-btn").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            await sendEmailVerification(user);
            showToast("Verification email sent.");
        } catch (err) {
            console.error("Resend verification failed:", err);
            showToast(buildErrorMessage(err, "Sending the email"), true);
            btn.disabled = false;
        }
    });
}

function unlockApp() {
    gate.style.display = "none";
    appRoot.style.display = "block";
}

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        currentUser = user;
        unlockApp();
        resetFormToNew();         // seed one default section, today's date/time
        tryRestoreDraft();        // Phase 3 — restore any local unsaved draft over that blank form
        lastVisibleDoc = null;
        hasMoreHistory = true;
        loadHistory();             // initial fetch for History tab
    } else if (user) {
        currentUser = null;
        renderUnverifiedGate(user);
    } else {
        currentUser = null;
        renderLoggedOutGate();
    }
});
// ════════════════════════════════════════════════════════════
//  TAB SWITCHING (Write / History)
// ════════════════════════════════════════════════════════════
document.querySelectorAll(".diary-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".diary-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".diary-view").forEach((v) => v.classList.remove("active"));
        tab.classList.add("active");
        $(`#view-${tab.dataset.tab}`).classList.add("active");
    });
});

// ════════════════════════════════════════════════════════════
//  SECTION MANAGEMENT (Write form)
// ════════════════════════════════════════════════════════════
function sectionCount() {
    return sectionsContainer.children.length;
}

function updateAddSectionVisibility() {
    const atMax = sectionCount() >= MAX_SECTIONS;
    addSectionBtn.hidden = atMax;
    sectionCapMsg.style.display = atMax ? "block" : "none";
}

function updateRemoveButtonsVisibility() {
    const onlyOne = sectionCount() <= 1;
    sectionsContainer.querySelectorAll(".diary-section-remove").forEach((btn) => {
        btn.style.display = onlyOne ? "none" : "flex";
    });
}

/**
 * Adds one section row to the form.
 * title/content prefill is used when loading an entry for edit.
 */
function addSectionRow(title = "", content = "") {
    if (sectionCount() >= MAX_SECTIONS) return;

    sectionIdSeq += 1;
    const rowId = `sec-${sectionIdSeq}`;

    const row = document.createElement("div");
    row.className = "diary-section";
    row.dataset.rowId = rowId;
    row.innerHTML = `
        <div class="diary-section-head">
            <input type="text" class="section-title-input" placeholder="Section title (optional)" maxlength="${MAX_TITLE}" value="${escapeAttr(title)}">
            <button type="button" class="diary-section-remove" aria-label="Remove section" title="Remove section">
                <i class="fas fa-xmark"></i>
            </button>
        </div>
        <textarea class="section-content-input" placeholder="Write here…" maxlength="${MAX_CONTENT}">${escapeHtml(content)}</textarea>
    `;
    sectionsContainer.appendChild(row);

    row.querySelector(".diary-section-remove").addEventListener("click", () => {
        if (sectionCount() <= 1) return; // guard — can't remove the last one
        row.remove();
        updateAddSectionVisibility();
        updateRemoveButtonsVisibility();
        updateWritingStats();
    });

    updateAddSectionVisibility();
    updateRemoveButtonsVisibility();
    updateWritingStats();
}

addSectionBtn.addEventListener("click", () => addSectionRow());

function clearSections() {
    sectionsContainer.innerHTML = "";
    updateWritingStats();
}

function updateWritingStats() {
    const text = [...sectionsContainer.querySelectorAll(".section-content-input")]
        .map((input) => input.value.trim())
        .filter(Boolean)
        .join(" ");
    const words = text ? text.split(/\s+/).length : 0;
    wordCountEl.textContent = words.toLocaleString();
    characterCountEl.textContent = text.length.toLocaleString();
    sectionCountEl.textContent = sectionCount().toLocaleString();
}

// ════════════════════════════════════════════════════════════
//  FORM ↔ DATA HELPERS
// ════════════════════════════════════════════════════════════
function todayDateString() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function nowTimeString() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
}

function resetFormToNew() {
    editingDocId = null;
    editingUpdatedAt = null;
    pendingNewRef = null;
    isDirty = false;
    staleConflictBanner.classList.remove("active");
    draftBanner.classList.remove("active"); // visual only — does NOT delete the underlying
                                              // localStorage draft; only clearDraft() does that
    editingBanner.classList.remove("active");
    saveBtnLabel.textContent = "Save Entry";
    entryDateInput.value = todayDateString();
    entryTimeInput.value = nowTimeString();
    clearSections();
    addSectionRow(); // exactly one default section
}

clearFormBtn.addEventListener("click", () => {
    resetFormToNew();
    clearDraft(); // intentional clear — don't resurrect the discarded text on next load
    showToast("Form cleared");
});

cancelEditBtn.addEventListener("click", () => {
    resetFormToNew();
});

// ════════════════════════════════════════════════════════════
//  DRAFT PROTECTION (Phase 3 — local-only, never touches Firestore)
// ════════════════════════════════════════════════════════════
// Keyed per-user so a shared browser never shows one account's in-progress
// writing to another. Purely a browser-local safety net for accidental
// reloads/crashes — it never gets written to Firestore on its own.
function draftStorageKey() {
    return currentUser ? `munan-diary-draft:${currentUser.uid}` : null;
}

function collectDraftSnapshot() {
    const sections = [...sectionsContainer.querySelectorAll(".diary-section")].map((el) => ({
        title: el.querySelector(".section-title-input").value,
        content: el.querySelector(".section-content-input").value,
    }));
    return {
        date: entryDateInput.value, time: entryTimeInput.value, sections, savedAt: Date.now(),
        // B8: remember WHICH saved entry (if any) this draft belongs to, so a restore updates it instead of
        // silently turning into a duplicate "new" entry.
        editingDocId: editingDocId || null,
        baseUpdatedAtMs: editingDocId ? toMs(editingUpdatedAt) : null,
    };
}

function draftHasMeaningfulContent(snapshot) {
    return !!snapshot && snapshot.sections.some((s) => (s.title || "").trim() || (s.content || "").trim());
}

/** Debounced — called on every relevant keystroke, but only writes to
 *  localStorage ~800ms after typing stops, so we're not hitting disk on
 *  every character. */
function scheduleDraftSave() {
    isDirty = true; // B6: any real edit makes the form "unsaved" until a save succeeds
    const key = draftStorageKey();
    if (!key) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
        const snapshot = collectDraftSnapshot();
        try {
            if (!draftHasMeaningfulContent(snapshot)) {
                localStorage.removeItem(key); // nothing worth keeping — don't litter storage
            } else {
                localStorage.setItem(key, JSON.stringify(snapshot));
            }
        } catch (err) {
            // Best-effort only (quota / private-browsing can throw) — never
            // interrupt the person's writing over a failed local backup.
            console.warn("Draft autosave failed:", err);
        }
    }, 800);
}

/** Writes the draft immediately (used right before the page unloads and after a timed-out save). */
function flushDraftNow() {
    const key = draftStorageKey();
    if (!key) return;
    clearTimeout(draftSaveTimer);
    try {
        const snapshot = collectDraftSnapshot();
        if (draftHasMeaningfulContent(snapshot)) localStorage.setItem(key, JSON.stringify(snapshot));
    } catch (err) { console.warn("Draft flush failed:", err); }
}

function clearDraft() {
    clearTimeout(draftSaveTimer);
    const key = draftStorageKey();
    if (key) { try { localStorage.removeItem(key); } catch { /* best-effort */ } }
    draftBanner.classList.remove("active");
}

/** Restores a saved draft into the form on load, if one exists and has
 *  real content. Local-only — never overwrites anything already saved in
 *  Firestore, since it only ever touches the in-page form. */
function tryRestoreDraft() {
    const key = draftStorageKey();
    if (!key) return;
    let raw;
    try { raw = localStorage.getItem(key); } catch { return; }
    if (!raw) return;

    let snapshot;
    try { snapshot = JSON.parse(raw); } catch { try { localStorage.removeItem(key); } catch {} return; }
    if (!draftHasMeaningfulContent(snapshot)) return;

    if (snapshot.date) entryDateInput.value = snapshot.date;
    if (snapshot.time) entryTimeInput.value = snapshot.time;
    clearSections();
    (snapshot.sections.length ? snapshot.sections : [{ title: "", content: "" }])
        .slice(0, MAX_SECTIONS)
        .forEach((s) => addSectionRow(s.title, s.content));
    updateAddSectionVisibility();
    updateRemoveButtonsVisibility();

    isDirty = true; // a restored draft is, by definition, not saved yet
    if (typeof snapshot.editingDocId === "string" && SAFE_ID_RE.test(snapshot.editingDocId)) {
        editingDocId = snapshot.editingDocId;
        editingUpdatedAt = typeof snapshot.baseUpdatedAtMs === "number" ? Timestamp.fromMillis(snapshot.baseUpdatedAtMs) : null;
        editingBanner.classList.add("active");
        editingBannerText.textContent = `Editing an existing entry (draft restored) · ${formatDateLabel(`${entryDateInput.value}T00:00:00`)}`;
        saveBtnLabel.textContent = "Update Entry";
    }

    const when = snapshot.savedAt
        ? new Date(snapshot.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "earlier";
    draftBannerText.textContent = `Draft restored from ${when} — not saved yet.`;
    draftBanner.classList.add("active");
}

draftDiscardBtn.addEventListener("click", () => {
    resetFormToNew();
    clearDraft();
    showToast("Draft discarded");
});

// Any edit to date/time/section title/content schedules a debounced save.
// 'input' bubbles for text inputs and textareas, so one delegated listener
// on the sections container covers every current AND future section row.
entryDateInput.addEventListener("input", scheduleDraftSave);
entryTimeInput.addEventListener("input", scheduleDraftSave);
sectionsContainer.addEventListener("input", scheduleDraftSave);
sectionsContainer.addEventListener("input", updateWritingStats);

// Structural changes (add/remove a section) also count as meaningful edits,
// even though they don't fire an 'input' event themselves.
addSectionBtn.addEventListener("click", scheduleDraftSave);
sectionsContainer.addEventListener("click", (e) => {
    if (e.target.closest(".diary-section-remove")) scheduleDraftSave();
});

// Warn before leaving the tab/page only when there's real unsaved writing
// in the form — never block navigation away from an empty form.
window.addEventListener("beforeunload", (e) => {
    if (!currentUser || !isDirty) return;               // B6: nothing unsaved -> never nag
    if (!draftHasMeaningfulContent(collectDraftSnapshot())) return;
    flushDraftNow();                                    // the 800ms debounce may not have fired yet
    e.preventDefault();
    e.returnValue = "";
});

/** Reads the current Write form into a plain object (no Firestore-specific fields). */
function readFormData() {
    const dateVal = entryDateInput.value;
    const timeVal = entryTimeInput.value;
    if (!dateVal) return { error: "Please pick a date for this entry." };
    if (!timeVal) return { error: "Please pick a time for this entry." };

    // Combine date + time into one ISO-ish local string for clean sorting.
    // Stored as "YYYY-MM-DDTHH:MM:00" (local time, no offset) so that
    // string sort order == chronological order == what the date/time
    // pickers showed, with no timezone-shift surprises on reload.
    const datetime = `${dateVal}T${timeVal}:00`;

    const sectionEls = [...sectionsContainer.querySelectorAll(".diary-section")];
    if (sectionEls.length === 0) return { error: "Add at least one section." };

    const sections = sectionEls.map((el, i) => {
        const titleInput = el.querySelector(".section-title-input");
        const contentInput = el.querySelector(".section-content-input");
        const title = titleInput.value.trim(); // B10: empty stays empty — the UI shows "Untitled"
        const content = contentInput.value; // intentionally not trimmed — preserves user's line breaks/spacing
        return { title, content };
    });

    const hasAnyContent = sections.some((s) => s.content.trim().length > 0);
    if (!hasAnyContent) return { error: "Write something in at least one section before saving." };

    return { datetime, sections };
}

/** Loads a Firestore entry doc into the Write form for editing. */
function loadEntryIntoForm(entryDoc) {
    editingDocId = entryDoc.id;
    pendingNewRef = null;
    isDirty = false;
    // Snapshot the updatedAt we're editing FROM — Phase 4 compares this
    // against the server's current value right before writing, so we can
    // tell whether the document changed elsewhere while this was open.
    editingUpdatedAt = entryDoc.updatedAt || null;
    staleConflictBanner.classList.remove("active");
    draftBanner.classList.remove("active"); // this is a saved entry now, not the restored draft
    editingBanner.classList.add("active");
    editingBannerText.textContent =
        `Editing entry from ${formatDateLabel(entryDoc.datetime)} · ${formatTimeLabel(entryDoc.datetime)}`;
    saveBtnLabel.textContent = "Update Entry";

    const [datePart, timePart] = entryDoc.datetime.split("T");
    entryDateInput.value = datePart || todayDateString();
    entryTimeInput.value = (timePart || "00:00").slice(0, 5);

    clearSections();
    const sections = entryDoc.sections && entryDoc.sections.length ? entryDoc.sections : [{ title: "", content: "" }];
    sections.slice(0, MAX_SECTIONS).forEach((s) => addSectionRow(s.title, s.content));

    // Jump to Write tab so the user actually sees the loaded form
    document.querySelector('.diary-tab[data-tab="write"]').click();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ════════════════════════════════════════════════════════════
//  SAVE (create or update)
// ════════════════════════════════════════════════════════════
saveEntryBtn.addEventListener("click", async () => {
    if (!currentUser) { showToast("You need to be logged in.", true); return; }

    const data = readFormData();
    if (data.error) { showToast(data.error, true); return; }
    if (new Date(data.datetime).getTime() > Date.now() + 60000 &&
        !window.confirm("This entry is dated in the future. Save anyway?")) return;

    saveEntryBtn.disabled = true;
    // Snapshot BEFORE any await — editingDocId changes mid-flow for new entries.
    const wasEditing = !!editingDocId;
    saveBtnLabel.textContent = wasEditing ? "Updating…" : "Saving…";

    try {
        if (wasEditing) {
            const ref = doc(db, COLLECTION, editingDocId);

            // Stale-edit protection: re-fetch the real current state right before writing.
            const latestSnap = await withTimeout(getDoc(ref), SAVE_TIMEOUT_MS);
            if (!latestSnap.exists()) {
                showToast("This entry was deleted elsewhere — nothing to update.", true);
                resetFormToNew();
                clearDraft();
                lastVisibleDoc = null; hasMoreHistory = true;
                await loadHistory(true);
                return;
            }
            const latestData = latestSnap.data();
            // Compare by milliseconds: works for real Timestamps AND for the plain {seconds,nanoseconds}
            // maps that older JSON restores wrote (isEqual() silently disabled this check for those).
            const baseMs = toMs(editingUpdatedAt);
            const latestMs = toMs(latestData.updatedAt);
            const isStale = baseMs != null && latestMs != null && baseMs !== latestMs;
            if (isStale) {
                saveBtnLabel.textContent = "Update Entry";
                staleConflictText.textContent =
                    "This entry changed elsewhere since you started editing. Saving now would overwrite that change.";
                staleConflictBanner.classList.add("active");
                staleConflictReloadBtn.onclick = () => {
                    loadEntryIntoForm({ id: editingDocId, ...latestData });
                    staleConflictBanner.classList.remove("active");
                    showToast("Loaded the latest version.");
                };
                return; // do NOT write
            }

            await withTimeout(updateDoc(ref, {
                datetime: data.datetime,
                sections: data.sections,
                updatedAt: serverTimestamp(),
            }), SAVE_TIMEOUT_MS);
            editingUpdatedAt = await readUpdatedAt(ref);
            showToast("Entry updated.");
        } else {
            // Reuse the reserved ref if a previous attempt timed out, so a retry can never create a duplicate.
            const newRef = pendingNewRef || doc(collection(db, COLLECTION));
            pendingNewRef = newRef;
            await withTimeout(setDoc(newRef, {
                userId: currentUser.uid,
                datetime: data.datetime,
                sections: data.sections,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }), SAVE_TIMEOUT_MS);
            pendingNewRef = null;
            editingDocId = newRef.id;
            editingUpdatedAt = await readUpdatedAt(newRef);
            editingBanner.classList.add("active");
            editingBannerText.textContent = `Editing entry from ${formatDateLabel(data.datetime)} · ${formatTimeLabel(data.datetime)}`;
            saveBtnLabel.textContent = "Update Entry";
            showToast("Entry saved.");
        }
        isDirty = false;   // B6: saved -> no more "Leave site?" prompt
        clearDraft();
        syncSavedEntryIntoHistory(editingDocId, data, editingUpdatedAt); // B17: no full reload
    } catch (err) {
        console.error("Diary save failed:", err, safeStringifyError(err));
        // Timed out / offline: keep the writing safe locally. The write itself may still land later.
        if (err && err.code === "diary/timeout") flushDraftNow();
        showToast(buildErrorMessage(err, "Save"), true);
        saveBtnLabel.textContent = wasEditing ? "Update Entry" : "Save Entry";
    } finally {
        saveEntryBtn.disabled = false;
    }
});

// ════════════════════════════════════════════════════════════
//  READ OVERLAY (view-only entry detail)
// ════════════════════════════════════════════════════════════
// Opened when a History row is clicked. Purely presentational — no
// inputs, nothing editable. The only way into the Write form for an
// existing entry is the explicit "Edit" button below, which hands off
// to the same loadEntryIntoForm() used before, so save/update logic
// is untouched.
function showEntryRead(entryDoc, triggerEl) {
    readingEntry = entryDoc;
    lastFocusedBeforeOverlay = triggerEl || document.activeElement; // Phase 8 — restore focus on close
    readDateEl.textContent = formatDateLabel(entryDoc.datetime);
    readTimeEl.textContent = formatTimeLabel(entryDoc.datetime);

    const sections = entryDoc.sections && entryDoc.sections.length
        ? entryDoc.sections
        : [{ title: "Untitled", content: "" }];

    readSectionsEl.innerHTML = sections.map((s) => `
        <div>
            <div class="diary-read-section-title">${escapeHtml(s.title || "Untitled")}</div>
            <div class="diary-read-section-body">${escapeHtml(s.content || "")}</div>
        </div>`).join("");

    readOverlay.classList.add("show");
    readBackBtn.focus(); // Phase 8 — move focus into the dialog when it opens
}

function closeEntryRead() {
    readOverlay.classList.remove("show");
    readingEntry = null;
    // Phase 8 — return focus to whatever opened the dialog (the History row).
    if (lastFocusedBeforeOverlay && typeof lastFocusedBeforeOverlay.focus === "function") {
        lastFocusedBeforeOverlay.focus();
    }
    lastFocusedBeforeOverlay = null;
}

readBackBtn.addEventListener("click", closeEntryRead);

// Click on the dimmed backdrop (not the card itself) also closes it.
readOverlay.addEventListener("click", (e) => {
    if (e.target === readOverlay) closeEntryRead();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && readOverlay.classList.contains("show")) closeEntryRead();
});

// Phase 8 — keep Tab focus cycling inside the dialog while it's open.
function getReadOverlayFocusables() {
    return [...readOverlay.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
}
readOverlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusables = getReadOverlayFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
    }
});

readEditBtn.addEventListener("click", () => {
    if (!readingEntry) return;
    if (isDirty && draftHasMeaningfulContent(collectDraftSnapshot()) &&
        !window.confirm("The Write form has unsaved text. Opening this entry will replace it. Continue?")) {
        return; // B7: keep the form (and its draft) untouched
    }
    const entry = readingEntry;
    closeEntryRead();
    loadEntryIntoForm(entry); // existing logic: fills Write form, shows editing banner, switches tab
});

// ════════════════════════════════════════════════════════════
//  DELETE (Phase 2 — safe, confirmed, by-ID deletion)
// ════════════════════════════════════════════════════════════
readDeleteBtn.addEventListener("click", async () => {
    if (!readingEntry || deleteInFlight) return; // guards double-click / repeated submits
    const entry = readingEntry;

    const confirmed = window.confirm(
        "Delete this diary entry? This is permanent — there is no undo or recycle bin."
    );
    if (!confirmed) return;

    deleteInFlight = true;
    readDeleteBtn.disabled = true;
    const originalHtml = readDeleteBtn.innerHTML;
    readDeleteBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Deleting…';

    try {
        // Always by document ID — never inferred from date/title, so this
        // can't accidentally hit the wrong entry.
        await deleteDoc(doc(db, COLLECTION, entry.id));

        cachedEntries = cachedEntries.filter((e) => e.id !== entry.id); // update cachedEntries
        renderEntryList(cachedEntries);                                 // refresh History + PDF availability
        updateLoadMoreVisibility();
        if (editingDocId === entry.id) resetFormToNew();                // don't leave a "ghost" edit open
        closeEntryRead();
        showToast("Entry deleted.");
    } catch (err) {
        console.error("Diary delete failed:", err);
        showToast(buildErrorMessage(err, "Delete"), true);
    } finally {
        deleteInFlight = false;
        readDeleteBtn.disabled = false;
        readDeleteBtn.innerHTML = originalHtml;
    }
});

// ════════════════════════════════════════════════════════════
//  HISTORY (list + filter)
// ════════════════════════════════════════════════════════════
// Phase 5 — these buttons now set the PAGE SIZE for a paginated History
// list (not an unrestricted fetch). Changing page size restarts pagination
// from the newest entry. There is deliberately no "All" button here — see
// exportAllBtn below for the one place the app fetches the whole diary,
// and only as an explicit, user-initiated action.
filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        historyPageSize = parseInt(btn.dataset.limit, 10) || 10;
        lastVisibleDoc = null;
        hasMoreHistory = true;
        loadHistory();
    });
});

// NOTE — Firestore composite index required:
// Collection: diaryEntries  |  Fields: userId ASC, datetime DESC
// First query on a fresh project will throw with a URL to auto-create it.
// Click that URL once in the browser console and it's done.
async function loadHistory(silent = false) {
    if (!currentUser) return;
    const reqId = ++historyReqId; // B9: a newer call supersedes older ones instead of being ignored
    historyLoading = true;
    entryListEl.innerHTML = `<div class="diary-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading entries…</div>`;
    loadMoreBtn.style.display = "none";

    try {
        const q = query(
            collection(db, COLLECTION),
            where("userId", "==", currentUser.uid),
            orderBy("datetime", "desc"),
            limit(historyPageSize)
        );
        const snap = await getDocs(q);
        if (reqId !== historyReqId) return; // superseded by a newer request
        cachedEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lastVisibleDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
        hasMoreHistory = snap.docs.length === historyPageSize; // a full page means there may be more
        renderEntryList(cachedEntries);
        updateLoadMoreVisibility();
    } catch (err) {
        if (reqId !== historyReqId) return;
        console.error("Diary history fetch failed — raw error object:", err);
        console.error("Diary history fetch failed — code:", err && err.code);
        console.error("Diary history fetch failed — stringified:", safeStringifyError(err));
        entryListEl.innerHTML = `<div class="diary-empty"><i class="fas fa-triangle-exclamation"></i><p>Couldn't load entries. Check your connection and try again.</p></div>`;
        // silent=true is used for the auto-refresh right after a save — that save
        // already succeeded and told the user so via toast. Showing a second,
        // unrelated error toast here would overwrite/mask that success message
        // and make it look like the SAVE failed, when only this refresh did.
        if (!silent) showToast(buildErrorMessage(err, "Loading entries"), true);
    } finally {
        if (reqId === historyReqId) historyLoading = false;
    }
}

/** Fetches the next page after the last-loaded entry and appends it —
 *  Firestore cursor pagination via startAfter(), never re-fetching or
 *  duplicating entries already in cachedEntries. */
async function loadMoreHistory() {
    if (!currentUser || historyLoading || !hasMoreHistory || !lastVisibleDoc) return;
    const myReq = historyReqId;
    historyLoading = true;
    loadMoreBtn.disabled = true;
    const originalHtml = loadMoreBtn.innerHTML;
    loadMoreBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Loading…';

    try {
        const q = query(
            collection(db, COLLECTION),
            where("userId", "==", currentUser.uid),
            orderBy("datetime", "desc"),
            startAfter(lastVisibleDoc),
            limit(historyPageSize)
        );
        const snap = await getDocs(q);
        if (myReq !== historyReqId) return; // a fresh History load started meanwhile
        const newEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const seen = new Set(cachedEntries.map((e) => e.id));
        cachedEntries = cachedEntries.concat(newEntries.filter((e) => !seen.has(e.id))) // dedupe defensively
            .sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));
        lastVisibleDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : lastVisibleDoc;
        hasMoreHistory = snap.docs.length === historyPageSize;
        renderEntryList(cachedEntries);
        updateLoadMoreVisibility();
    } catch (err) {
        console.error("Diary load-more failed:", err);
        showToast(buildErrorMessage(err, "Loading more entries"), true);
    } finally {
        if (myReq === historyReqId) historyLoading = false;
        loadMoreBtn.disabled = false;
        loadMoreBtn.innerHTML = originalHtml;
    }
}

/** B17: after a save, patch the already-loaded list instead of refetching page 1 (keeps pagination, saves reads). */
function syncSavedEntryIntoHistory(id, data, updatedAt) {
    if (!updatedAt || (!cachedEntries.length && hasMoreHistory)) {
        // Can't build a trustworthy local copy (or History never loaded) — fall back to a fresh fetch.
        lastVisibleDoc = null; hasMoreHistory = true;
        loadHistory(true);
        return;
    }
    const prev = cachedEntries.find((e) => e.id === id);
    const entry = {
        ...(prev || {}),
        id,
        userId: currentUser.uid,
        datetime: data.datetime,
        sections: data.sections,
        createdAt: (prev && prev.createdAt) || updatedAt,
        updatedAt,
    };
    cachedEntries = [entry, ...cachedEntries.filter((e) => e.id !== id)]
        .sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));
    renderEntryList(cachedEntries);
    updateLoadMoreVisibility();
}

function updateLoadMoreVisibility() {
    // "flex" (not "inline-flex") so the block-level auto-margins in CSS
    // (`margin: 18px auto 0`) actually center the button.
    loadMoreBtn.style.display = (cachedEntries.length && hasMoreHistory) ? "flex" : "none";
}

loadMoreBtn.addEventListener("click", loadMoreHistory);

/** Text a search term is matched against: ISO date + human date/time ("Oct 27", "Tuesday", "9:05 AM") + all section text. */
function searchableText(entry) {
    const d = new Date(entry.datetime);
    const human = isNaN(d) ? "" : [
        d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    ].join(" ");
    return [entry.datetime, human, ...(entry.sections || []).flatMap((s) => [s.title, s.content])]
        .join(" ").toLocaleLowerCase();
}

/** Multi-word search: every word must appear somewhere in the entry. */
function filterEntries(entries) {
    const terms = historySearchTerm.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return entries;
    return entries.filter((e) => { const t = searchableText(e); return terms.every((x) => t.includes(x)); });
}

function renderEntryList(entries) {
    const normalizedSearch = historySearchTerm.trim().toLocaleLowerCase();
    const visibleEntries = filterEntries(entries);

    historySummary.textContent = normalizedSearch
        ? `${visibleEntries.length} of ${entries.length} loaded ${entries.length === 1 ? "entry" : "entries"} match “${historySearchTerm.trim()}”. Tap “Search entire diary” to include older entries.`
        : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} loaded`;
    searchAllBtn.style.display = (normalizedSearch && hasMoreHistory) ? "inline-flex" : "none";

    if (!visibleEntries.length) {
        entryListEl.innerHTML = `
            <div class="diary-empty">
                <i class="fas ${normalizedSearch ? "fa-magnifying-glass" : "fa-feather"}"></i>
                <p>${normalizedSearch ? "No loaded entries match your search." : "No entries yet — your first one is one tab away."}</p>
            </div>`;
        downloadPdfBtn.disabled = !entries.length;
        return;
    }
    downloadPdfBtn.disabled = false;

    entryListEl.innerHTML = visibleEntries.map((entry) => {
        const first = entry.sections && entry.sections[0] ? entry.sections[0] : { title: "Untitled", content: "" };
        const sectionsArr = entry.sections || [];
        const snippet = (first.content || "").trim().slice(0, 90).replace(/\n+/g, " ");
        const d = new Date(entry.datetime);
        const dayNum = isNaN(d) ? "--" : d.getDate();
        const monthAbbr = isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short" });
        return `
            <div class="diary-entry" data-doc-id="${entry.id}">
                <div class="diary-entry-date"><span class="d">${dayNum}</span><span class="m">${monthAbbr}</span></div>
                <div class="diary-entry-body">
                    <div class="diary-entry-title">${escapeHtml(first.title || "Untitled")}${sectionsArr.length > 1 ? ` <span style="opacity:.55;font-weight:500;">+${sectionsArr.length - 1} more</span>` : ""}</div>
                    <div class="diary-entry-snippet">${escapeHtml(snippet) || "<em style=\"opacity:.6;\">No content</em>"}</div>
                </div>
                <div class="diary-entry-time">${formatTimeLabel(entry.datetime)}</div>
                <i class="fas fa-chevron-right diary-entry-arrow"></i>
            </div>`;
    }).join("");

    entryListEl.querySelectorAll(".diary-entry").forEach((el) => {
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "button");
        const open = () => {
            const entry = cachedEntries.find((e) => e.id === el.dataset.docId);
            if (entry) showEntryRead(entry, el);
        };
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        });
    });
}

historySearch.addEventListener("input", () => {
    historySearchTerm = historySearch.value;
    historySearchWrap.classList.toggle("has-value", !!historySearch.value);
    renderEntryList(cachedEntries);
});

searchAllBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    searchAllBtn.disabled = true;
    const originalHtml = searchAllBtn.innerHTML;
    searchAllBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Loading all…';
    try {
        const all = await fetchAllEntries();
        historyReqId++;            // cancel any History fetch still in flight
        historyLoading = false;
        cachedEntries = all;
        lastVisibleDoc = null;
        hasMoreHistory = false;    // everything is loaded now
        renderEntryList(cachedEntries);
        updateLoadMoreVisibility();
        showToast(`Searching all ${all.length} ${all.length === 1 ? "entry" : "entries"}.`);
    } catch (err) {
        console.error("Search-all failed:", err);
        showToast(buildErrorMessage(err, "Loading all entries"), true);
    } finally {
        searchAllBtn.disabled = false;
        searchAllBtn.innerHTML = originalHtml;
    }
});

clearHistorySearch.addEventListener("click", () => {
    historySearch.value = "";
    historySearchTerm = "";
    historySearchWrap.classList.remove("has-value");
    renderEntryList(cachedEntries);
    historySearch.focus();
});

// ════════════════════════════════════════════════════════════
//  DATE / TIME FORMATTING HELPERS
// ════════════════════════════════════════════════════════════
function formatDateLabel(datetime) {
    const d = new Date(datetime);
    if (isNaN(d)) return datetime;
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function formatTimeLabel(datetime) {
    const d = new Date(datetime);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}
function escapeAttr(str) {
    return (str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ════════════════════════════════════════════════════════════
//  PDF EXPORT (browser print engine)
// ════════════════════════════════════════════════════════════
// Phase 5/6 — History is paginated, so PDF export now has two explicit,
// clearly-labeled modes rather than one button that silently meant
// different things depending on which filter was active:
//   A) "Download PDF"  → exports exactly what's currently loaded in
//      History (cachedEntries) — fast, no extra fetch.
//   B) "Export All"    → an explicit, separate operation that fetches
//      every entry first (with the user's confirmation, since it can be
//      slow for a large diary), then builds the PDF from that full set.
// Neither ever fetches the whole diary as a side effect of just opening
// the History tab or clicking "Last 10/50".

/** Print-only markup. Pure HTML strings; all styling lives in diary-page.css under @media print. */
function buildPrintHtml(entries) {
    const exported = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const cards = entries.map((entry) => {
        const secs = (entry.sections || []).map((sec) => `
            <section class="dp-section">
                <h3 class="dp-sec-title">${escapeHtml(sec.title || "Untitled")}</h3>
                <div class="dp-sec-body">${escapeHtml(sec.content || "")}</div>
            </section>`).join("");
        return `
            <article class="dp-entry">
                <header class="dp-entry-head">
                    <span class="dp-date">${escapeHtml(formatDateLabel(entry.datetime))}</span>
                    <span class="dp-time">${escapeHtml(formatTimeLabel(entry.datetime))}</span>
                </header>${secs}
            </article>`;
    }).join("");
    return `
        <div class="dp-head">
            <div class="dp-title">Munan's <span>Diary</span></div>
            <div class="dp-sub">${entries.length} ${entries.length === 1 ? "entry" : "entries"} · exported ${exported}</div>
        </div>${cards}`;
}

/**
 * B5: export through the browser's own print engine ("Save as PDF").
 * Real selectable text, no canvas size limit (the old html2pdf path rendered the whole diary into ONE
 * canvas and failed on phones past ~8 pages), long entries flow across pages, Bangla uses the page font.
 */
function printEntries(entries, label) {
    document.getElementById("diary-print-root")?.remove();
    const root = document.createElement("div");
    root.id = "diary-print-root";            // display:none on screen; shown only by @media print
    root.innerHTML = buildPrintHtml(entries);
    document.body.appendChild(root);
    document.body.classList.add("diary-printing");

    const prevTitle = document.title;
    document.title = `Munans-Diary-${label}-${todayDateString()}`; // becomes the suggested PDF file name
    const restore = () => {
        document.title = prevTitle;
        document.body.classList.remove("diary-printing");
        window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setTimeout(() => window.print(), 100);   // let layout settle first
}

downloadPdfBtn.addEventListener("click", () => {
    // Exports exactly what History is showing (respects the search filter).
    const entries = filterEntries(cachedEntries);
    if (!entries.length) { showToast("No entries to export yet.", true); return; }
    printEntries(entries, "Shown");
    showToast("In the print dialog, choose “Save as PDF”.");
});

exportAllBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    exportAllBtn.disabled = true;
    const originalHtml = exportAllBtn.innerHTML;
    exportAllBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Fetching all entries…';
    try {
        const all = await fetchAllEntries();
        if (!all.length) { showToast("No entries to export yet.", true); return; }
        printEntries(all, "All");
        showToast(`Opening print dialog — ${all.length} entries. Choose “Save as PDF”.`);
    } catch (err) {
        console.error("Export-all failed:", err);
        showToast(buildErrorMessage(err, "Export all"), true);
    } finally {
        exportAllBtn.disabled = false;
        exportAllBtn.innerHTML = originalHtml;
    }
});

/** Every entry of the signed-in user (one explicit, user-initiated fetch — used by Backup JSON). */
async function fetchAllEntries() {
    const q = query(
        collection(db, COLLECTION),
        where("userId", "==", currentUser.uid),
        orderBy("datetime", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Plain-JSON shape for backups: timestamps become milliseconds (a raw Timestamp serialises to a bare object). */
function serializeEntry(e) {
    return {
        id: e.id,
        userId: e.userId,
        datetime: e.datetime,
        sections: (e.sections || []).map((x) => ({ title: x.title ?? "", content: x.content ?? "" })),
        createdAtMs: toMs(e.createdAt),
        updatedAtMs: toMs(e.updatedAt),
    };
}

function downloadDiaryJson(entries) {
    const blob = new Blob([JSON.stringify({
        app: "munan-diary",
        version: 2,
        exportedAt: new Date().toISOString(),
        count: entries.length,
        entries: entries.map(serializeEntry),
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `munans-diary-${todayDateString()}.json`;
    document.body.appendChild(a);          // B12: Safari/iOS need the anchor in the DOM
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); // B12: revoking immediately can cancel the download
}

exportJsonBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    exportJsonBtn.disabled = true;
    const originalHtml = exportJsonBtn.innerHTML;
    exportJsonBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Fetching all…';
    try {
        // B1: back up the WHOLE diary, not just the 10/50 entries currently loaded in History.
        const all = await fetchAllEntries();
        if (!all.length) { showToast("No entries to back up yet.", true); return; }
        downloadDiaryJson(all);
        showToast(`JSON backup downloaded — all ${all.length} ${all.length === 1 ? "entry" : "entries"}.`);
    } catch (err) {
        console.error("Diary JSON backup failed:", err);
        showToast(buildErrorMessage(err, "Backup"), true);
    } finally {
        exportJsonBtn.disabled = false;
        exportJsonBtn.innerHTML = originalHtml;
    }
});

/** Timestamp from a v2 `…Ms` number or an old v1 {seconds,nanoseconds} object; null if neither is usable. */
function restoreTimestamp(ms, legacy) {
    if (typeof ms === "number" && isFinite(ms)) return Timestamp.fromMillis(ms);
    if (legacy && typeof legacy.seconds === "number") return new Timestamp(legacy.seconds, legacy.nanoseconds || 0);
    return null;
}

/** Validates one backup entry against what firestore.rules accepts. Returns {id, data} or null (skip). */
function normalizeBackupEntry(e) {
    if (!e || typeof e !== "object") return null;
    if (typeof e.datetime !== "string" || !DATETIME_RE.test(e.datetime)) return null;
    if (!Array.isArray(e.sections) || e.sections.length < 1 || e.sections.length > MAX_SECTIONS) return null;
    const sections = [];
    for (const sec of e.sections) {
        if (!sec || typeof sec.title !== "string" || typeof sec.content !== "string") return null;
        if (sec.title.length > MAX_TITLE || sec.content.length > MAX_CONTENT) return null;
        sections.push({ title: sec.title, content: sec.content });
    }
    const id = typeof e.id === "string" && SAFE_ID_RE.test(e.id) ? e.id : doc(collection(db, COLLECTION)).id;
    return {
        id,
        data: {
            userId: currentUser.uid,
            datetime: e.datetime,
            sections,
            createdAt: restoreTimestamp(e.createdAtMs, e.createdAt) || serverTimestamp(),
            updatedAt: restoreTimestamp(e.updatedAtMs, e.updatedAt) || serverTimestamp(),
        },
    };
}

importJsonInput.addEventListener("change", async () => {
    const file = importJsonInput.files?.[0];
    importJsonInput.value = "";
    if (!file || !currentUser) return;
    let restored = 0, total = 0;
    try {
        const parsed = JSON.parse(await file.text());
        if (parsed?.app !== "munan-diary" || !Array.isArray(parsed.entries)) throw new Error("invalid backup");
        if (parsed.entries.some((e) => e && e.userId && e.userId !== currentUser.uid)) {
            showToast("This backup belongs to a different account — nothing restored.", true);
            return;
        }
        // Validate everything BEFORE writing anything.
        const valid = [];
        let skipped = 0;
        parsed.entries.forEach((e) => { const n = normalizeBackupEntry(e); n ? valid.push(n) : skipped++; });
        if (!valid.length) { showToast("No valid entries found in that backup.", true); return; }

        const msg = `Restore ${valid.length} diary ${valid.length === 1 ? "entry" : "entries"}` +
            `${skipped ? ` (${skipped} invalid skipped)` : ""}? Entries with the same ID will be replaced.`;
        if (!window.confirm(msg)) return;

        total = valid.length;
        for (let i = 0; i < valid.length; i += 400) {           // Firestore batch limit is 500
            const chunk = valid.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((n) => batch.set(doc(db, COLLECTION, n.id), n.data));
            await withTimeout(batch.commit(), 30000);
            restored += chunk.length;
        }
        showToast(`Restored ${restored} ${restored === 1 ? "entry" : "entries"}${skipped ? `, skipped ${skipped} invalid` : ""}.`);
        await loadHistory(true);
    } catch (err) {
        console.error("Diary JSON restore failed:", err);
        showToast(
            restored
                ? `Restore stopped after ${restored} of ${total} entries — ${buildErrorMessage(err, "Restore")}`
                : "Could not restore that JSON backup.",
            true
        );
        if (restored) await loadHistory(true);
    }
});
