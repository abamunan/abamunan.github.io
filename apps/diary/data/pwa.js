// PWA bootstrap for the NEW diary only: registers sw.js (scope '/apps/diary/', so the classic diary.html and
// every other page are untouched) and keeps the browser's install prompt for More -> "Install app".
import { registerSW } from '../../shared/sw-register.js';

export function initPWA(app) {
  if ('serviceWorker' in navigator) registerSW('/apps/diary/sw.js', { scope: '/apps/diary/' }).catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); app.installPrompt = e; app.installChanged?.(); });
  window.addEventListener('appinstalled', () => { app.installPrompt = null; app.installChanged?.(); });
}

export async function promptInstall(app) {
  const ev = app.installPrompt; if (!ev) return;
  app.installPrompt = null; app.installChanged?.();
  ev.prompt();
  await ev.userChoice.catch(() => {});
}
