/* ================================================================
   diary.js  —  Munan.hub Diary Tool Logic
   Firebase 10.x CDN (ESM) — same project as auth.js / login.html
   ================================================================ */

import { initializeApp, getApps, getApp }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection, doc, setDoc, updateDoc, deleteDoc, getDoc,
    query, where, orderBy, limit, startAfter, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── FIREBASE ─────────────────────────────────────────────────
// App, auth and db come from the shared firebase-config.js.

// ── CONSTANTS ────────────────────────────────────────────────
const MAX_SECTIONS = 10;
const COLLECTION   = "diaryEntries";
const ACCENT_HEX   = "#0A6F48"; // fixed brand color for PDF (theme-independent)

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
let readingEntry  = null;      // entry currently open in the read overlay (null = overlay closed)
let deleteInFlight = false;    // guards double-click / repeated delete submissions
let lastFocusedBeforeOverlay = null; // element to restore focus to when the read overlay closes
let draftSaveTimer = null;     // debounce handle for the local draft autosave

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
const filterBtns      = document.querySelectorAll(".diary-filter-btn");
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
//  AUTH GATE
// ════════════════════════════════════════════════════════════
function renderLoggedOutGate() {
    gateContent.innerHTML = `
        <div class="diary-gate-card">
            <i class="lock-icon fas fa-lock"></i>
            <h2>Login required</h2>
            <p>Your diary is private. Log in to write, view, and export your entries.</p>
            <a href="login.html?redirect=diary.html" class="diary-btn diary-btn-primary">
                <i class="fas fa-right-to-bracket"></i> Go to Login
            </a>
        </div>`;
    gate.style.display = "flex";
    appRoot.style.display = "none";
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
    const placeholderNum = sectionCount() + 1;

    const row = document.createElement("div");
    row.className = "diary-section";
    row.dataset.rowId = rowId;
    row.innerHTML = `
        <div class="diary-section-head">
            <input type="text" class="section-title-input" placeholder="Section ${placeholderNum}" value="${escapeAttr(title)}">
            <button type="button" class="diary-section-remove" aria-label="Remove section" title="Remove section">
                <i class="fas fa-xmark"></i>
            </button>
        </div>
        <textarea class="section-content-input" placeholder="Write here…">${escapeHtml(content)}</textarea>
    `;
    sectionsContainer.appendChild(row);

    row.querySelector(".diary-section-remove").addEventListener("click", () => {
        if (sectionCount() <= 1) return; // guard — can't remove the last one
        row.remove();
        updateAddSectionVisibility();
        updateRemoveButtonsVisibility();
    });

    updateAddSectionVisibility();
    updateRemoveButtonsVisibility();
}

addSectionBtn.addEventListener("click", () => addSectionRow());

function clearSections() {
    sectionsContainer.innerHTML = "";
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
    return { date: entryDateInput.value, time: entryTimeInput.value, sections, savedAt: Date.now() };
}

function draftHasMeaningfulContent(snapshot) {
    return !!snapshot && snapshot.sections.some((s) => (s.title || "").trim() || (s.content || "").trim());
}

/** Debounced — called on every relevant keystroke, but only writes to
 *  localStorage ~800ms after typing stops, so we're not hitting disk on
 *  every character. */
