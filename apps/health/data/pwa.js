// PWA bootstrap for the NEW Health Tracker only: registers sw.js (scope '/apps/health/', so it never affects the old
// healthtracker.html, the Money Tracker or any other page) and tracks the browser's own "install" prompt so
// More -> "Install app" can offer it. Nothing here touches app data.
import { registerSW } from '../../shared/sw-register.js';

export function initPWA(app) {
  if ('serviceWorker' in navigator) registerSW('/apps/health/sw.js', { scope: '/apps/health/' }).catch(() => {});
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                 // stop the browser's own mini-infobar; "Install app" in More offers it instead
    app.installPrompt = e;
    app.installChanged?.();             // only redraws More: redrawing Today could pull the form from under someone typing
  });
  window.addEventListener('appinstalled', () => { app.installPrompt = null; app.installChanged?.(); });
}

// Shows the native install prompt. Resolves once the person has answered (accepted or dismissed).
export async function promptInstall(app) {
  const ev = app.installPrompt; if (!ev) return;
  app.installPrompt = null; app.installChanged?.();   // the prompt can only be used once
  ev.prompt();
  await ev.userChoice.catch(() => {});
}
