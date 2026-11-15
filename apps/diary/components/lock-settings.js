import { openSheet } from '../../shared/sheet.js';
import { toast } from '../../shared/toast.js';
import { h } from '../../shared/dom.js';
import { pinPad } from './pin-pad.js';

/** Two-step "choose a PIN" sheet. Resolves true when the lock was turned on. */
export function openSetPin(app) {
  let first = null, sheet;
  const pad = pinPad({ title: 'Choose a PIN', subtitle: '4 to 8 digits', onSubmit: async pin => {
    if (first === null) { first = pin; pad.reset(); pad.setTitle('Repeat your PIN', 'Enter it once more'); return; }
    if (pin !== first) { first = null; pad.reset('The PINs did not match. Start again.'); pad.setTitle('Choose a PIN', '4 to 8 digits'); return; }
    try { await app.lock.enable(pin, app.lock.timeoutMs()); sheet.close(true); toast('App lock is on.'); }
    catch (e) { pad.reset(e.message); first = null; }
  } });
  sheet = openSheet({ title: 'App lock', content: h('div', { class: 'dl-sheet' }, pad.el) });
  pad.focus();
  return sheet.closed.then(v => v === true);
}

/** Asks for the current PIN. Resolves true only when it is correct. */
export function openVerifyPin(app, title = 'Enter your PIN') {
  let sheet;
  const pad = pinPad({ title, subtitle: '', onSubmit: async pin => {
    const r = await app.lock.verify(pin);
    if (r.ok) sheet.close(true);
    else pad.reset(r.wait ? `Too many tries. Wait ${r.wait} seconds.` : 'Wrong PIN.');
  } });
  sheet = openSheet({ title: 'App lock', content: h('div', { class: 'dl-sheet' }, pad.el) });
  pad.focus();
  return sheet.closed.then(v => v === true);
}
