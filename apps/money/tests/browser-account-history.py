# Browser test for Accounts > Transaction history (H4): Add money, transfers and open loans appear, so the history explains the balance.
# Run from the repo root:  python3 -m http.server 8123 &   then   python3 apps/money/tests/browser-account-history.py
# Clock fixed to 2026-10-08. External network is blocked on purpose.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
seed = {
    "mt_2026_10_7": {"lunch": 200, "acct_lunch": "cash", "ts_lunch": 1},
    "mt_accounts_v1": [{"id": "cash", "label": "Cash", "icon": "\U0001F4B5", "opening": 100}, {"id": "bkash", "label": "bKash", "icon": "\U0001F4F1", "opening": 0}],
    "mt_ledger_v1": [{"id": "l1", "type": "add", "accountId": "cash", "amount": 1000, "ts": "2026-10-07T05:00:00.000Z"},
                     {"id": "l2", "type": "transfer", "fromId": "cash", "toId": "bkash", "amount": 300, "ts": "2026-10-07T06:00:00.000Z"}],
    "mt_debts_v1": [{"id": "d1", "type": "lent", "person": "Rafi", "amount": 60, "date": "2026-10-06", "accountId": "cash", "settled": False, "note": ""},
                    {"id": "d2", "type": "lent", "person": "Settled", "amount": 999, "date": "2026-10-05", "accountId": "cash", "settled": True, "note": ""}],
}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 900})
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#accounts"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    hist = lambda: pg.inner_text(".account-history")
    # Cash: opening 100, +1000 added, -300 transferred, -60 lent, -200 lunch  => 540
    ok("540" in pg.inner_text(".account-summary"), "Cash balance is 540")
    t = hist(); ok("Money added" in t and "Transfer to bKash" in t and "Lent to Rafi" in t and "Lunch" in t, "history lists Add money, the transfer, the open loan and the lunch entry")
    ok("Settled" not in t, "a settled loan is not listed (it no longer affects the balance)")
    s = pg.inner_text(".account-summary")
    ok("1,000" in s and "560" in s, "Money in = 1,000 and Money out = 560 (300 + 60 + 200)")
    ok("Opening balance" in s and "100" in s, "opening balance is shown, so opening + in - out = balance is visible")
    ok("5 transactions" not in s and "4" in s, "Transactions counts every row (4)")
    ok(pg.locator(".account-history .erow--static").count() == 3 and pg.locator(".account-history button.erow").count() == 1, "moves are read-only rows; the day entry is still a tappable row")
    pg.screenshot(path="test-output/account-history-cash.png", full_page=True)
    pg.select_option(".account-picker", "bkash"); pg.wait_for_timeout(300)
    ok("Transfer from Cash" in hist(), "bKash history shows the incoming transfer")
    ok(not errs, "no page or console errors: " + "; ".join(errs))
    b.close()
print("all passed" if not fails else f"{len(fails)} failed"); raise SystemExit(1 if fails else 0)
