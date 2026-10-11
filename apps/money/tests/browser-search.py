# Browser test for History > Search (real Chromium via Playwright). Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-search.py
# Clock fixed to 2026-10-08. External network is blocked on purpose.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
seed = {
  "mt_2026_9_5":  {"lunch": 1000, "note_lunch": "Biryani", "acct_lunch": "cash", "ts_lunch": 1},
  "mt_2026_9_20": {"lunch": 500, "note_lunch": "rice", "acct_lunch": "cash", "ts_lunch": 1, "self": 20000, "acct_self": "bkash", "ts_self": 1},
  "mt_2026_10_3": {"lunch": 200, "note_lunch": "Tea with Rafi", "acct_lunch": "cash", "ts_lunch": 1, "transport": 100, "acct_transport": "cash", "ts_transport": 1},
  "mt_2026_10_8": {"lunch": 120, "note_lunch": "Chicken roll", "acct_lunch": "cash", "ts_lunch": 1},
}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True)
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#history"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    txt = lambda: pg.inner_text("main")
    box = lambda: pg.get_by_label("Search entries")
    def type_q(v): box().fill(v); pg.wait_for_timeout(350)
    pg.get_by_role("button", name="Search", exact=True).click()
    ok(box().count() == 1 and "Type a word" in txt(), "Search mode shows the box and a hint, not the whole history")
    type_q("chicken"); ok("Chicken roll" in txt() and "1 entry" in txt(), "note search finds the entry")
    type_q("rice"); ok("1 entry" in txt() and "20 Sep" in txt() and "2026" in txt(), "'rice' finds the September entry with its date")
    type_q("lunch"); ok("4 entries" in txt() and "all shown" in txt(), "category word 'lunch' finds all 4 lunches across months")
    type_q("lunch sep"); ok("2 entries" in txt(), "two words are ANDed (lunch + Sep = 2)")
    type_q("500"); ok("1 entry" in txt() and "500" in txt(), "an amount finds that exact amount")
    type_q("zzzz"); ok("Nothing found" in txt(), "no match shows a friendly message")
    type_q("lunch"); pg.get_by_role("button", name="Income", exact=True).click(); ok(box().input_value() == "lunch" and "Nothing found" in txt(), "type filter keeps the query (income + lunch = nothing)")
    pg.get_by_role("button", name="All", exact=True).click(); ok("4 entries" in txt(), "back to All restores results")
    pg.screenshot(path="test-output/search-0.png", full_page=True)
    # editing from results (Oct 8 is unlocked)
    type_q("chicken"); pg.get_by_role("button", name="Lunch, expense", exact=False).first.click(); pg.wait_for_selector(".ui-sheet")
    pg.locator(".ui-sheet .add-amount").fill("150"); pg.locator(".ui-sheet .add-save").click()
    pg.wait_for_selector(".ui-confirm", timeout=3000); ok("Safety backup" in pg.inner_text(".ui-confirm"), "first edit of an old-app day asks for the safety backup (existing protection)"); pg.get_by_role("button", name="File saved", exact=False).click(); pg.wait_for_selector(".ui-sheet", state="detached", timeout=3000)
    ok(box().input_value() == "chicken" and "150" in txt(), "edit from a result saves; search text is kept and the list refreshes with the new amount")
    d = json.loads(pg.evaluate("localStorage.getItem('mt_2026_10_8')")); ok(d.get("lunch") == 150, "stored day total updated to 150")
    # delete from results with Delete key + undo
    pg.get_by_role("button", name="Lunch, expense", exact=False).first.focus(); pg.keyboard.press("Delete"); pg.wait_for_timeout(400)
    ok("Nothing found" in txt(), "Delete key removes the entry and the results update")
    pg.get_by_role("button", name="Undo").click(); pg.wait_for_timeout(400); ok("Chicken roll" in txt(), "Undo brings it back into the results")
    # leaving and returning keeps the search state
    pg.get_by_role("button", name="Month", exact=True).click(); ok("October 2026" in txt(), "Month mode still works")
    pg.get_by_role("button", name="Search", exact=True).click(); ok(box().input_value() == "chicken", "returning to Search keeps the last query")
    ok(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal overflow at 360px")
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.screenshot(path="test-output/search-1-dark.png", full_page=True)
    b.close()
bad = [e for e in errs if "firebase" not in e.lower() and "gstatic" not in e.lower()]
ok(not bad, "no page errors: " + "; ".join(bad[:3]))
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
