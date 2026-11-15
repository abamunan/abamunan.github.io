# Browser test for Plan > Debts & loans: add, mark repaid, delete (real Chromium via Playwright). Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-debts.py
# Guards against ReferenceErrors in views/plan.js (acctOptions, confirmDialog). Clock fixed to 2026-10-08. External network is blocked on purpose.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
seed = {"mt_2026_10_7": {"lunch": 400, "acct_lunch": "cash", "ts_lunch": 1}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740})
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#plan"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    def click(name): pg.get_by_role("button", name=name, exact=True).first.click()
    # add
    click("Add debt or loan"); pg.wait_for_selector(".ui-sheet", timeout=3000)
    ok(pg.locator(".ui-sheet").count() == 1, "Add debt or loan opens the form (acctOptions defined)")
    pg.locator('.ui-sheet [aria-label="Person"]').fill("Rafi"); pg.locator('.ui-sheet [aria-label="Amount (৳)"]').fill("300")
    pg.locator(".ui-sheet .add-save").click(); pg.wait_for_selector(".ui-sheet", state="detached", timeout=3000)
    d = ls("mt_debts_v1") or []
    ok(len(d) == 1 and d[0]["person"] == "Rafi" and d[0]["amount"] == 300 and d[0]["type"] == "borrowed" and d[0]["settled"] is False and d[0].get("accountId"), "debt saved with an account attached")
    # mark repaid
    click("Mark repaid"); ok(ls("mt_debts_v1")[0]["settled"] is True, "debt can be marked repaid")
    # delete: cancel first, then confirm
    pg.get_by_role("button", name="Delete", exact=True).last.click(); pg.wait_for_selector(".ui-confirm", timeout=3000)
    ok(pg.locator(".ui-confirm").count() == 1, "Delete opens a confirm dialog (confirmDialog imported)")
    pg.get_by_role("button", name="Cancel").click(); pg.wait_for_timeout(300)
    ok(len(ls("mt_debts_v1")) == 1, "Cancel keeps the debt")
    pg.get_by_role("button", name="Delete", exact=True).last.click(); pg.wait_for_selector(".ui-confirm", timeout=3000)
    pg.locator(".ui-confirm .ui-btn--danger").click(); pg.wait_for_timeout(300)
    ok(ls("mt_debts_v1") == [], "confirming Delete removes the debt")
    ok(not errs, "no page or console errors: " + "; ".join(errs))
    b.close()
print("all passed" if not fails else f"{len(fails)} failed"); raise SystemExit(1 if fails else 0)
