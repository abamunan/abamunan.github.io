// PWA bootstrap for the NEW Money Tracker only: registers sw.js (scope '/apps/money/', so it
// never affects the old moneytracker.html or any other page) and tracks the browser's own
// "install" prompt so More -> "Install app" can offer it. Nothing here touches app data.
import { registerSW } from '../../shared/sw-register.js';

export function initPWA(app) {
  if ('serviceWorker' in navigator) registerSW('/apps/money/sw.js', { scope: '/apps/money/' }).catch(() => {});
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                 // stop the browser's own mini-infobar; "Install app" in More offers it instead
    app.installPrompt = e;
    app.refresh();
  });
  window.addEventListener('appinstalled', () => { app.installPrompt = null; app.refresh(); });
}

// Shows the native install prompt. Resolves once the person has answered (accepted or dismissed).
export async function promptInstall(app) {
  const ev = app.installPrompt; if (!ev) return;
  app.installPrompt = null; app.refresh();   // the prompt can only be used once
  ev.prompt();
  await ev.userChoice.catch(() => {});
}
