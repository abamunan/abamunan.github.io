# Browser test for the Plan tab (real Chromium via Playwright). Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-plan.py
# The clock is fixed to 2026-10-08 so budget pace and the goal projection are deterministic. External network is blocked on purpose.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
seed = {"mt_2026_10_7": {"lunch": 400, "acct_lunch": "cash", "ts_lunch": 1, "self": 5000, "acct_self": "bkash", "ts_self": 1}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740})
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#plan"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    def sheet_fill(label, value): pg.locator(f'.ui-sheet [aria-label="{label}"]').fill(value)
    def click(name, exact=True): pg.get_by_role("button", name=name, exact=exact).first.click()
    def submit(): pg.locator(".ui-sheet .add-save").click(); pg.wait_for_selector(".ui-sheet", state="detached", timeout=3000)
    ok(pg.get_by_role("heading", name="Savings goal").count() == 1 and pg.get_by_role("heading", name="Accounts").count() == 1 and pg.get_by_role("heading", name="Debts & loans").count() == 1, "all four Plan sections render")
    pg.screenshot(path="test-output/plan-0-empty.png", full_page=True)
    # budgets
    click("Set budgets"); pg.wait_for_selector(".ui-sheet")
    sheet_fill("🍛 Lunch", "3100"); sheet_fill("🚌 Transportation", "100+20"); submit()
    cats = ls("mt_categories_v1")["expense"]; ok({f["id"]: f["budget"] for f in cats if f["budget"]} == {"lunch": 3100, "transport": 120}, "budgets saved (expression 100+20 → 120)")
    ok("Lunch" in pg.inner_text("main") and "400" in pg.inner_text("main"), "budget row shows spend so far")
    # invalid budget must be rejected, not silently cleared
    click("Edit budgets"); pg.wait_for_selector(".ui-sheet"); sheet_fill("🍛 Lunch", "abc"); pg.locator(".ui-sheet .add-save").click()
    ok(pg.locator(".ui-toast--err").count() == 1 and pg.locator(".ui-sheet").count() == 1, "invalid budget text is rejected and the sheet stays open")
    ok(ls("mt_categories_v1")["expense"][1]["budget"] == 3100, "invalid text did not clear the stored budget"); pg.keyboard.press("Escape"); pg.wait_for_selector(".ui-sheet", state="detached")
    # goal
    click("Set a goal"); pg.wait_for_selector(".ui-sheet"); sheet_fill("Monthly target (৳). 0 removes the goal.", "1500"); submit()
    ok(pg.locator("main").inner_text().count("target") >= 1 and ls("mt_savings_goal_v1") == 1500, "goal saved and progress card shown")
    # account: add, add money, transfer
    click("Add account"); pg.wait_for_selector(".ui-sheet"); sheet_fill("Name", "Bank"); submit()
    ok(len(ls("mt_accounts_v1")) == 4, "account added")
    pg.get_by_role("button", name="Bank, balance", exact=False).click(); pg.wait_for_selector(".ui-sheet"); click("Add money"); pg.wait_for_selector(".ui-sheet")
    sheet_fill("Amount (৳)", "1000"); submit()
    ok(ls("mt_ledger_v1")[0]["type"] == "add" and ls("mt_ledger_v1")[0]["amount"] == 1000, "balance added through the ledger")
    pg.get_by_role("button", name="Bank, balance", exact=False).click(); pg.wait_for_selector(".ui-sheet"); click("Transfer"); pg.wait_for_selector(".ui-sheet")
    sheet_fill("Amount (৳)", "250"); submit()
    lg = ls("mt_ledger_v1"); ok(lg[1]["type"] == "transfer" and lg[1]["fromId"] != lg[1]["toId"] and lg[1]["amount"] == 250, "transfer recorded between two different accounts")
    ok("Total balance" in pg.inner_text("main"), "total balance row present")
    # debts
    click("Add debt or loan"); pg.wait_for_selector(".ui-sheet"); sheet_fill("Person", "Rafi"); sheet_fill("Amount (৳)", "300"); submit()
    d = ls("mt_debts_v1"); ok(len(d) == 1 and d[0]["type"] == "borrowed" and d[0]["person"] == "Rafi" and d[0]["amount"] == 300 and d[0]["settled"] is False, "debt saved with legacy shape")
    click("Mark repaid"); ok(ls("mt_debts_v1")[0]["settled"] is True and ls("mt_debts_v1")[0]["settledDate"] == "2026-10-08", "debt marked repaid with today's (mocked) date")
    pg.screenshot(path="test-output/plan-1-filled.png", full_page=True)
    pg.get_by_role("button", name="Delete", exact=True).last.click(); pg.wait_for_selector(".ui-confirm"); pg.locator(".ui-confirm .ui-btn--danger").click(); pg.wait_for_timeout(300)
    ok(ls("mt_debts_v1") == [], "debt deleted after confirmation")
    # delete account (confirm), keep at least one
    pg.get_by_role("button", name="Bank, balance", exact=False).click(); pg.wait_for_selector(".ui-sheet"); click("Delete"); pg.wait_for_selector(".ui-confirm"); pg.locator(".ui-confirm .ui-btn--danger").click(); pg.wait_for_timeout(300)
    ok(len(ls("mt_accounts_v1")) == 3, "account deleted")
    # reload: everything persisted; today tab uses the new budgets
    pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=10000); ok("3,100" in pg.inner_text("main") or "3100" in pg.inner_text("main"), "budgets survive a reload")
    pg.goto("http://localhost:8123/apps/money/index.html#today"); pg.wait_for_selector("#splash", state="detached", timeout=10000); ok("Budget this month" in pg.inner_text("main") and "No budgets set yet" not in pg.inner_text("main"), "Today tab picks up the budgets")
    # dark theme + narrow viewport: no horizontal overflow
    pg.goto("http://localhost:8123/apps/money/index.html#plan"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    ok(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal overflow at 360px")
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')"); pg.screenshot(path="test-output/plan-2-dark.png", full_page=True)
    b.close()
bad = [e for e in errs if "firebase" not in e.lower() and "gstatic" not in e.lower()]
ok(not bad, "no page errors: " + "; ".join(bad[:3]))
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
