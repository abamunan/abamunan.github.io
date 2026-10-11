# Browser test for the Health Tracker PWA layer: manifest, service worker (register / activate / precache), offline loading
# (including that the page is really STYLED offline), and the "Install app" row in More. Run from the repo root:
#   python3 -m http.server 8124 &    then    python3 apps/health/tests/browser-pwa.py
import os
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
BASE = "http://localhost:8124"; URL = BASE + "/apps/health/index.html"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 360, "height": 740}, service_workers="allow")
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
    def noisy(m): return m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text   # Google Fonts / Firebase are blocked on purpose above
    ctx.add_init_script("sessionStorage.setItem('__loads', String((Number(sessionStorage.getItem('__loads')) || 0) + 1))")   # counts page loads, to catch a surprise reload
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if noisy(m) else None)
    pg.goto(URL); pg.wait_for_selector("#splash", state="detached", timeout=10000)

    ok(pg.locator('link[rel="manifest"]').get_attribute("href") == "/apps/health/manifest.json", "index.html links its own manifest")
    ok(pg.locator('link[rel="apple-touch-icon"]').get_attribute("href") == "/apps/health/icon-touch.png", "iOS home-screen icon is linked")
    man = pg.evaluate("async () => (await fetch('/apps/health/manifest.json')).json()")
    ok(man["start_url"] == "/apps/health/index.html" and man["scope"] == "/apps/health/", "manifest start_url/scope point at /apps/health/")
    ok(all("maskable" in (i.get("purpose") or "") for i in man["icons"]) and len(man["icons"]) >= 2, "icons are maskable, 192 + 512")
    for i in man["icons"] + [{"src": "/apps/health/icon-touch.png"}]:
        info = pg.evaluate("async u => { const r = await fetch(u); const bm = await createImageBitmap(await r.blob()); return [r.status, bm.width]; }", i["src"])
        ok(info[0] == 200 and info[1] > 100, "icon loads as a real image (%s px): %s" % (info[1], i["src"]))

    reg = pg.evaluate("async () => { const r = await navigator.serviceWorker.ready; return {scope: r.scope, state: r.active && r.active.state}; }")
    ok(reg["scope"].endswith("/apps/health/"), "registered scope is /apps/health/ only: " + reg["scope"]); ok(reg["state"] == "activated", "service worker reached the activated state")
    ok(pg.evaluate("navigator.serviceWorker.getRegistrations().then(rs => rs.every(r => r.scope.endsWith('/apps/health/')))"), "no site-wide registration was made")
    pg.wait_for_timeout(1500); ok(pg.evaluate("sessionStorage.getItem('__loads')") == "1", "first visit does NOT reload the page when the worker takes control")

    cached = pg.evaluate("""async () => { const name = (await caches.keys()).find(n => n.startsWith('health-shell-')); if (!name) return null;
      return (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname + new URL(r.url).search); }""")
    ok(cached is not None and "/apps/health/index.html" in cached and "/site.css?v=3" in cached and "/apps/health/views/guide.js" in cached and "/apps/health/components/settings-sheet.js" in cached, "app shell precached (%d files), including the exact /site.css?v=3 the page links" % len(cached or []))
    ok("/apps/shared/firestore.js" not in (cached or []), "firestore.js left out of the precache")
    ok(not any(k.startswith("money-shell-") for k in pg.evaluate("caches.keys()")), "no Money Tracker cache was created by this app")

    # offline: a brand new page opens fully AND is styled (ui.css + site.css came from the cache, not just the scripts)
    ctx.set_offline(True)
    pg2 = ctx.new_page(); pg2.on("pageerror", lambda e: errs.append("offline pageerror: " + str(e))); pg2.on("console", lambda m: errs.append("offline console." + m.type + ": " + m.text) if noisy(m) else None)
    pg2.goto(URL + "#guide"); pg2.wait_for_selector("#splash", state="detached", timeout=10000); pg2.wait_for_selector('[data-guide="macros"]', timeout=5000)
    ok(pg2.locator("#tabbar button").count() == 5 and pg2.get_attribute('#tabbar [data-tab=guide]', "aria-current") == "page", "app opens fully offline, straight on the Guide tab")
    ok(pg2.evaluate("getComputedStyle(document.getElementById('tabbar')).position") == "fixed", "offline page is styled: ui.css applied")
    ok(pg2.evaluate("parseFloat(getComputedStyle(document.querySelector('.card')).borderTopLeftRadius) > 0"), "offline page is styled: site.css tokens + app.css applied")
    pg2.click('#tabbar [data-tab=more]'); pg2.wait_for_selector(".mrow2"); ok(pg2.locator(".mrow2").count() >= 6, "More (settings, restore) renders offline too")
    pg2.close(); ctx.set_offline(False)

    # install prompt (headless Chromium never fires beforeinstallprompt itself, so simulate the browser's event)
    def fire_prompt():
        pg.evaluate("""() => { const ev = new Event('beforeinstallprompt', {cancelable: true});
          ev.prompt = () => { window.__installPromptCalled = true; }; ev.userChoice = Promise.resolve({outcome: 'accepted'}); window.dispatchEvent(ev); }""")
    # the prompt can arrive while someone is typing in Today: it must not redraw the form under them
    pg.goto(URL + "#today"); pg.wait_for_selector(".hrow"); pg.wait_for_timeout(300)
    box = pg.locator('input[aria-label="Weight"]'); box.click(); box.type("7"); fire_prompt(); pg.wait_for_timeout(200)
    ok(pg.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')") == "Weight" and box.input_value() == "7", "an install prompt arriving mid-typing leaves the focused field and its text alone")
    pg.evaluate("window.__installPromptCalled = false")
    pg.goto(URL + "#more")                       # same-document hash change: app.installPrompt survives
    row = pg.get_by_role("button", name="Install app")
    ok(row.is_visible(), "Install app row appears in More once the browser offers the prompt")
    row.click(); pg.wait_for_timeout(80)
    ok(pg.evaluate("window.__installPromptCalled") is True, "tapping the row calls the native prompt()")
    ok(not pg.get_by_role("button", name="Install app").is_visible(), "row hides again once that one-shot prompt has been used")
    fire_prompt(); pg.wait_for_timeout(80); ok(pg.get_by_role("button", name="Install app").is_visible(), "row re-appears for a fresh prompt while More is open")
    pg.evaluate("window.dispatchEvent(new Event('appinstalled'))"); pg.wait_for_timeout(80)
    ok(not pg.get_by_role("button", name="Install app").is_visible(), "row disappears once appinstalled fires")
    ok(not errs, "no console errors: " + "; ".join(errs[:5]))
    pg.screenshot(path="test-output/health-pwa.png"); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
