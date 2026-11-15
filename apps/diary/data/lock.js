// App lock: a PIN that hides the diary when the app is closed/idle. It is a SCREEN lock, not encryption:
// entries on the device are not encrypted. The PIN is stored only as a salted PBKDF2 hash.
const KEY = 'diary2_lock';
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const PIN_RE = /^\d{4,8}$/;
export const AUTO_LOCK = [[0, 'Immediately'], [60000, 'After 1 minute'], [300000, 'After 5 minutes'], [900000, 'After 15 minutes']];

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export function createLock(storage, { now = () => Date.now(), iterations = 150000 } = {}) {
  const read = () => { try { return JSON.parse(storage.getItem(KEY)); } catch { return null; } };
  const write = s => storage.setItem(KEY, JSON.stringify(s));
  return {
    isEnabled: () => !!read()?.hash,
    timeoutMs: () => read()?.timeoutMs ?? 60000,
    validPin: pin => PIN_RE.test(String(pin)),
    async enable(pin, timeoutMs = 60000) {
      if (!PIN_RE.test(String(pin))) throw new Error('PIN must be 4 to 8 digits.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      write({ salt: b64(salt), hash: await derive(pin, salt, iterations), iter: iterations, timeoutMs, fails: 0, until: 0 });
    },
    setTimeoutMs(ms) { const s = read(); if (s) write({ ...s, timeoutMs: ms }); },
    /** -> { ok:true } | { ok:false, wait:seconds|0 }. After 5 wrong PINs the wait doubles from 30 s (max 15 min). */
    async verify(pin) {
      const s = read(); if (!s || !s.hash) return { ok: true };
      if (now() < s.until) return { ok: false, wait: Math.ceil((s.until - now()) / 1000) };
      const h = await derive(String(pin), unb64(s.salt), s.iter);
      if (same(h, s.hash)) { write({ ...s, fails: 0, until: 0 }); return { ok: true }; }
      const fails = (s.fails || 0) + 1;
      const waitMs = fails >= 5 ? Math.min(30000 * 2 ** (fails - 5), 900000) : 0;
      write({ ...s, fails, until: waitMs ? now() + waitMs : 0 });
      return { ok: false, wait: Math.ceil(waitMs / 1000) };
    },
    async disable(pin) { const r = await this.verify(pin); if (r.ok) storage.removeItem(KEY); return r; },
    remove() { storage.removeItem(KEY); }
  };
}
