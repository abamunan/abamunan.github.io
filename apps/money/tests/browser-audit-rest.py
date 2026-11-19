# Browser test for audit round 2: H5 (templates in backup), H6 (Replace / Remove all work without a cloud connection),
# H7 (local dates), H8 (Bengali digits), L2 (no Backspace delete, 10 s Undo), L5 (future-date notice), L9 (taka brand mark).
# Real Chromium via Playwright. Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-audit-rest.py
# External network is blocked on purpose, so the app is "local only" (no cloud): exactly the situation H6 is about.
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
URL = "http://localhost:8123/apps/money/index.html"
TMPL = [{"id": "t1", "label": "Rickshaw", "cat": "transport", "amt": 30, "acct": "cash", "note": ""}]
seed = {"mt_2026_10_7": {"lunch": 400, "acct_lunch": "cash", "ts_lunch": 1}, "mt2_templates_v1": TMPL,
        "mt_2026_10_8": {"lunch": 120, "acct_lunch": "cash", "ts_lunch": 5, "note_lunch": "", "entries": [{"id": "e1", "cat": "lunch", "amt": 120, "acct": "cash", "note": "", "ts": 5}]}}
def ctx_for(b, **kw):
    c = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True, **kw)
    c.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    c.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    return c
def watch(pg):
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
def boot(pg, hash_):
    pg.goto(URL + hash_); pg.wait_for_selector("#splash", state="detached", timeout=10000)
