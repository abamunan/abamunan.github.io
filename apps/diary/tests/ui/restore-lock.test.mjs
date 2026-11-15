// Phase 3: legacy migration -> IndexedDB, restore (merge + replace), set PIN, lock/unlock, auto-lock.
import { launch } from './lib.mjs';
const legacy = { id: 'legacy1', datetime: '2025-03-10T08:00:00', sections: [{ title: 'Old', content: 'legacy note' }], createdAtMs: 1000, updatedAtMs: 1000, syncedMs: 1000 };
const T = await launch({ seed: w => w.localStorage.setItem('diary2_e_legacy1', JSON.stringify(legacy)) });
const { w, ok, wait, $, $$, fire, idbAll } = T;
await wait(400);

// ---- migration ----
const rows = await idbAll();
ok(rows.length === 1 && rows[0].id === 'legacy1', 'legacy entry moved into IndexedDB');
ok(!w.localStorage.getItem('diary2_e_legacy1'), 'original localStorage copy removed after verification');
ok(w.localStorage.getItem('diary2_backend') === 'idb', 'backend recorded as idb');
w.location.hash = '#timeline'; await wait(150);
ok($$('.dt-row').length === 1 && /Old/.test($('.dt-row').textContent), 'migrated entry shows in Timeline');

// ---- restore: merge ----
const backup = (entries) => JSON.stringify({ app: 'munan-diary', version: 2, entries });
const mk = (id, content, ms, extra = {}) => ({ id, datetime: '2025-04-0' + (ms % 9 + 1) + 'T09:00:00', sections: [{ title: '', content }], createdAtMs: ms, updatedAtMs: ms, ...extra });
async function pickFile(text) {
  w.location.hash = '#more'; await wait(150);
  const input = $('.dm-card input[type=file]');
  const file = new w.File([text], 'b.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fire(input, 'change'); await wait(120);
}
await pickFile(backup([{ ...legacy, sections: [{ title: 'Old', content: 'edited in backup' }], updatedAtMs: 5000 }, mk('b1', 'brand new', 7, { mood: 5, tags: ['Trip'] })]));
ok(!!$('.dx input[name=rmode]'), 'restore sheet opens');
ok(/1 new/.test($('.dx .dm-note[role=status]').textContent) && /1 newer in the backup/.test($('.dx .dm-note[role=status]').textContent), 'merge summary: ' + $('.dx .dm-note[role=status]').textContent);
$('.dx .dy-actions .ui-btn').click(); await wait(200);
let all = await idbAll();
ok(all.length === 2, 'merge added the new entry (' + all.length + ')');
ok(all.find(e => e.id === 'legacy1').sections[0].content === 'edited in backup', 'merge took the newer backup version');
const b1 = all.find(e => e.id === 'b1'); ok(b1 && b1.mood === 5 && b1.tags.join() === 'trip', 'mood/tags restored');

// ---- restore: replace (typed confirmation) ----
await pickFile(backup([mk('only', 'only in backup', 9)]));
$$('.dx input[name=rmode]')[1].checked = true; fire($$('.dx input[name=rmode]')[1], 'change');
ok(/2 removed/.test($('.dx .dm-note[role=status]').textContent) && /1 new/.test($('.dx .dm-note[role=status]').textContent), 'replace summary: ' + $('.dx .dm-note[role=status]').textContent);
$('.dx .dy-actions .ui-btn').click(); await wait(60);
ok(!!$('.ui-confirm input'), 'replace demands a typed confirmation');
ok($('.ui-confirm .ui-btn--danger').disabled, 'confirm disabled until REPLACE typed');
$('.ui-confirm input').value = 'REPLACE'; fire($('.ui-confirm input'), 'input'); $('.ui-confirm .ui-btn--danger').click(); await wait(250);
all = await idbAll();
ok(all.length === 1 && all[0].id === 'only', 'replace made the diary exactly the backup');
// bad files
await pickFile('not json'); await wait(50);
ok(!$('.dx input[name=rmode]'), 'invalid file does not open the restore sheet');

// ---- app lock ----
w.location.hash = '#more'; await wait(150);
const setBtn = $$('.dm-card .ui-btn').find(b => /Set a PIN/.test(b.textContent)); ok(!!setBtn, 'Set a PIN offered');
setBtn.click(); await wait(50);
const press = async s => { for (const d of s) { $$('.dl-key').find(k => k.getAttribute('aria-label') === d).click(); } $$('.dl-key').find(k => k.getAttribute('aria-label') === 'Confirm').click(); await wait(500); };
await press('4821');
ok(/Repeat/.test($('.dl-title').textContent), 'asks to repeat the PIN');
await press('1111');
ok(/did not match/.test($('.dl-msg').textContent), 'mismatch is caught');
await press('4821'); await press('4821');
ok(!!w.localStorage.getItem('diary2_lock') && !w.localStorage.getItem('diary2_lock').includes('4821'), 'lock saved as a hash');
await wait(100);
ok($$('.dm-card .ui-btn').some(b => /Lock now/.test(b.textContent)), 'More now offers Lock now');
const sel = $('select[aria-label="Auto-lock"]'); sel.value = '0'; fire(sel, 'change');
$$('.dm-card .ui-btn').find(b => /Lock now/.test(b.textContent)).click(); await wait(80);
ok(!!$('.dl') && w.document.body.classList.contains('diary-locked'), 'locked: overlay shown');
ok($('#main').children.length === 0, 'locked: #main is emptied (no entries left in the page)');
await press('0000'); ok(/Wrong PIN/.test($('.dl-msg').textContent) && !!$('.dl'), 'wrong PIN refused');
await press('4821'); await wait(200);
ok(!$('.dl') && !w.document.body.classList.contains('diary-locked') && $('#main').children.length > 0, 'right PIN unlocks and re-renders');
// auto-lock "Immediately" when the tab is hidden
Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
fire(w.document, 'visibilitychange'); await wait(80);
ok(!!$('.dl'), 'Immediately: hiding the app locks it');
Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true });
await press('4821'); await wait(150);
// turn off
w.location.hash = '#more'; await wait(150);
$$('.dm-card .ui-btn').find(b => /Turn off/.test(b.textContent)).click(); await wait(60);
await press('4821'); await wait(250);
ok(!w.localStorage.getItem('diary2_lock'), 'lock turned off after verifying the PIN');
T.done();
