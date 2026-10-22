# Browser test for the PWA layer: manifest, service worker (register/activate/precache), offline
# shell loading, and the "Install app" row in More. Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-pwa.py
import os
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
URL = "http://localhost:8123/apps/money/index.html"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, service_workers="allow")
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    def noisy(m): return m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text   # Google Fonts / Firebase are blocked on purpose by the route() above
    ctx.add_init_script("sessionStorage.setItem('__loads', String((Number(sessionStorage.getItem('__loads')) || 0) + 1))")   # counts page loads, to catch a surprise reload
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if noisy(m) else None)
    pg.goto(URL); pg.wait_for_selector("#splash", state="detached", timeout=10000)

    # manifest: reachable, points at the new app (not the legacy moneytracker.html one), own icons
    link_href = pg.locator('link[rel="manifest"]').get_attribute("href")
    ok(link_href == "/apps/money/manifest.json", "index.html links its own manifest, not the legacy one")
    man = pg.evaluate("async () => (await fetch('/apps/money/manifest.json')).json()")
    ok(man["start_url"] == "/apps/money/index.html" and man["scope"] == "/apps/money/", "manifest start_url/scope point at /apps/money/")
    ok(all("maskable" in (i.get("purpose") or "") for i in man["icons"]) and len(man["icons"]) >= 2, "icons are maskable, at least 192 + 512")
    for i in man["icons"]:
        st = pg.evaluate("async u => (await fetch(u)).status", i["src"]); ok(st == 200, "icon reachable: " + i["src"])

    # service worker: registers with the narrow scope, reaches "active"
    reg = pg.evaluate("async () => { const r = await navigator.serviceWorker.ready; return {scope: r.scope, state: r.active && r.active.state}; }")
    ok(reg["scope"].endswith("/apps/money/"), "registered scope is /apps/money/ only, not site-wide: " + reg["scope"])
    ok(reg["state"] == "activated", "service worker reached the activated state")
    pg.wait_for_timeout(1500); ok(pg.evaluate("sessionStorage.getItem('__loads')") == "1", "first visit does NOT reload the page when the service worker takes control (loads: %s)" % pg.evaluate("sessionStorage.getItem('__loads')"))

    # the app shell actually landed in Cache Storage (not just claimed to)
    cached = pg.evaluate("""async () => {
      const name = (await caches.keys()).find(n => n.startsWith('money-shell-'));
      if (!name) return null;
      const reqs = await (await caches.open(name)).keys();
      return reqs.map(r => new URL(r.url).pathname);
    }""")
    ok(cached is not None and "/apps/money/index.html" in cached and "/site.css" in cached and "/apps/shared/dom.js" in cached, "app shell precached (" + str(len(cached) if cached else 0) + " files)")
    ok("/apps/shared/firestore.js" not in (cached or []), "firestore.js deliberately left out of the precache")

    # offline: a brand new page still opens fully, served from the service worker's cache
    ctx.set_offline(True)
    pg2 = ctx.new_page()
    pg2.on("pageerror", lambda e: errs.append("offline pageerror: " + str(e)))
    pg2.on("console", lambda m: errs.append("offline console." + m.type + ": " + m.text) if noisy(m) else None)
    pg2.goto(URL); pg2.wait_for_selector("#splash", state="detached", timeout=10000)
    ok(pg2.locator("#tabbar button").count() == 5 and pg2.get_attribute("#tabbar [data-tab=today]", "aria-current") == "page", "app opens fully offline (app shell served from cache)")
    pg2.close(); ctx.set_offline(False)

    # install prompt: headless Chromium won't fire beforeinstallprompt on its own, so simulate the browser's event
    def fire_prompt():
        pg.evaluate("""() => {
          const ev = new Event('beforeinstallprompt', {cancelable: true});
          ev.prompt = () => { window.__installPromptCalled = true; };
          ev.userChoice = Promise.resolve({outcome: 'accepted'});
          window.dispatchEvent(ev);
        }""")
    pg.evaluate("window.__installPromptCalled = false")
    fire_prompt()
    pg.goto(URL + "#more")   # same-document hash change only (confirmed safe: browser-calc.py relies on the same pattern) — app.installPrompt survives
    row = pg.get_by_role("button", name="Install app")
    ok(row.is_visible(), "Install app row appears in More once the browser offers the prompt")
    row.click(); pg.wait_for_timeout(50)
    ok(pg.evaluate("window.__installPromptCalled") is True, "tapping the row calls the native prompt()")
    ok(not pg.get_by_role("button", name="Install app").is_visible(), "row hides again once that one-shot prompt has been used")

    # appinstalled also clears it (covers installing via the browser's own UI, not this row)
    fire_prompt(); pg.wait_for_timeout(50)
    ok(pg.get_by_role("button", name="Install app").is_visible(), "row re-appears for a fresh prompt")
    pg.evaluate("window.dispatchEvent(new Event('appinstalled'))")
    ok(not pg.get_by_role("button", name="Install app").is_visible(), "row disappears once appinstalled fires")

    ok(not errs, "no console errors: " + "; ".join(errs[:5]))
    pg.screenshot(path="test-output/pwa-0.png")
    b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
