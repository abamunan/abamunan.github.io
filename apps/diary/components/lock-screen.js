// Full-screen lock overlay. Resolves when the right PIN is entered. While it is up, CSS (body.diary-locked) hides
// everything else, including sheets and dialogs, and the app has already emptied #main.
import { h } from '../../shared/dom.js';
import { confirmDialog } from '../../shared/confirm.js';
import { pinPad } from './pin-pad.js';

export function showLock(app) {
  return new Promise(resolve => {
    const root = h('div', { class: 'dl', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Diary locked' });
    const pad = pinPad({ title: 'Diary is locked', subtitle: 'Enter your PIN', onSubmit: async pin => {
      const r = await app.lock.verify(pin);
      if (r.ok) { root.remove(); document.body.classList.remove('diary-locked'); resolve(); }
      else pad.reset(r.wait ? `Too many tries. Wait ${r.wait} seconds.` : 'Wrong PIN. Try again.');
    } });
    const forgot = h('button', { class: 'ui-btn ui-btn--ghost dl-forgot', type: 'button', onclick: async () => {
      const ok = await confirmDialog({ title: 'Forgot your PIN?', danger: true, typeToConfirm: 'CLEAR', confirmLabel: 'Clear this device',
        message: 'The only way in is to clear the diary stored on this device. Entries already in the cloud stay there, and you can sign in again to get them back.' });
      if (ok) app.wipeDevice();
    } }, 'Forgot PIN?');
    root.append(pad.el, forgot);
    document.body.append(root);
    document.body.classList.add('diary-locked');
    pad.focus();
  });
}
