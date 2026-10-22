# Browser test for Insights + Export (real Chromium via Playwright).
# Run from the repo root:  python3 -m http.server 8124 &   then   python3 apps/health/tests/browser-insights.py
import json, datetime, os, zipfile, io
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
today = datetime.date(2026, 10, 11); start = datetime.date(2026, 9, 1)
moods = ["great", "good", "okay", "low", "bad"]; seed = {}; n = (today - start).days + 1
for i in range(n):
    d = start + datetime.timedelta(days=i)
    seed[f"ht_{d.year}_{d.month}_{d.day}"] = {"weight": round(74 - i * 0.05 + (0.2 if i % 3 == 0 else -0.1), 1), "sleep": 5 + (i % 4), "water": round(1.5 + (i % 5) * 0.4, 1), "steps": 3000 + (i * 217) % 9000,
        "mood": moods[(i + (i % 4)) % 5], "bp_sys": 118 + i % 6, "bp_dia": 76 + i % 4, "meds_items": [{"id": "a", "name": "Vit D", "checked": i % 4 != 0}]}
seed["ht_goals_v1"] = {"weight": 68, "water": 2.5, "sleep": 8}
errs = []; fails = []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True)
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8124") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 11, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.goto("http://localhost:8124/apps/health/index.html#insights"); pg.wait_for_selector("#splash", state="detached", timeout=8000)
    ok(pg.locator("#tabbar button").count() == 5, "5 tabs including Insights and Guide")
    # ---- Overview
    ok(pg.locator(".seg--4 .seg__btn[aria-pressed=true]").inner_text() == "Overview", "opens on Overview")
    txt = pg.inner_text("#main"); ok("Logging streak" in txt and "41" in txt, "streak glance shows the 41-day logging streak (Sep 1 to Oct 11, today included)")
    ok("Best: 41 days" in txt, "best streak shown")
    ok(pg.locator(".tip").count() >= 1, "at least one tip"); ok("Goal progress" in txt and pg.locator(".brow").count() >= 3, "goal rows for weight, water, sleep: %d" % pg.locator(".brow").count())
    ok("This month vs last month" in txt and ("\u25B2" in txt or "\u25BC" in txt), "month comparison with arrows (words + symbols, not colour alone)")
    ok("October 2026" in txt, "month heading")
    pg.click('button[aria-label="Previous month"]'); ok("September 2026" in pg.inner_text("#main"), "month navigation works"); pg.click('button[aria-label="Next month"]')
    pg.screenshot(path="test-output/i1-overview.png")
    # ---- Streaks
    pg.click(".seg__btn:has-text('Streaks')"); pg.wait_for_selector(".hm")
    ok(pg.locator(".hm__c").count() == 31, "heatmap has 31 October cells"); ok(pg.locator(".hm__c.is-on").count() == 11, "11 October days marked logged: %d" % pg.locator(".hm__c.is-on").count())
    ok(pg.locator(".hm__c.is-today").count() == 1 and pg.locator(".hm__c.is-future").count() == 20, "today ringed, 20 future days dimmed")
    ok("Active days" in pg.inner_text("#main") and "30/30" in pg.inner_text("#main"), "active days 30/30 (steps logged every day)")
    ok("Medication" in pg.inner_text("#main") and "%" in pg.inner_text(".stats--4"), "medication adherence shown")
    ok(pg.locator(".brow").count() >= 4, "mood frequency rows: %d" % pg.locator(".brow").count())
    pg.screenshot(path="test-output/i2-streaks.png")
    pg.click('.hm__c[aria-label="October 5: logged"]'); pg.wait_for_selector(".dform"); ok(pg.input_value('input[aria-label="Choose day"]') == "2026-10-05" and pg.input_value('input[aria-label="Weight"]') != "", "tapping a heatmap day opens that exact day in Today: " + pg.input_value('input[aria-label="Choose day"]'))
    # ---- Trends
    pg.click('#tabbar button[data-tab="insights"]'); pg.click(".seg__btn:has-text('Trends')"); pg.wait_for_selector(".chart svg")
    lab = pg.get_attribute(".chart svg", "aria-label"); ok("readings" in lab and "Weight" in lab, "chart has a text alternative: " + lab[:70])
    ok(pg.locator(".chart polyline").count() == 2, "chart draws readings and 7-reading average")
    pg.click(".chip:has-text('Sleep')"); pg.wait_for_selector(".chart svg"); ok("Sleep" in pg.get_attribute(".chart svg", "aria-label"), "metric picker switches the chart")
    ok("Best months" in pg.inner_text("#main"), "best months card"); pg.screenshot(path="test-output/i3-trends.png")
    # ---- Forecast
    pg.click(".seg__btn:has-text('Forecast')"); txt = pg.inner_text("#main")
    ok("kg/week" in txt and "reach your goal around" in txt, "weight forecast with a projected date: " + [l for l in txt.split("\n") if "kg/week" in l][0])
    ok(pg.locator("section.card:has-text('vs')").count() == 3, "three correlation cards"); ok("overlapping days" in txt, "correlations report overlapping days")
    pg.screenshot(path="test-output/i4-forecast.png")
    # ---- Export (More)
    pg.click('#tabbar button[data-tab="more"]')
    with pg.expect_download() as dl: pg.click("text=CSV (all days)")
    raw = open(dl.value.path(), "rb").read().decode("utf-8"); lines = raw.split("\r\n")
    ok(raw.startswith("\ufeffDate,Weight (kg)") and len(lines) == n + 1, "CSV: BOM, header, one row per day (%d lines)" % len(lines)); ok(lines[1].startswith("2026-09-01,"), "CSV rows sorted by date, ISO dates")
    ok(dl.value.suggested_filename == "health-tracker-export-2026-10-11.csv", "CSV name: " + dl.value.suggested_filename)
    pg.click("text=Export report"); pg.wait_for_selector(".ui-sheet")
    with pg.expect_download() as dl2: pg.click(".ui-sheet .add-save")
    z = zipfile.ZipFile(io.BytesIO(open(dl2.value.path(), "rb").read())); names = z.namelist(); sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    ok("xl/workbook.xml" in names and "xl/styles.xml" in names, "xlsx is a real zip workbook"); ok("October 2026" in sheet and "OVERVIEW" in sheet and "Days logged" in sheet and "11 / 31" in sheet, "xlsx has title, overview and the 11 logged days")
    ok(dl2.value.suggested_filename == "HealthTracker_October_2026.xlsx", "xlsx name: " + dl2.value.suggested_filename)
    pg.click("text=Export report"); pg.wait_for_selector(".ui-sheet"); pg.click(".ui-sheet .chip:has-text('PDF (print)')"); pg.click(".ui-sheet .chip:has-text('Whole year')")
    with ctx.expect_page() as popup: pg.click(".ui-sheet .add-save")
    w = popup.value; w.wait_for_load_state(); html = w.content(); ok("Health Tracker" in html and "2026" in html and "Monthly averages" in html and "September" in html, "PDF/print page for the year opens with monthly averages"); w.close()
    pg.wait_for_timeout(300)
    pg.click("text=Export report"); pg.wait_for_selector(".ui-sheet"); pg.click(".ui-sheet .chip:has-text('Day open in Today')"); ok(pg.locator(".ui-sheet .chip:has-text('Excel')").count() == 0, "day report offers print only")
    with ctx.expect_page() as popup2: pg.click(".ui-sheet .add-save")
    w2 = popup2.value; w2.wait_for_load_state(); h2 = w2.content(); ok("Monday, October 5, 2026" in h2 and "kg" in h2, "day page for the day last opened (Oct 5)"); w2.close()
    pg.screenshot(path="test-output/i5-more.png")
    pg.click("text=Export report") if False else None
    # an empty month gives a clear message, no file
    pg.wait_for_timeout(300); pg.click("text=Export report"); pg.wait_for_selector(".ui-sheet"); pg.click(".ui-sheet .chip:has-text('Jan')")
    pg.click(".ui-sheet .add-save"); pg.wait_for_selector(".ui-toast--err"); ok("Nothing saved for January 2026" in pg.inner_text(".ui-toast--err"), "empty month: " + pg.inner_text(".ui-toast--err")); pg.keyboard.press("Escape")
    # layout at 320px on every insights tab
    pg.set_viewport_size({"width": 320, "height": 640})
    for tab in ["Overview", "Streaks", "Trends", "Forecast"]:
        pg.click('#tabbar button[data-tab="insights"]'); pg.click(f".seg__btn:has-text('{tab}')"); pg.wait_for_timeout(150)
        ok(pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"no horizontal scroll at 320px on {tab}")
    ok(not errs, "no console/page errors: " + "; ".join(errs[:3]))
    b.close()
print("\n%d failure(s)" % len(fails)); raise SystemExit(1 if fails else 0)
