// Phase 3: cold start behind a PIN shows nothing until the PIN is entered.
import { launch } from './lib.mjs';
import { createLock } from '../../data/lock.js';
const secret = { id: 'secret1', datetime: '2025-03-10T08:00:00', sections: [{ title: '', content: 'top secret thoughts' }], createdAtMs: 1, updatedAtMs: 1, syncedMs: 1 };
const T = await launch({ seed: async w => {
  w.localStorage.setItem('diary2_e_secret1', JSON.stringify(secret));
  await createLock(w.localStorage, { iterations: 1000 }).enable('4821', 60000);
} });
const { w, ok, wait, $, $$ } = T;
await wait(400);
ok(!!$('.dl') && w.document.body.classList.contains('diary-locked'), 'cold start: lock overlay is up');
ok($('#main').children.length === 0, 'cold start: nothing rendered in #main');
ok(!/top secret/.test(w.document.body.textContent), 'cold start: entry text is nowhere in the page');
ok(!!$('.dl-forgot'), 'Forgot PIN? is offered');
const press = async s => { for (const d of s) $$('.dl-key').find(k => k.getAttribute('aria-label') === d).click(); $$('.dl-key').find(k => k.getAttribute('aria-label') === 'Confirm').click(); await wait(300); };
await press('1234'); ok(/Wrong PIN/.test($('.dl-msg').textContent) && !!$('.dl'), 'wrong PIN keeps it locked');
// keyboard entry works too
for (const k of '4821') $('.dl-pad').dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
$('.dl-pad').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(300);
ok(!$('.dl') && !!$('.dy-editor'), 'keyboard PIN unlocks and the Write screen appears');
w.location.hash = '#timeline'; await wait(150);
ok(/top secret/.test($('.dt-list').textContent), 'entries are there after unlocking');
T.done();
