export const K = { categories: 'mt_categories_v1', accounts: 'mt_accounts_v1', ledger: 'mt_ledger_v1', debts: 'mt_debts_v1', goal: 'mt_savings_goal_v1' };
export const NEW_KEYS = { outbox: 'mt2_outbox_v1', backupDay: 'mt2_migration_backup_day', lastAccounts: 'mt2_last_accounts_v1', templates: 'mt2_templates_v1', sync: 'mt2_sync_v1', tomb: 'mt2_tombstones_v1', deletedDays: 'mt2_deleted_days_v1', owner: 'mt2_owner_uid_v1', settingsMeta: 'mt2_settings_meta_v1' };  // new, ignored by the old app
export const META = { settings: 'moneytracker_meta/settings', ledger: 'moneytracker_meta/ledger', debts: 'moneytracker_meta/debts', deletedDays: 'moneytracker_meta/deleted_days' };
export const DAY_COLLECTION = 'moneytracker';
export const DAY_RE = /^mt_(\d+)_(\d+)_(\d+)$/;
export const dayLocalKey = (y, m0, d) => `mt_${y}_${m0 + 1}_${d}`;       // month is 1-based in the key (legacy)
export const dayId = (y, m0, d) => `${y}_${m0 + 1}_${d}`;
export const dayPath = (y, m0, d) => `${DAY_COLLECTION}/${dayId(y, m0, d)}`;
export const parseDayKey = k => { const m = DAY_RE.exec(k); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
export const parseDayId = id => parseDayKey('mt_' + id);
// How the cloud adapter merges a whole-document write instead of overwriting it (two devices must never erase each other's ledger events or debts).
// list/deleted: union by id, a deleted id stays deleted. map: union of {id: timestamp}, newest wins.
export const SETTINGS_LISTS = ['expense', 'income', 'accounts', 'templates'];
export const CLOUD_MERGE = { [META.ledger]: { list: 'events', deleted: 'deleted' }, [META.debts]: { list: 'items', deleted: 'deleted' }, [META.deletedDays]: { map: 'days' },
  // settings: every category / source / account / template is merged by id (newest `updatedAt` wins, a removed id is remembered in `deleted` as { 'list:id': time }),
  // the savings goal is a single value stamped with `goalAt`, and the per-device `lastAccounts` map is unioned.
  [META.settings]: { sets: SETTINGS_LISTS, tomb: 'deleted', scalars: { goal: 'goalAt' }, objects: ['lastAccounts'] } };