function scheduleDraftSave() {
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

// Structural changes (add/remove a section) also count as meaningful edits,
// even though they don't fire an 'input' event themselves.
addSectionBtn.addEventListener("click", scheduleDraftSave);
sectionsContainer.addEventListener("click", (e) => {
    if (e.target.closest(".diary-section-remove")) scheduleDraftSave();
});

// Warn before leaving the tab/page only when there's real unsaved writing
// in the form — never block navigation away from an empty form.
window.addEventListener("beforeunload", (e) => {
    if (!currentUser) return;
    if (!draftHasMeaningfulContent(collectDraftSnapshot())) return;
    e.preventDefault();
    e.returnValue = "";
});

/** Reads the current Write form into a plain object (no Firestore-specific fields). */
function readFormData() {
    const dateVal = entryDateInput.value;
    const timeVal = entryTimeInput.value || "00:00";
    if (!dateVal) return { error: "Please pick a date for this entry." };

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
        const title = titleInput.value.trim() || titleInput.placeholder; // fall back to "Section N" placeholder
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

    saveEntryBtn.disabled = true;
    // Snapshot isEditing BEFORE any await — editingDocId gets mutated mid-flow
    // for new entries (set to newRef.id after first save), so we can't re-read
    // it safely inside the finally block.
    const wasEditing = !!editingDocId;
    saveBtnLabel.textContent = wasEditing ? "Updating…" : "Saving…";

    try {
        if (wasEditing) {
            const ref = doc(db, COLLECTION, editingDocId);

            // Phase 4 — stale-edit protection. cachedEntries/the form hold a
            // COPY of the doc taken whenever it was loaded, which can go
            // stale if it was edited elsewhere (another tab, another device)
            // in the meantime. Re-fetch the real current state right before
            // writing rather than trusting that copy.
            const latestSnap = await getDoc(ref);
            if (!latestSnap.exists()) {
                showToast("This entry was deleted elsewhere — nothing to update.", true);
                resetFormToNew(); // also resets saveBtnLabel back to "Save Entry"
                lastVisibleDoc = null; hasMoreHistory = true;
                await loadHistory(true);
                return;
            }
            const latestData = latestSnap.data();
            const isStale = editingUpdatedAt && latestData.updatedAt &&
                typeof editingUpdatedAt.isEqual === "function" &&
                !editingUpdatedAt.isEqual(latestData.updatedAt);
            if (isStale) {
                saveBtnLabel.textContent = "Update Entry"; // undo the "Updating…" label — we didn't write
                staleConflictText.textContent =
                    "This entry changed elsewhere since you started editing. Saving now would overwrite that change.";
                staleConflictBanner.classList.add("active");
                staleConflictReloadBtn.onclick = () => {
                    loadEntryIntoForm({ id: editingDocId, ...latestData });
                    staleConflictBanner.classList.remove("active");
                    showToast("Loaded the latest version.");
                };
                return; // do NOT write — wait for the user to reload or edit further
            }

            // Update the SAME document — never creates a duplicate.
            await updateDoc(ref, {
                datetime: data.datetime,
                sections: data.sections,
                updatedAt: serverTimestamp(),
            });
            const freshSnap = await getDoc(ref);
            editingUpdatedAt = freshSnap.exists() ? freshSnap.data().updatedAt : null;
            showToast("Entry updated.");
        } else {
            // doc() with no ID generates a new auto-ID client-side; we grab it
            // immediately so subsequent saves in this session hit the same doc.
            const newRef = doc(collection(db, COLLECTION));
            await setDoc(newRef, {
                userId: currentUser.uid,
                datetime: data.datetime,
                sections: data.sections,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            editingDocId = newRef.id;
            const freshSnap = await getDoc(newRef);
            editingUpdatedAt = freshSnap.exists() ? freshSnap.data().updatedAt : null;
            editingBanner.classList.add("active");
            editingBannerText.textContent = `Editing entry from ${formatDateLabel(data.datetime)} · ${formatTimeLabel(data.datetime)}`;
            saveBtnLabel.textContent = "Update Entry";
            showToast("Entry saved.");
        }
        clearDraft(); // Phase 3 — the local safety-net copy is now redundant
        lastVisibleDoc = null; hasMoreHistory = true;
        await loadHistory(true); // refresh History tab; silent=true so a refresh failure
                                   // (e.g. missing composite index) can't overwrite/mask
                                   // the "Entry saved." toast shown above
    } catch (err) {
        // Full dump so we can see the real shape of the error in DevTools.
        console.error("Diary save failed — raw error object:", err);
        console.error("Diary save failed — code:", err && err.code);
        console.error("Diary save failed — message:", err && err.message);
        console.error("Diary save failed — stringified:", safeStringifyError(err));

        const readableMsg = buildErrorMessage(err, "Save");
        showToast(readableMsg, true);
        // Restore label to pre-attempt state using the snapshot, not the live flag
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
    if (!currentUser || historyLoading) return;
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
        cachedEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lastVisibleDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
        hasMoreHistory = snap.docs.length === historyPageSize; // a full page means there may be more
        renderEntryList(cachedEntries);
        updateLoadMoreVisibility();
    } catch (err) {
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
        historyLoading = false;
    }
}

/** Fetches the next page after the last-loaded entry and appends it —
 *  Firestore cursor pagination via startAfter(), never re-fetching or
 *  duplicating entries already in cachedEntries. */
async function loadMoreHistory() {
    if (!currentUser || historyLoading || !hasMoreHistory || !lastVisibleDoc) return;
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
        const newEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const seen = new Set(cachedEntries.map((e) => e.id));
        cachedEntries = cachedEntries.concat(newEntries.filter((e) => !seen.has(e.id))); // dedupe defensively
        lastVisibleDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : lastVisibleDoc;
        hasMoreHistory = snap.docs.length === historyPageSize;
        renderEntryList(cachedEntries);
        updateLoadMoreVisibility();
    } catch (err) {
        console.error("Diary load-more failed:", err);
        showToast(buildErrorMessage(err, "Loading more entries"), true);
    } finally {
        historyLoading = false;
        loadMoreBtn.disabled = false;
        loadMoreBtn.innerHTML = originalHtml;
    }
}

function updateLoadMoreVisibility() {
    // "flex" (not "inline-flex") so the block-level auto-margins in CSS
    // (`margin: 18px auto 0`) actually center the button.
    loadMoreBtn.style.display = (cachedEntries.length && hasMoreHistory) ? "flex" : "none";
}

loadMoreBtn.addEventListener("click", loadMoreHistory);

function renderEntryList(entries) {
    if (!entries.length) {
        entryListEl.innerHTML = `
            <div class="diary-empty">
                <i class="fas fa-feather"></i>
                <p>No entries yet — your first one is one tab away.</p>
            </div>`;
        downloadPdfBtn.disabled = true;
        return;
    }
    downloadPdfBtn.disabled = false;

    entryListEl.innerHTML = entries.map((entry) => {
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
//  PDF EXPORT (html2pdf.js)
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

/**
 * Builds and downloads a PDF for the given entries. Pure export logic only
 * — callers own their own button/loading state. Always cleans up its
 * temporary off-screen DOM node, even if html2pdf throws.
 */
async function exportEntriesToPdf(entries, filenamePrefix) {
    const printRoot = buildPrintableDocument(entries);

    // Wrapper clips the printable doc from view WITHOUT touching the
    // printable doc's own styles. Earlier failed approaches applied
    // hiding styles directly to printRoot itself (offscreen left,
    // negative z-index, near-zero opacity) — html2canvas renders
    // exactly what it's told to render, so those tricks corrupted the
    // capture instead of just hiding it from the user.
    const hideWrapper = document.createElement("div");
    hideWrapper.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: hidden;";
    // Kept at (0,0) rather than a large negative offset — negative
    // coordinates were the original cause of a totally blank PDF
    // (html2canvas clamps/loses them when computing what to capture).
    // width/height: 0 + overflow:hidden keeps it invisible to the user
    // without moving it off-canvas. This no longer risks squashing
    // printRoot's own width, because printRoot uses an explicit
    // width: 190mm (not a percentage), which CSS defines as
    // independent of the containing block's size — and separately,
    // html2canvas's capture width is now pinned explicitly below from
    // printRoot.scrollWidth, so even page-level scrollWidth quirks
    // can't leak into what gets captured.
    hideWrapper.appendChild(printRoot);
    document.body.appendChild(hideWrapper);

    try {
        // Force layout to flush so scrollWidth below reflects the final
        // rendered size before html2canvas measures anything.
        // eslint-disable-next-line no-unused-expressions
        printRoot.offsetHeight;
        const captureWidthPx = printRoot.scrollWidth;

        await window.html2pdf()
            .set({
                margin:       [12, 10, 12, 10], // mm: top, left, bottom, right — all equal
                filename:     `${filenamePrefix}-${todayDateString()}.pdf`,
                image:        { type: "jpeg", quality: 0.98 },
                html2canvas:  {
                    scale: 2, useCORS: true, backgroundColor: "#ffffff",
                    // Pin BOTH width and windowWidth to printRoot's own
                    // measured pixel width. Without this, html2canvas can
                    // pick up extra invisible width from the page/ancestors
                    // (e.g. the hidden app underneath, or the 1px clipping
                    // wrapper still sitting in the layout tree), so the
                    // captured canvas ends up wider than printRoot actually
                    // is. jsPDF then scales that whole canvas down to fit
                    // pageWidth - margins, which squeezes real content and
                    // clips its true right edge — exactly the symptom seen
                    // (cards cut off at the page edge, not overflowing past
                    // it). Locking both to the same measured value forces
                    // html2canvas to capture exactly printRoot, nothing more.
                    width: captureWidthPx,
                    windowWidth: captureWidthPx,
                },
                jsPDF:        { unit: "mm", format: "a4", orientation: "portrait" },
                pagebreak:    { mode: ["css", "legacy"] },
            })
            .from(printRoot)
            .toPdf()
            .get("pdf")
            .then((pdf) => {
                // Footer page numbers — added after layout so total page count is known
                const totalPages = pdf.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    pdf.setPage(i);
                    pdf.setFontSize(8.5);
                    pdf.setTextColor(120, 130, 145);
                    const pageW = pdf.internal.pageSize.getWidth();
                    const pageH = pdf.internal.pageSize.getHeight();
                    pdf.text(`${i} / ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
                }
            })
            .save();
    } finally {
        // Phase 6 fix: this cleanup previously sat AFTER the try block on
        // the success path only, so a thrown/rejected html2pdf call skipped
        // straight to `catch` and left hideWrapper (with printRoot inside
        // it) permanently attached to <body>. Moving it into `finally`
        // guarantees the temporary node is always removed, success or fail.
        hideWrapper.remove();
    }
}

downloadPdfBtn.addEventListener("click", async () => {
    if (!cachedEntries.length) { showToast("No entries to export yet.", true); return; }

    downloadPdfBtn.disabled = true;
    const originalHtml = downloadPdfBtn.innerHTML;
    downloadPdfBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Building PDF…';

    try {
        await exportEntriesToPdf(cachedEntries, "Munans-Diary-Loaded");
        const n = cachedEntries.length;
        showToast(`PDF downloaded — ${n} loaded ${n === 1 ? "entry" : "entries"}.`);
    } catch (err) {
        console.error("PDF export failed:", err);
        showToast("PDF export failed — please try again.", true);
    } finally {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.innerHTML = originalHtml;
    }
});

exportAllBtn.addEventListener("click", async () => {
    if (!currentUser) return;

    const confirmed = window.confirm(
        "This fetches your ENTIRE diary before building the PDF — it may take a while if you have a large history. Continue?"
    );
    if (!confirmed) return;

    exportAllBtn.disabled = true;
    const originalHtml = exportAllBtn.innerHTML;
    exportAllBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Fetching all entries…';

    try {
        // The one deliberate place this app fetches an unrestricted result
        // set — gated behind an explicit click + confirmation, never
        // triggered implicitly by browsing History or selecting a filter.
        const q = query(
            collection(db, COLLECTION),
            where("userId", "==", currentUser.uid),
            orderBy("datetime", "desc")
        );
        const snap = await getDocs(q);
        const allEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!allEntries.length) { showToast("No entries to export yet.", true); return; }

        exportAllBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Building PDF (${allEntries.length})…`;
        await exportEntriesToPdf(allEntries, "Munans-Diary-All");
        showToast(`PDF downloaded — all ${allEntries.length} entries.`);
    } catch (err) {
        console.error("Export-all failed:", err);
        showToast(buildErrorMessage(err, "Export all"), true);
    } finally {
        exportAllBtn.disabled = false;
        exportAllBtn.innerHTML = originalHtml;
    }
});

/**
 * Builds an off-screen, print-styled DOM tree (light theme, fixed colors —
 * independent of the live page's data-theme) representing every entry in
 * `entries`, for html2pdf.js to rasterize. Returns the root element.
 */
function buildPrintableDocument(entries) {
    const root = document.createElement("div");
    root.style.cssText = `
        width: 190mm;
        box-sizing: border-box;
        background: #ffffff; color: #11221D;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                     'Hind Siliguri', Helvetica, Arial, sans-serif;
        padding: 4mm 0;
        -webkit-font-smoothing: antialiased;
    `;
    // NOTE on width: html2pdf.js always rescales the captured canvas to fit
    // exactly (pageWidth - marginLeft - marginRight) on the PDF page,
    // proportionally — so this mm width does NOT need to be kept in manual
    // sync with the margin values in the click handler. 190mm is simply a
    // comfortable rendering width for crisp, non-blurry text at scale:2.
    // The actual right-edge-cutoff bug was that html2canvas could capture
    // MORE width than this element actually has (picking up invisible
    // ancestor/page width), and then that whole wider canvas got squeezed
    // into the page, clipping real content at the true right edge. Fixed by
    // explicitly pinning html2canvas's width/windowWidth options to this
    // element's own measured scrollWidth in the click handler below, so it
    // can never capture more than printRoot itself.

    // ── HEADER ──────────────────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText = `
        text-align: center; padding-bottom: 16px; margin-bottom: 26px;
        border-bottom: 1px solid #D3DBD0;
    `;
    header.innerHTML = `
        <div style="font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#11221D;">
            Munan's <span style="color:${ACCENT_HEX};font-weight:800;">Diary</span>
        </div>
        <div style="font-size:12px;color:#5B6C64;margin-top:6px;font-weight:500;">
            ${entries.length} ${entries.length === 1 ? "entry" : "entries"} · exported ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
    `;
    root.appendChild(header);

    // ── ENTRY CARDS ─────────────────────────────────────────────
    entries.forEach((entry, idx) => {
        const entryCard = document.createElement("div");
        entryCard.style.cssText = `
            box-sizing: border-box;
            background: #ffffff;
            border: 1px solid #D3DBD0; border-radius: 10px;
            padding: 18px 20px;
            margin-bottom: 16px;
            page-break-inside: avoid; break-inside: avoid;
        `;
        // Cards are capped at one diary entry's worth of sections, which in
        // practice is short enough that "avoid" is safe here — unlike the
        // old borderless flowing layout, each card is a small bounded unit
        // so html2pdf's css pagebreak mode can always find a legal break
        // point (between cards), instead of failing to place an oversized
        // block and rendering blank.

        const dateHeading = document.createElement("div");
        dateHeading.style.cssText = `
            display: flex; align-items: baseline; gap: 9px; margin-bottom: 14px;
            padding-bottom: 10px; border-bottom: 1px solid #EEF1EA;
        `;
        dateHeading.innerHTML = `
            <div style="width:4px;height:16px;background:${ACCENT_HEX};border-radius:2px;flex-shrink:0;"></div>
            <div style="font-size:14px;font-weight:700;color:#11221D;">${escapeHtml(formatDateLabel(entry.datetime))}</div>
            <div style="font-size:12px;font-weight:500;color:#5B6C64;">${escapeHtml(formatTimeLabel(entry.datetime))}</div>
        `;
        entryCard.appendChild(dateHeading);

        (entry.sections || []).forEach((sec, secIdx) => {
            const secEl = document.createElement("div");
            const isLast = secIdx === (entry.sections.length - 1);
            secEl.style.cssText = `margin-bottom: ${isLast ? "0" : "14px"};`;
            secEl.innerHTML = `
                <div style="font-size:11.5px;font-weight:700;color:${ACCENT_HEX};margin-bottom:5px;letter-spacing:0.03em;text-transform:uppercase;">
                    ${escapeHtml(sec.title || "Untitled")}
                </div>
                <div style="font-size:13.5px;line-height:1.6;color:#11221D;white-space:pre-wrap;">
                    ${escapeHtml(sec.content || "")}
                </div>
            `;
            entryCard.appendChild(secEl);
        });

        root.appendChild(entryCard);
    });

    return root;
}
