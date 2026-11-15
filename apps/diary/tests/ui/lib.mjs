import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { fileURLToPath } from 'url';
export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/, '');
export async function launch({ seed } = {}) {
  const html = fs.readFileSync(ROOT + '/apps/diary/index.html', 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/apps/diary/index.html', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  if (!w.Blob.prototype.text) w.Blob.prototype.text = function () { return new Promise(r => { const f = new w.FileReader(); f.onload = () => r(f.result); f.readAsText(this); }); };
  w.HTMLAnchorElement.prototype.click = function () {};
  for (const k of ['window', 'document', 'localStorage', 'location', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'Event', 'HTMLElement', 'Node', 'URL', 'Blob'])
    Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  const errors = [];
  console.error = (...a) => errors.push(a.map(String).join(' ')); console.warn = () => {};
  await seed?.(w);
  await import(ROOT + '/apps/diary/main.js');
  const t = { pass: 0, fail: 0 };
  const orig = process.stderr.write.bind(process.stderr);
  return {
    w, errors, t,
    ok: (c, m) => { c ? t.pass++ : (t.fail++, orig('FAIL ' + m + '\n')); },
    wait: ms => new Promise(r => setTimeout(r, ms)),
    $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)],
    fire: (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true })),
    idbAll: () => new Promise((res, rej) => { const r = indexedDB.open('diary2', 1); r.onupgradeneeded = () => r.result.createObjectStore('entries', { keyPath: 'id' }); r.onsuccess = () => { const tx = r.result.transaction('entries'); const g = tx.objectStore('entries').getAll(); tx.oncomplete = () => { r.result.close(); res(g.result); }; }; r.onerror = () => rej(r.error); }),
    done() { console.log(`${t.pass} passed, ${t.fail} failed` + (errors.length ? `  (console errors: ${errors.slice(0, 3).join(' | ')})` : '')); process.exit(t.fail || errors.length ? 1 : 0); }
  };
}
