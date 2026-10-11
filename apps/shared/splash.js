// Splash with a REAL progress bar: the app calls step() after each actual load step.
// Markup lives in the page (first paint, no JS needed): .ui-splash > .ui-splash__bar / __label.
export function initSplash(el, { total = 4, failsafe = 15000 } = {}) {
  if (!el) return { step() {}, finish() {} };
  const bar = el.querySelector('.ui-splash__bar'), label = el.querySelector('.ui-splash__label');
  let n = 0, done = false;
  const set = p => { if (bar) bar.style.transform = `scaleX(${p})`; el.setAttribute('aria-valuenow', Math.round(p * 100)); };
  const finish = () => {
    if (done) return; done = true; set(1);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.classList.add('is-hiding'); el.removeAttribute('aria-busy');
    document.documentElement.classList.remove('ui-splash-lock');
    setTimeout(() => el.remove(), reduce ? 0 : 350);
  };
  const timer = setTimeout(finish, failsafe);       // never trap the user
  return { step(text) { n++; set(Math.min(1, n / total)); if (label && text) label.textContent = text; }, finish() { clearTimeout(timer); finish(); } };
}
