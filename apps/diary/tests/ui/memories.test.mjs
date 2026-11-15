// Memories tab: starred days only, full text, organised by year, read-only, reader with prev/next.
import { launch } from './lib.mjs';
const e = (id, dt, title, content, extra = {}) => ({ id, datetime: dt, sections: [{ title, content }], mood: extra.mood ?? null, tags: extra.tags || [], pinned: false, starred: extra.starred !== false, createdAtMs: 1, updatedAtMs: 1, syncedMs: 1 });
const LONG = 'Line one of a long memory. '.repeat(40);
const seeds = [
  e('m1', '2024-05-01T08:00:00', 'First day', 'We started something new.', { mood: 5, tags: ['start'] }),
  e('m2', '2025-05-01T09:00:00', 'One year later', LONG, { tags: ['trip', 'family'] }),
  e('m2b', '2025-05-01T20:00:00', 'Evening', 'Same day, second entry.'),
  e('m3', '2025-06-10T10:00:00', '', 'Quiet Tuesday with the rain.'),
  e('n1', '2025-07-01T10:00:00', 'Not starred', 'This one must not appear in Memories.', { starred: false })];
const T = await launch({ seed: w => seeds.forEach(s => w.localStorage.setItem('diary2_e_' + s.id, JSON.stringify(s))) });
const { w, ok, wait, $, $$, fire } = T;
await wait(400);
w.location.hash = '#memories'; await wait(200);

ok(/Memories/.test($('.mm-hero h2').textContent), 'Memories tab renders');
ok(/3 starred days · 2 years · 2024–2025/.test($('.mm-sub').textContent), 'hero stats: ' + $('.mm-sub').textContent);
ok($$('.mm-card').length === 3, 'one card per starred DAY (m2+m2b share a day): ' + $$('.mm-card').length);
ok(!/must not appear/.test($('#main').textContent), 'unstarred entries are not shown');
ok($$('.mm-year h3').map(x => x.textContent).join() === '2025,2024', 'organised by year, newest first');
const two = $$('.mm-card').find(c => /One year later/.test(c.textContent));
ok(two && /Evening/.test(two.textContent) && /Same day, second entry/.test(two.textContent), 'a day with two starred entries shows both');
ok(/#trip/.test(two.textContent) && /min read/.test(two.textContent), 'card shows tags and read time');
ok(/😄/.test($$('.mm-card').find(c => /First day/.test(c.textContent)).textContent), 'card shows the mood');
ok(!!$('.mm-feature q') && $('.mm-feature q').textContent.length > 10, 'featured memory quote shown');

// view only: nothing here edits or deletes
const labels = $$('#main button').map(b => b.textContent.trim());
ok(!labels.some(l => /^(Edit|Delete|Unstar|Pin|Save|Remove)/i.test(l)), 'view only: no edit/delete controls (buttons: ' + labels.join(' | ') + ')');

// year filter + sort
ok($$('.mm-years .dt-chip').length === 3, 'year chips: All + 2 years');
$$('.mm-years .dt-chip').find(b => b.textContent === '2024').click(); await wait(30);
ok($$('.mm-card').length === 1 && /First day/.test($('.mm-card').textContent), 'year filter works');
$$('.mm-years .dt-chip')[0].click(); await wait(30);
const sort = $$('.mm-hero-actions .ui-btn')[0]; ok(/Newest first/.test(sort.textContent), 'sort label'); sort.click(); await wait(30);
ok(/Oldest first/.test(sort.textContent) && $$('.mm-year h3')[0].textContent === '2024', 'oldest first flips the order');
sort.click(); await wait(30);

// reader: full text, prev/next, keys
$$('.mm-card')[1].click(); await wait(60);
ok(!!$('.mm-reader'), 'reader opens');
ok(($('.mm-reader').textContent.match(/Line one of a long memory\./g) || []).length === 40, 'reader shows the FULL text (card was clamped)');
ok(/1 \/ 3|2 \/ 3/.test($('.mm-r-count').textContent), 'position counter: ' + $('.mm-r-count').textContent);
const nextBtn = $$('.mm-r-nav .ui-btn')[1], prevBtn = $$('.mm-r-nav .ui-btn')[0];
const before = $('.mm-r-day').textContent; nextBtn.click(); await wait(30);
ok($('.mm-r-day').textContent !== before, 'Next moves to another memory');
$('.ui-sheet').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await wait(30);
ok($('.mm-r-day').textContent === before, 'ArrowLeft goes back');
while (!prevBtn.disabled) { prevBtn.click(); await wait(5); }
ok(prevBtn.disabled && /^1 \/ 3/.test($('.mm-r-count').textContent), 'Previous disabled on the first memory');
$('.ui-sheet .ui-icon-btn').click(); await wait(30);
ok(!$('.mm-reader'), 'reader closes');

// shuffle changes/keeps a valid feature; Read opens reader
$('.mm-feature .ui-btn--ghost').click(); await wait(20);
$('.mm-feature .ui-btn--primary').click(); await wait(40);
ok(!!$('.mm-reader'), 'Read on the featured memory opens the reader'); $('.ui-sheet .ui-icon-btn').click(); await wait(30);

// star / unstar from the Timeline sheet flows into Memories
w.location.hash = '#timeline'; await wait(150);
ok($$('.dt-star').length === 4, 'Timeline rows show the star on starred entries (' + $$('.dt-star').length + ')');
const row = $$('.dt-row').find(r => /Not starred/.test(r.textContent)); row.click(); await wait(40);
[...$$('.ui-sheet .ui-btn')].find(b => /Star this day/.test(b.textContent)).click(); await wait(100);
w.location.hash = '#memories'; await wait(150);
ok($$('.mm-card').length === 4 && /Not starred/.test($('#main').textContent), 'starring an entry adds that day to Memories');
w.location.hash = '#timeline'; await wait(150);
for (const t of ['Not starred', 'First day', 'One year later', 'Evening', 'Quiet Tuesday']) {
  const r = $$('.dt-row').find(x => x.textContent.includes(t)); if (!r) continue; r.click(); await wait(40);
  const b = [...$$('.ui-sheet .ui-btn')].find(x => /Unstar/.test(x.textContent)); if (b) { b.click(); await wait(80); } else $('.ui-sheet .ui-icon-btn').click();
}
w.location.hash = '#memories'; await wait(150);
ok(!!$('.mm-empty') && /Star this day/.test($('.mm-empty').textContent), 'no starred days: friendly empty state explains how');
$('.mm-empty .ui-btn--primary').click(); await wait(150);
ok(!!$('.dy-editor'), 'empty state button opens the editor');
// star from the editor
const ta = $('.dy-sec-text'); ta.value = 'Writing something worth remembering'; fire(ta, 'input');
$('.dy-star').click(); ok($('.dy-star').getAttribute('aria-pressed') === 'true' && /Starred/.test($('.dy-star').textContent), 'editor star toggles on');
await wait(700);
const saved = (await T.idbAll()).find(x => /worth remembering/.test(x.sections[0].content)); ok(saved && saved.starred === true, 'starred saved with the entry');
w.location.hash = '#memories'; await wait(200);
ok($$('.mm-card').length === 1 && /worth remembering/.test($('.mm-card').textContent), 'a day starred in the editor shows up in Memories');
w.location.hash = '#calendar'; await wait(150);
ok(!!$('.dc-star'), 'Calendar marks starred days with a star');
T.done();
