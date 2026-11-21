# Money Tracker – audit fixes

Fixes for the logic audit (issue IDs match the audit report). Tests: `node apps/money/tests/run-all.mjs` (18/18 pass; the TypeScript name check needs `npm install`).
New tests: `apps/money/tests/audit-fixes.mjs` (19 groups) and `apps/money/tests/browser-ledger-edit.py`.

| ID | Fix | Main files |
| --- | --- | --- |
| E1 | Outbox handles each write on its own: a permanently refused write is parked in a "failed" list (Retry toast), the rest keep syncing; temporary errors retry with back-off | `shared/store.js`, `main.js` |
| E2 | Ledger, debts and "deleted days" are MERGED with the cloud copy by id (deletions use tombstones) instead of overwritten; the cloud is re-read when the app returns to the foreground; "last used account" is no longer pushed as a settings write | `shared/firestore.js` (`mergeSpecial`), `data/keys.js` (`CLOUD_MERGE`), `data/storage.js`, `main.js` |
| E3 | Add money / Transfer rows can be changed or deleted (with Undo) | `domain/plan.js`, `data/storage.js`, `views/accounts.js`, `domain/viewmodels.js` |
| E4 | Delete/archive can never leave zero active accounts; Delete-account no longer crashes; balances fall back to the first active account | `domain/plan.js`, `domain/totals.js`, `views/accounts.js`, `data/storage.js` |
| H1 | Incremental pull overlaps 15 minutes (slow device clocks); Replace import / Remove all now propagate to other devices through a `deleted_days` record | `data/sync.js`, `data/storage.js` |
| H2 | Storage is written before memory; "Storage is full" error; import and delete-account roll back completely on failure | `shared/store.js`, `data/storage.js` |
| H3 | Archived accounts are never chosen as defaults; debts need an active account | `data/storage.js`, `domain/plan.js`, `views/plan.js` |
| H4 | Savings projection subtracts spending in categories without a budget | `domain/totals.js` |
| H5 | Backup import repairs / drops bad data, rejects newer versions, redirects money of missing accounts | `data/backup.js` |
| H6 | A different signed-in account no longer receives this device's data without confirmation | `main.js` |
| M1 | Debts: edit, dated part payments, date validation | `domain/plan.js`, `views/plan.js` |
| M2 / M3 | Unique account names; template validation, safe ids, templates removed with their category | `domain/plan.js`, `data/storage.js` |
| M4 / M5 | CSV matches reports; text amounts (`"100"`) are read as numbers | `data/export.js`, `domain/reconcile.js` |
| M6 | Service worker: code is network-first (cache when offline / after 4 s) so modules cannot get out of step; cache `v15` | `sw.js` |
| M7 | Parsed days are reused while their stored text is unchanged | `data/storage.js` |
| L1-L7 | `round2` float fix, add-sheet double-save guard and date check, whole-word tag filter, search word rule, long-press asks first, midnight rollover, `Object.hasOwn` | various |
| S1 | Settings (categories, income sources, accounts, templates, savings goal) are merged by id with the cloud copy: every item carries `updatedAt`, the newer copy wins; removed items are remembered in a `deleted` map (`'list:id' -> time`) so a stale device cannot bring them back, and an item saved later (e.g. Restore) wins over an old removal; the goal has its own `goalAt` stamp; the per-device `lastAccounts` map is unioned | `data/keys.js` (`CLOUD_MERGE`), `shared/firestore.js` (`mergeSpecial` `sets` mode), `data/storage.js` |
| L8 | `firestore.rules`: the catch-all `users/{uid}/**` rule is removed; each collection the site uses (money, health, english, typemaster, duzoology, profile) has its own owner-only rule, and Money day / meta documents must have a valid shape (date id, numeric `updatedAt`, `entries` list, size limits). Anything else under `users/{uid}` is now denied | `firestore.rules` |
| M5b | Orphan categories: flat amounts without `ts_/acct_/note_` are also found when the id is known to have been a category (default id, an id removed on this device, an id a template points at, or an app-generated id); metadata (`updatedAt`, `locked`, `...At`, `v`, ...) is never taken for a category | `domain/categories.js`, `data/storage.js` |

## Deploy notes (please read)

* **Firestore rules must be published** (Firebase console -> Firestore -> Rules, or `firebase deploy --only firestore:rules`). They could not be run against the emulator here; they were checked by reading them against every `users/{uid}/...` path found in the code. After publishing, open Money, Health, English tracker, TypeMaster, DU planner and sign-up once and confirm nothing shows a permission error. If a page you did not list uses another collection under `users/{uid}`, add a `match` for it (the block is commented).
* Old copies of the app (cached on a device before this release) still overwrite the settings document as a whole. Open the new version on every device; the service worker is network-first, so this happens on the next online start.
* Merging uses each device's clock (`updatedAt`). Two edits of the SAME item within a clock-skew window: the later clock wins.

## Still open

* `check-names.mjs` (TypeScript) was not run (needs `npm install`); the Node suites and all 14 browser tests were.
* The savings goal and categories saved by an older version have no `updatedAt`; until each is edited once, a tie keeps the device that is writing.
