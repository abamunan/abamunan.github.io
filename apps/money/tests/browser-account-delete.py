# Browser test for Accounts > Delete account (H2): history moves to the chosen account and the total does not change.
# Real Chromium via Playwright. Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-account-delete.py
# Clock fixed to 2026-10-08. External network is blocked on purpose.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
seed = {"mt_2026_10_7": {"self": 5000, "acct_self": "bkash", "ts_self": 1, "lunch": 200, "acct_lunch": "cash", "ts_lunch": 1}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True)
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#accounts"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    txt = lambda: pg.inner_text("main")
    ok("Total balance" in txt() and "4,800" in txt(), "starts with total 4,800 (bKash 5,000 + Cash -200)")
    pg.get_by_role("button", name="bKash, balance", exact=False).click(); pg.wait_for_selector(".ui-sheet")
    pg.locator(".ui-sheet").get_by_role("button", name="Delete", exact=True).click(); pg.wait_for_selector(".ui-sheet")
    ok("nothing is lost" in pg.inner_text(".ui-sheet").lower(), "Delete asks where the history should go (and says nothing is lost)")
    ok(pg.locator(".ui-sheet .chip").count() == 2 and pg.locator('.ui-sheet .chip[aria-pressed="true"]').inner_text().strip().endswith("Cash"), "choices are the other accounts, Cash pre-selected")
    pg.wait_for_timeout(600); pg.screenshot(path="test-output/account-delete-0.png")
    pg.get_by_role("button", name="Move history & delete account").click()
    pg.wait_for_selector(".ui-confirm", timeout=4000); ok("Safety backup" in pg.inner_text(".ui-confirm"), "a safety backup is requested before anything changes")
    pg.get_by_role("button", name="File saved", exact=False).click(); pg.wait_for_selector(".ui-sheet", state="detached", timeout=4000); pg.wait_for_timeout(300)
    ok(all(a["id"] != "bkash" for a in ls("mt_accounts_v1")), "bKash is gone from the account list")
    d = ls("mt_2026_10_7"); ok("bkash" not in json.dumps(d) and d.get("acct_self") == "cash", "the 5,000 income now belongs to Cash (old-format day document, still in its original format)")
    ok("4,800" in txt() and "-200" not in pg.inner_text(".account-management"), "total is still 4,800 after deleting the account")
    ok(pg.locator(".ui-toast").count() >= 1 and "moved to Cash" in pg.inner_text(".ui-toast"), "toast says how many entries moved and where")
    pg.screenshot(path="test-output/account-delete-1.png", full_page=True)
    pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=10000); ok("4,800" in txt(), "still 4,800 after a reload")
    ok(not errs, "no page or console errors: " + "; ".join(errs))
    b.close()
print("all passed" if not fails else f"{len(fails)} failed"); raise SystemExit(1 if fails else 0)
