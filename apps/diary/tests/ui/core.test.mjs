// Write, Timeline, Calendar, mood/tags/pin, export — the whole app in jsdom with a fake IndexedDB.
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { fileURLToPath } from 'url';
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/, '');
const html = fs.readFileSync(ROOT + '/apps/diary/index.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/apps/diary/index.html', pretendToBeVisual: true, runScripts: 'outside-only' });
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.scrollTo = () => {};
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
let downloads = 0; w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads++; };
for (const k of ['window', 'document', 'localStorage', 'location', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'Event', 'HTMLElement', 'Node', 'URL', 'Blob']) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
const errors = []; w.addEventListener('error', e => errors.push(e.message));
const origErr = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ')); };
const warn = console.warn; console.warn = () => {};

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, origErr('FAIL', m)); };
const pinBtn = () => $$('.dy-pin').find(b => !b.classList.contains('dy-star'));   // Star and Pin share a style class
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const idbAll = () => new Promise((res, rej) => { const r = indexedDB.open('diary2', 1); r.onupgradeneeded = () => r.result.createObjectStore('entries', { keyPath: 'id' }); r.onsuccess = () => { const t = r.result.transaction('entries'); const g = t.objectStore('entries').getAll(); t.oncomplete = () => { r.result.close(); res(g.result); }; }; r.onerror = () => rej(r.error); });

await import(ROOT + '/apps/diary/main.js');
await wait(300);

// ---- Write ----
ok(!!$('.dy-editor'), 'Write view renders');
ok(/Starts saving/.test($('.dy-status').textContent), 'idle status hint');
const ta = $('.dy-sec-text'); ta.value = 'Hello diary, ভালো দিন'; fire(ta, 'input');
const ti = $('.dy-sec-title'); ti.value = 'Morning'; fire(ti, 'input');
ok($('.dy-status').textContent === 'Typing…', 'status shows Typing…');
await wait(700);
ok((await idbAll()).length === 1, 'entry saved to IndexedDB ~0.4s after typing (' + (await idbAll()).length + ')');
ok(/Saved on this device/.test($('.dy-status').textContent), 'status: saved on device -> ' + $('.dy-status').textContent);
ok(/^Editing/.test($('.dy-h').textContent), 'heading switches to Editing');
// add + remove a section
$$('.dy-actions .ui-btn')[0].click(); await wait(20);
ok($$('.dy-sec').length === 2, 'Add section works');
await wait(3300);
const outbox = JSON.parse(w.localStorage.getItem('diary2_outbox_v1') || '{}');
ok(Object.keys(outbox).length === 1, 'entry queued for the cloud after idle (outbox has ' + Object.keys(outbox).length + ')');

// ---- Done -> blank draft, one entry ----
$('.dy-done').click(); await wait(100);
ok(/New entry/.test($('.dy-h').textContent), 'Done starts a fresh entry');
ok((await idbAll()).length === 1, 'Done did not create an empty entry');
$('.dy-done').click(); await wait(50);
ok((await idbAll()).length === 1, 'Done on empty draft saves nothing');

// ---- Timeline ----
w.location.hash = '#timeline'; await wait(200);
ok($$('.dt-row').length === 1 && /Morning/.test($('.dt-row').textContent), 'Timeline lists the entry with its title');
ok(!!$('.dt-month'), 'month header present');
const si = $('.dt-search'); si.value = 'zzz'; fire(si, 'input');
ok(/No entries match/.test($('.dt-list').textContent), 'search with no hits');
si.value = 'ভালো'; fire(si, 'input');
ok($$('.dt-row').length === 1, 'Bangla search finds it');
si.value = ''; fire(si, 'input');

// ---- entry sheet: delete + undo ----
$('.dt-row').click(); await wait(50);
ok(!!$('.ui-sheet') && /Hello diary/.test($('.ui-sheet').textContent), 'entry sheet shows the text');
[...$$('.ui-sheet .ui-btn')].find(b => /Delete/.test(b.textContent)).click(); await wait(30);
ok(!!$('.ui-confirm'), 'delete asks for confirmation');
$('.ui-confirm .ui-btn--danger').click(); await wait(80);
ok((await idbAll()).length === 0 && !$('.ui-sheet'), 'deleted + sheet closed');
const undo = $('.ui-toast__btn'); ok(!!undo && /Undo/.test(undo.textContent), 'Undo toast offered');
undo.click(); await wait(80);
ok((await idbAll()).length === 1 && $$('.dt-row').length === 1, 'Undo restores the entry in the list');

// ---- edit from sheet ----
$('.dt-row').click(); await wait(30);
[...$$('.ui-sheet .ui-btn')].find(b => /Edit/.test(b.textContent)).click(); await wait(200);
ok(!!$('.dy-editor') && /^Editing/.test($('.dy-h').textContent), 'Edit opens the editor on that entry');
ok($('.dy-sec-text').value.startsWith('Hello diary'), 'editor is filled with the entry text');

// ---- More ----
w.location.hash = '#more'; await wait(200);
ok($$('.dm-card').length >= 4, 'More renders its cards');
const backup = [...$$('.dm-card .ui-btn')].find(b => /backup/i.test(b.textContent));
ok(backup && !backup.disabled, 'Backup enabled when entries exist');
backup.click(); await wait(30);
ok(downloads === 1, 'Backup triggers a download');
ok(/Local only|Offline|sign in/i.test($('#syncState').textContent), 'chip shows local mode offline/signed-out: ' + $('#syncState').textContent);


