# Browser smoke test (real Chromium via Playwright). Needs: pip install playwright && playwright install chromium
# Run from the repo root:  python3 -m http.server 8124 &   then   python3 apps/health/tests/browser-smoke.py
# External network is blocked on purpose, so it exercises the offline path. Screenshots go to ./test-output/
import json, datetime, os
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
today = datetime.date(2026, 10, 11)
def key(d): return f"ht_{d.year}_{d.month}_{d.day}"
old = today - datetime.timedelta(days=5)
seed = {key(old): {"weight": 70, "hr": 60, "mood": "good", "legacyfield": 5, "note_weight": "legacy note"}}
errs = []; fails = []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
def doc(pg, d): return json.loads(pg.evaluate(f"localStorage.getItem('{key(d)}')") or "null")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True)
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8124") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 11, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.goto("http://localhost:8124/apps/health/index.html"); pg.wait_for_selector("#splash", state="detached", timeout=8000)
    ok(pg.locator("main#main").count() == 1, "main landmark present")
    ok(pg.locator("#tabbar button").count() == 5, "5 tabs")
    ok(pg.inner_text("#syncState") == "Offline", "offline status shown: " + pg.inner_text("#syncState"))
    ok(pg.locator(".hrow").count() == 7, "7 pinned metric rows visible by default (weight, bp, hr, sleep, water, steps, mood): got %d" % pg.locator(".hrow").count())
    pg.screenshot(path="test-output/h1-today.png")
    # numbers autosave
    pg.fill('input[aria-label="Weight"]', "72.5"); ok("Saving" in pg.inner_text(".hsave"), "shows Saving… right after typing"); pg.wait_for_timeout(1100)
    d1 = doc(pg, today); ok(d1 and d1["weight"] == 72.5, "weight autosaved to the legacy key: " + str(d1 and d1.get("weight")))
    ok(pg.inner_text(".hsave") == "Saved", "shows Saved")
    ok("1 of 7" in pg.inner_text(".hscore"), "score counts logged pinned metrics: " + pg.inner_text(".hscore").replace("\n", " "))
    pg.fill('input[aria-label="Blood Pressure systolic"]', "120"); pg.fill('input[aria-label="Blood Pressure diastolic"]', "80"); pg.wait_for_timeout(1000)
    d1 = doc(pg, today); ok(d1["bp_sys"] == 120 and d1["bp_dia"] == 80, "blood pressure saved as bp_sys / bp_dia")
    # mood toggles
    pg.click('.hmood button:has-text("Good")'); pg.wait_for_timeout(900); ok(doc(pg, today)["mood"] == "good", "mood set")
    ok(pg.get_attribute('.hmood button:has-text("Good")', "aria-pressed") == "true", "mood pressed state exposed to screen readers")
    pg.click('.hmood button:has-text("Good")'); pg.wait_for_timeout(900); ok(doc(pg, today)["mood"] == "", "tapping again clears mood")
    # note
    pg.click('button[aria-label="Weight note"]'); pg.fill('input[aria-label="Weight note"]', "after run"); pg.wait_for_timeout(900)
    ok(doc(pg, today).get("note_weight") == "after run", "note saved")
    # add hidden fields for the day
    pg.click("text=Add or remove fields"); pg.wait_for_selector(".ui-sheet"); pg.click('.ui-sheet .chip:has-text("Blood Sugar")'); pg.click('.ui-sheet .chip:has-text("Medications")'); pg.click(".ui-sheet >> text=Done"); pg.wait_for_selector(".ui-sheet", state="detached")
    ok(pg.locator('input[aria-label="Blood Sugar"]').count() == 1, "Blood Sugar shown for the day")
    pg.fill('input[aria-label="Blood Sugar"]', "95"); pg.fill('input[aria-label="New Medications item"]', "Vit D"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    pg.click('button[aria-label="Vit D: not taken"]'); pg.wait_for_timeout(1000)
    d1 = doc(pg, today); ok(d1["sugar"] == 95, "sugar saved"); ok(d1["meds_items"] and d1["meds_items"][0]["name"] == "Vit D" and d1["meds_items"][0]["checked"] is True, "checklist item added and ticked")
    ok(d1.get("shown_sugar") is None and d1.get("shown_meds") is None, "fields with data are not flagged shown_ (data itself keeps them visible)")
    pg.screenshot(path="test-output/h2-filled.png")
    # reload: persisted + extra fields come back
    pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=8000)
    ok(pg.input_value('input[aria-label="Weight"]') == "72.5" and pg.input_value('input[aria-label="Blood Sugar"]') == "95", "values and the day's extra fields restored after reload")
    # history
    pg.click('#tabbar button[data-tab="history"]'); pg.wait_for_selector(".hday")
    ok(pg.locator(".hday").count() == 2 and "72.5" in pg.inner_text(".hday >> nth=0"), "History lists today (newest first) and the seeded legacy day: " + pg.inner_text(".hday >> nth=0").replace("\n", " "))
    ok("2 / 31" in pg.inner_text(".card--row"), "month summary counts logged days")
    pg.screenshot(path="test-output/h3-history.png")
    pg.click(".hday >> nth=0"); pg.wait_for_selector(".dform"); ok(pg.input_value('input[aria-label="Weight"]') == "72.5", "tapping a history row opens that day in Today")
    # locked day (5 days old, seeded by the LEGACY app format)
    for _ in range(5): pg.click('button[aria-label="Previous day"]')
    pg.wait_for_selector(".hlock"); ok(pg.input_value('input[aria-label="Weight"]') == "70", "legacy day loads (weight 70)")
    ok(pg.is_disabled('input[aria-label="Weight"]'), "inputs disabled on a locked day"); ok(pg.locator("text=Lock this day").count() == 0, "no Lock button on an already locked day")
    pg.screenshot(path="test-output/h4-locked.png")
    pg.click("text=Unlock to edit"); pg.fill('input[aria-label="Weight"]', "71"); pg.wait_for_timeout(1000)
    d2 = doc(pg, old); ok(d2["weight"] == 71, "edit saved after Unlock to edit"); ok(d2.get("legacyfield") == 5, "a field no metric owns is preserved (legacy would drop it)")
    ok(d2.get("locked") is None, "unlocking for one edit does not rewrite the stored lock flag"); ok(d2.get("note_weight") == "legacy note" and d2.get("hr") == 60 and d2.get("mood") == "good", "other legacy values untouched")
    pg.click('#tabbar button[data-tab="history"]'); pg.wait_for_selector(".hday"); ok(pg.locator(".hday .lockico").count() == 1, "locked day marked in History")
    pg.click('.hday:has-text("6 Oct")'); pg.wait_for_selector(".hlock"); ok(pg.locator(".hlock").count() == 1, "day is locked again on the next visit")
    # manual lock today
    pg.click("text=Back to today"); pg.wait_for_selector(".dform"); pg.click("text=Lock this day"); pg.wait_for_selector(".hlock")
    d1 = doc(pg, today); ok(d1.get("locked") is True and d1["weight"] == 72.5, "manual lock stores locked:true and keeps the data"); ok(pg.is_disabled('input[aria-label="Weight"]'), "today disabled after manual lock")
    # search
    pg.click('#tabbar button[data-tab="history"]'); pg.click(".seg__btn:has-text('Search')"); pg.fill('input[type=search]', "weight"); pg.wait_for_timeout(400)
    ok(pg.locator(".sres .mrow").count() == 2, "search finds weight on both days: %d" % pg.locator(".sres .mrow").count())
    pg.fill('input[type=search]', "after run"); pg.wait_for_timeout(400); ok(pg.locator(".sres .mrow").count() == 1, "search matches notes")
    pg.screenshot(path="test-output/h5-search.png")
    # backup
    pg.click('#tabbar button[data-tab="more"]')
    with pg.expect_download() as dl: pg.click("text=Download backup")
    path = dl.value.path(); bk = json.load(open(path)); ok(bk["version"] == 1 and key(today) in bk["days"] and key(old) in bk["days"] and "metrics" in bk, "backup file has the legacy format and both days")
    ok(dl.value.suggested_filename.startswith("health-tracker-backup-"), "backup file name: " + dl.value.suggested_filename)
    pg.screenshot(path="test-output/h6-more.png")
    # dark mode + keyboard-less layout sanity: no horizontal scroll at 320px
    pg.set_viewport_size({"width": 320, "height": 640}); pg.click('#tabbar button[data-tab="today"]'); pg.wait_for_selector(".dform")
    ok(pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal scroll at 320px")
    ok(not errs, "no console/page errors: " + "; ".join(errs[:3]))
    b.close()
print("\n%d failure(s)" % len(fails)); raise SystemExit(1 if fails else 0)
