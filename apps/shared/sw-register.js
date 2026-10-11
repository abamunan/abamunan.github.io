import { toast } from './toast.js';
// registerSW('/sw-money.js', {scope:'/moneytracker.html'}) — shows an update prompt, reloads once when an UPDATED worker takes over.
// A first-ever install also takes over the page (clients.claim) but there is nothing to refresh, so that never reloads.
export async function registerSW(url, { scope, onUpdate } = {}) {
  if (!('serviceWorker' in navigator)) return null;
  let hadController = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController) { hadController = true; return; } if (!reloaded) { reloaded = true; location.reload(); } });
  const reg = await navigator.serviceWorker.register(url, scope ? { scope } : undefined);
  const prompt = worker => (onUpdate || (w => toast('A new version is ready', { action: 'Reload', timeout: 0, onAction: () => w.postMessage({ type: 'SKIP_WAITING' }) })))(worker);
  if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
  });
  return reg;
}
