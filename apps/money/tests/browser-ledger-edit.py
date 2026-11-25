# Browser test for audit fix E3: an Add money / Transfer row can be changed or deleted from Accounts, and Undo restores it.
# Run from the repo root:  python3 -m http.server 8123 &   then   python3 apps/money/tests/browser-ledger-edit.py
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
    summ = lambda: pg.inner_text(".account-summary")
    ok("540" in summ(), "start: Cash balance is 540")
    pg.locator(".account-history button.erow", has_text="Money added").click(); pg.wait_for_timeout(300)
    ok(pg.get_by_role("button", name="Change amount").count() == 1 and pg.get_by_role("button", name="Delete").count() >= 1, "tapping Money added opens Change amount / Delete")
    pg.get_by_role("button", name="Change amount").click(); pg.wait_for_timeout(300)
    pg.locator("dialog input, .sheet input, [role=dialog] input").first.fill("500"); pg.get_by_role("button", name="Save").click(); pg.wait_for_timeout(400)
    ok("40" in summ() and "540" not in summ(), "after changing 1,000 to 500 the balance is 40")
    pg.locator(".account-history button.erow", has_text="Money added").click(); pg.wait_for_timeout(300)
    pg.locator("button.add-del", has_text="Delete").click(); pg.wait_for_timeout(500)
    pg.locator(".ui-layer button", has_text="Delete").last.click(); pg.wait_for_timeout(500)
    ok("-460" in summ().replace("\u2212", "-") or "460" in summ(), "after deleting it the balance drops to -460")
    ok(pg.locator(".account-history button.erow", has_text="Money added").count() == 0, "the row is gone")
    pg.get_by_role("button", name="Undo").click(); pg.wait_for_timeout(400)
    ok("40" in summ(), "Undo brings it back (balance 40 again)")
    ok(not errs, "no page or console errors: " + "; ".join(errs))
    b.close()
print("all passed" if not fails else f"{len(fails)} failed"); raise SystemExit(1 if fails else 0)
