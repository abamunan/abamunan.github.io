// Saves bytes/text as a file the browser downloads.
import { h } from './dom.js';
export function saveBlob(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type })), a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
