# Browser test for L6: when the cloud sync takes longer than the 6 s start-up wait, the screen is redrawn once it finishes
# (before, the new data only showed after you changed tab). Real Chromium via Playwright; takes ~10 s of real time. From the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-late-sync.py
# apps/shared/firestore.js is replaced by a stub: signed in, and the day list arrives after 8 s with one cloud-only day (8 Oct, lunch 777).
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
STUB = """
export const optionalUser = async () => ({ uid: 'u1' });
export const firestoreRemote = () => ({
  set: async () => {}, del: async () => {}, get: async () => null,
  list: async coll => { await new Promise(r => setTimeout(r, 8000)); return coll === 'moneytracker' ? [{ id: '2026_10_8', data: { lunch: 777, note_lunch: 'Cloud lunch', acct_lunch: 'cash', ts_lunch: 1 } }] : []; }
});
"""
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740})
    def route(r):
        u = r.request.url
        if u.endswith("/apps/shared/firestore.js"): r.fulfill(status=200, content_type="text/javascript", body=STUB)
        elif u.startswith("http://localhost:8123"): r.continue_()
        else: r.abort()
    ctx.route("**/*", route)
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#today"); pg.wait_for_selector("#splash", state="detached", timeout=15000)
    main = lambda: pg.inner_text("main")
    ok("777" not in main(), "after the 6 s wait the cloud day has not arrived yet, so Today does not show it")
    try: pg.wait_for_function("document.querySelector('main').innerText.includes('777')", timeout=9000); late = True
    except Exception: late = False
    ok(late, "the cloud day appears on Today by itself once the slow sync finishes (no tab change, no reload)")
    ok(not errs, "no page or console errors: " + "; ".join(errs))
    b.close()
print("all passed" if not fails else f"{len(fails)} failed"); raise SystemExit(1 if fails else 0)