// ================= Phase 2 =================
w.location.hash = '#today'; await wait(200);
// start a fresh entry with mood + tags + pin
$('.dy-actions .ui-btn:nth-child(2)')?.click?.();
await wait(50);
const ta2 = $('.dy-sec-text'); ta2.value = 'Second entry about cycling'; fire(ta2, 'input');
$$('.dy-mood-btn')[3].click();                                   // Good
ok($$('.dy-mood-btn')[3].getAttribute('aria-pressed') === 'true', 'mood button toggles on');
const tg = $('.dy-tag-input'); tg.value = '#Cycling'; tg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
tg.value = 'lalbag'; tg.dispatchEvent(new w.KeyboardEvent('keydown', { key: ',', bubbles: true }));
ok($$('.dy-tag').length === 2 && /#cycling/.test($('.dy-tags').textContent), 'tags added (normalised): ' + $('.dy-tags').textContent);
pinBtn().click();
ok(pinBtn().getAttribute('aria-pressed') === 'true', 'pin toggles');
await wait(700);
const saved = (await idbAll()).find(e => /Second entry/.test(e.sections[0].content));
ok(saved && saved.mood === 4 && saved.pinned === true && saved.tags.join() === 'cycling,lalbag', 'mood/tags/pinned persisted locally: ' + JSON.stringify(saved && [saved.mood, saved.tags, saved.pinned]));
$('.dy-done').click(); await wait(100);

// timeline: pinned first, tag chips, tag filter
w.location.hash = '#timeline'; await wait(200);
ok($$('.dt-month')[0].textContent === 'Pinned', 'pinned entries come first');
ok($$('.dt-chip').length === 2, 'tag filter chips shown');
ok(/🙂/.test($('.dt-row').textContent) && /#cycling/.test($('.dt-row').textContent), 'row shows mood + tags');
$$('.dt-chip')[0].click(); await wait(20);
ok($$('.dt-row').length === 1, 'tag filter narrows the list');
$$('.dt-chip')[0].click(); await wait(20);
ok($$('.dt-row').length === 2, 'tag filter clears');
const si2 = $('.dt-search'); si2.value = '#lalbag'; fire(si2, 'input'); ok($$('.dt-row').length === 1, 'search by #tag'); si2.value = ''; fire(si2, 'input');

// unpin from the entry sheet
$('.dt-row').click(); await wait(50);
[...$$('.ui-sheet .ui-btn')].find(b => /Unpin/.test(b.textContent)).click(); await wait(80);
ok(!$$('.dt-month').some(m => m.textContent === 'Pinned'), 'Unpin removes the Pinned group');

// calendar
w.location.hash = '#calendar'; await wait(200);
ok(!!$('.dc-grid') && $$('.dc-day').length % 7 === 0, 'calendar grid renders');
ok($$('.dc-day.has').length >= 1 && !!$('.dc-day.is-today'), 'days with entries are marked, today highlighted');
ok(/1/.test($('.dc-stat b').textContent) || Number($('.dc-stat b').textContent) >= 1, 'streak shown: ' + $('.dc-stat b').textContent);
ok($$('.dc-panel, .dm-card .dt-row').length >= 1, 'selected day lists its entries');
const monthBefore = $('.dc-month').textContent;
$('.dc-nav .dy-icon[aria-label="Previous month"]').click(); await wait(20);
ok($('.dc-month').textContent !== monthBefore, 'previous month navigates');
$('.dc-today').click(); await wait(20);
ok($('.dc-month').textContent === monthBefore, 'Today jumps back');
[...$$('.dm-card .ui-btn')].find(b => /Add another entry|Write for this day/.test(b.textContent)).click(); await wait(200);
ok(!!$('.dy-editor') && $('.dy-when input[type=date]').value === new Date().toLocaleDateString('en-CA'), 'Write for this day opens editor on that date');

// export sheet
w.location.hash = '#more'; await wait(200);
[...$$('.dm-card .ui-btn')].find(b => /Export PDF/.test(b.textContent)).click(); await wait(50);
ok(!!$('.dx') && /2 entries selected/.test($('.dx .dm-note').textContent), 'export sheet counts entries: ' + ($('.dx .dm-note') || {}).textContent);
let printed = 0; w.print = () => { printed++; };
[...$$('.dx .ui-btn')].find(b => /Markdown/.test(b.textContent)).click(); await wait(20);
ok(downloads === 2, 'Markdown export downloads a file');
[...$$('.dx .ui-btn')].find(b => /Save as PDF/.test(b.textContent)).click(); await wait(400);
ok(printed === 1, 'PDF export opens the print dialog');
const root = w.document.getElementById('diary-print-root');
ok(root && /Second entry about cycling/.test(root.textContent) && /#cycling/.test(root.textContent) && /Good/.test(root.textContent), 'print root holds entries with mood and tags');
ok(w.document.body.classList.contains('diary-printing'), 'body marked for print CSS');

// ---- no console errors ----
ok(errors.length === 0, 'no console/runtime errors: ' + errors.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