with sync_playwright() as p:
    b = p.chromium.launch()
    # ───────── A: Dhaka, 02:00 on 15 Nov (it is still 14 Nov in UTC) ─────────
    c = ctx_for(b, timezone_id="Asia/Dhaka"); pg = c.new_page(); pg.clock.install(time="2026-11-15T02:00:00+06:00"); watch(pg)
    boot(pg, "#plan"); ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    ok(pg.locator(".brand-mark").all_text_contents() == ["\u09F3", "\u09F3"], "L9: both brand marks show the taka sign, not a dollar")
    pg.get_by_role("button", name="Add debt or loan", exact=True).first.click(); pg.wait_for_selector(".ui-sheet", timeout=3000)
    ok(pg.locator('.ui-sheet input[type="date"]').input_value() == "2026-11-15", "H7: a new debt defaults to today's LOCAL date (15 Nov), not the UTC date (14 Nov)")
    pg.locator('.ui-sheet [aria-label="Person"]').fill("Rafi"); pg.locator('.ui-sheet [aria-label="Amount (\u09F3)"]').fill("\u09EB\u09E6\u09E6")
    pg.locator(".ui-sheet .add-save").click(); pg.wait_for_selector(".ui-sheet", state="detached", timeout=3000)
    d = ls("mt_debts_v1") or []
    ok(len(d) == 1 and d[0]["amount"] == 500 and d[0]["date"] == "2026-11-15", "H8: the amount typed in Bengali digits (\u09EB\u09E6\u09E6) is saved as 500, dated 2026-11-15")
    pg.goto(URL + "#more"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    with pg.expect_download() as dl: pg.get_by_role("button", name="Download backup (JSON)").click()
    name = dl.value.suggested_filename; path = dl.value.path(); data = json.load(open(path, encoding="utf-8"))
    ok(name == "money-tracker-backup-2026-11-15.json", "H7: the backup file is named after the local day (got %s)" % name)
    ok([t["label"] for t in data.get("templates", [])] == ["Rickshaw"], "H5: the Quick template is inside the JSON backup")
    c.close()
    # the file we will re-import in C: this device's backup minus the 7 Oct day, plus a new 9 Oct day
    data["days"].pop("mt_2026_10_7", None); data["days"]["mt_2026_10_9"] = {"lunch": 10, "acct_lunch": "cash", "ts_lunch": 1}
    payload = json.dumps(data).encode("utf-8")
    # ───────── B: ordinary day (8 Oct 2026, 12:00) ─────────
    c = ctx_for(b); pg = c.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0)); watch(pg)
    boot(pg, "#today"); rows = lambda: pg.locator(".erow").count()
    ok(rows() == 1, "B starts with one entry on Today")
    pg.locator(".erow").first.focus(); pg.keyboard.press("Backspace"); pg.wait_for_timeout(300)
    ok(rows() == 1 and pg.locator(".ui-toast").count() == 0, "L2: Backspace on a focused entry does NOT delete it")
    pg.keyboard.press("Delete"); pg.wait_for_selector(".ui-toast", timeout=3000)
    ok(rows() == 0 and "Entry deleted" in pg.inner_text(".ui-toast"), "L2: the Delete key still deletes (with the Undo toast)")
    pg.clock.fast_forward(7000); ok(pg.locator(".ui-toast").count() == 1, "L2: the Undo toast is still there after 7 s (it used to vanish after 6 s)")
    pg.clock.fast_forward(4000); ok(pg.locator(".ui-toast").count() == 0, "L2: ...and is gone after 10 s")
    # L5: future date
    pg.locator("#fab").click(); pg.wait_for_selector(".ui-sheet", timeout=3000); pg.locator(".add-more summary").click()
    pg.locator('.ui-sheet [aria-label="Date"]').fill("2026-12-01"); pg.wait_for_timeout(200)
    ok("future date" in pg.locator(".add-sum").inner_text(), "L5: a future date is called out in the sheet (\"%s\")" % pg.locator(".add-sum").inner_text())
    pg.locator('.ui-sheet [aria-label="5"]').click(); pg.locator(".ui-sheet .add-save").click(); pg.wait_for_selector(".ui-toast", timeout=3000)
    ok("future date" in pg.inner_text(".ui-toast"), "L5: ...and again in the toast after saving")
    c.close()
    # ───────── C: no cloud (not signed in): Replace import and Remove all must still work (H6) ─────────
    c = ctx_for(b); pg = c.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0)); watch(pg)
    boot(pg, "#more"); ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    keys = lambda: pg.evaluate("Object.keys(localStorage).filter(k => /^mt_\\d{4}_\\d+_\\d+$/.test(k)).sort()")
    import re; ok(re.search("Offline|Local only", pg.evaluate("document.body.textContent")) is not None, "C: the app really has no cloud connection (label says Offline / Local only)")
    with pg.expect_file_chooser() as fc: pg.get_by_role("button", name="Import backup \u2014 replace everything").click()
    fc.value.set_files({"name": "backup.json", "mimeType": "application/json", "buffer": payload})
    pg.wait_for_selector(".ui-confirm", timeout=4000); msg = pg.inner_text(".ui-confirm")
    ok("Replace all data?" in msg and "NOT changed" in msg, "H6: Replace opens its confirmation and says the cloud copy is not changed (before: a 'Sign in first' toast and nothing else)")
    pg.locator(".ui-confirm input").fill("REPLACE"); pg.get_by_role("button", name="Replace", exact=True).click()
    pg.wait_for_selector(".ui-confirm", timeout=4000); pg.get_by_role("button", name="File saved", exact=False).click(); pg.wait_for_timeout(500)
    ok(keys() == ["mt_2026_10_8", "mt_2026_10_9"], "H6: Replace worked offline: the file's days are there and the 7 Oct day that is not in the file is gone (got %s)" % keys())
    ok([t["id"] for t in ls("mt2_templates_v1") or []] == ["t1"], "H5: the template came back with the replace")
    pg.goto(URL + "#more"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    pg.get_by_role("button", name="Remove all data").click(); pg.wait_for_selector(".ui-confirm", timeout=3000); msg = pg.inner_text(".ui-confirm")
    ok("this device" in msg and "NOT changed" in msg and "and the cloud" not in msg, "H6: Remove all is honest that only this device is cleared")
    pg.locator(".ui-confirm input").fill("DELETE"); pg.get_by_role("button", name="Delete everything").click()
    pg.wait_for_selector(".ui-confirm", timeout=4000); pg.get_by_role("button", name="File saved", exact=False).click(); pg.wait_for_timeout(500)
    ok(keys() == [], "H6: Remove all worked offline: no day documents left")
    c.close()
    ok(not errs, "no page or console errors: " + "; ".join(errs))
    b.close()
print("all passed" if not fails else f"{len(fails)} failed"); raise SystemExit(1 if fails else 0)
