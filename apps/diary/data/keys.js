// Local storage keys + remote paths for the NEW diary. Everything is namespaced `diary2_` so it can
// never collide with the classic diary (diary.html), which only uses `munan-diary-draft:<uid>`.
export const COLLECTION = 'diaryEntries';                 // same Firestore collection as the classic diary
export const K = {
  outbox: 'diary2_outbox_v1',
  owner: 'diary2_owner',                                  // uid whose diary lives on this device
  lastSync: 'diary2_last_sync',
  lock: 'diary2_lock',                                    // PIN hash + auto-lock setting
  backend: 'diary2_backend'                               // 'idb' once entries moved to IndexedDB
};
export const ENTRY_PREFIX = 'diary2_e_';
export const ENTRY_RE = /^diary2_e_[A-Za-z0-9_-]+$/;
export const entryKey = id => ENTRY_PREFIX + id;
export const entryPath = id => `${COLLECTION}/${id}`;     // remote path used by store.js (outbox key)
