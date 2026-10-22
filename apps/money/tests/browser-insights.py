# Browser test for the Insights tab (real Chromium via Playwright). Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-insights.py
# The clock is fixed to 2026-10-08 so "so far" numbers and the forecast are deterministic. External network is blocked on purpose.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
def day(**kw): return {k: v for k, v in kw.items()}
seed = {
  "mt_2026_9_5":  {"lunch": 1000, "acct_lunch": "cash", "ts_lunch": 1},
  "mt_2026_9_20": {"lunch": 500, "acct_lunch": "cash", "ts_lunch": 1, "self": 20000, "acct_self": "bkash", "ts_self": 1},
  "mt_2026_10_1": {"lunch": 300, "acct_lunch": "cash", "ts_lunch": 1},
  "mt_2026_10_3": {"lunch": 200, "note_lunch": "tea", "acct_lunch": "cash", "ts_lunch": 1, "transport": 100, "acct_transport": "cash", "ts_transport": 1},
  "mt_2026_10_6": {"dinner": 700, "acct_dinner": "cash", "ts_dinner": 1, "self": 5000, "acct_self": "bkash", "ts_self": 1},
}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740})
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#insights"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    txt = lambda: pg.inner_text("main")
    ok("October 2026" in txt(), "opens on the current month")
    for h in ["Spending by day", "Where it went", "Last 6 months", "Biggest expenses"]:
        ok(pg.get_by_role("heading", name=h).count() == 1, f"section '{h}' renders")
    t = txt()
    ok("5,000" in t and "1,300" in t and "3,700" in t, "income 5,000, expense 1,300, net 3,700")
    ok("You kept 74% of your income." in t, "savings rate 74%")
    ok("down" in t and "200" in t and "vs Sep" in t, "spending is down ৳200 vs September (worded, not colour only)")
    ok("5 of 8 days with no spending" in t, "no-spend days counted over the 8 elapsed days (spent on days 1, 3, 6)")
    ok("ends near" in t, "month-end pace shown for the current month")
    ok(pg.locator("main svg[role=img]").count() == 2, "two charts, each with an accessible label")
    pg.screenshot(path="test-output/insights-0.png", full_page=True)
    # drill-down
    pg.get_by_role("button", name="Lunch: ", exact=False).click(); pg.wait_for_selector(".ui-sheet")
    s = pg.inner_text(".ui-sheet")
    ok("500" in s and "2 entries on 2 days" in s and "tea" in s, "drill-down shows the lunch total, entry count and the note")
    pg.screenshot(path="test-output/insights-1-drill.png"); pg.keyboard.press("Escape"); pg.wait_for_selector(".ui-sheet", state="detached")
    # month navigation
    pg.get_by_role("button", name="Previous month").click()
    ok("September 2026" in txt() and "1,500" in txt() and "20,000" in txt(), "September: expense 1,500, income 20,000")
    ok("ends near" not in txt(), "no pace forecast for a finished month")
    pg.get_by_role("button", name="Previous month").click()
    ok("No income or expense recorded in August 2026" in txt(), "empty month shows a friendly message, no broken charts")
    pg.get_by_role("button", name="Next month").click(); pg.get_by_role("button", name="Next month").click()
    ok("October 2026" in txt(), "next month returns to October")
    # adding an entry updates the numbers
    pg.get_by_label("Add entry").click(); pg.wait_for_selector(".ui-sheet"); pg.locator(".ui-sheet .add-amount").fill("90"); pg.locator(".ui-sheet .add-save").click(); pg.wait_for_selector(".ui-sheet", state="detached", timeout=3000)
    ok("1,390" in txt() or "1390" in txt(), "a new expense shows up in Insights straight away")
    ok(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal overflow at 360px")
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.screenshot(path="test-output/insights-2-dark.png", full_page=True)
    b.close()
bad = [e for e in errs if "firebase" not in e.lower() and "gstatic" not in e.lower()]
ok(not bad, "no page errors: " + "; ".join(bad[:3]))
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
