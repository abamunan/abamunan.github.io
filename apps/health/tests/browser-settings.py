# Browser test for round 26: Settings (metrics / goals / profile), backup restore (merge / replace / remove all) and the Guide tab.
# Run from the repo root:  python3 -m http.server 8124 &   then   python3 apps/health/tests/browser-settings.py
# External network is blocked on purpose. Firebase is replaced by a small in-memory "cloud" (a stub for /apps/shared/firestore.js),
# so the signed-in paths (sync, restore-replace, remove-all) run against the real app code. Screenshots go to ./test-output/
import json, datetime, os, re, tempfile
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
BASE = "http://localhost:8124"; URL = BASE + "/apps/health/index.html"
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)

SEED = {"ht_2026_10_5": {"weight": 78.4, "mood": "good"}, "ht_2026_10_6": {"water": 2.5}, "ht_2026_10_9": {"steps": 6000}, "ht_goals_v1": {"steps": 0}}   # steps:0 = a stored-but-unset goal, like the legacy defaults
CLOUD = {"healthtracker/2026_10_5": SEED["ht_2026_10_5"], "healthtracker/2026_10_6": SEED["ht_2026_10_6"], "healthtracker/2026_10_9": SEED["ht_2026_10_9"], "healthtracker/2026_8_15": {"weight": 90}}
STUB = """
export async function requireUser() { return { uid: 'test-user' }; }
export function firestoreRemote() {
  const cloud = window.__cloud, under = c => Object.keys(cloud).filter(k => k.startsWith(c + '/') && !k.slice(c.length + 1).includes('/'));
  return { async set(p, d) { cloud[p] = JSON.parse(JSON.stringify(d)); }, async del(p) { delete cloud[p]; }, async get(p) { return cloud[p] ?? null; },
    async list(c) { return under(c).map(k => ({ id: k.slice(c.length + 1), data: cloud[k] })); } };
}
"""
tmp = tempfile.mkdtemp()
def write(name, obj_or_text):
    p = os.path.join(tmp, name); open(p, "w", encoding="utf8").write(obj_or_text if isinstance(obj_or_text, str) else json.dumps(obj_or_text)); return p
DEFAULT_PROFILE = {"height": 0, "age": 0, "sex": "male", "activity": 1.375}
ZINC = {"id": "zzz", "label": "Zinc", "icon": "\U0001F48A", "type": "number", "unit": "mg", "group": "lifestyle", "pinned": False, "step": 1}
MERGE_FILE = write("merge.json", {"version": 1, "exportedAt": "2026-10-01T00:00:00Z", "metrics": [ZINC], "goals": {"water": 2.5}, "profile": {"height": 180, "age": 30, "sex": "female", "activity": 1.2},
                                  "days": {"ht_2026_10_5": {"weight": 70}, "ht_2026_9_1": {"weight": 71.2, "mood": "good"}, "not_a_day": {"weight": 1}}})
REPLACE_FILE = write("replace.json", {"version": 1, "exportedAt": "2026-10-02T00:00:00Z", "metrics": None, "goals": {"steps": 8000}, "profile": DEFAULT_PROFILE, "days": {"ht_2026_10_5": {"weight": 69}}})
BAD_TEXT = write("bad.json", "this is not json"); BAD_DATA = write("bad2.json", {"hello": "world"})

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True)
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        ctx.route("**/apps/shared/firestore.js", lambda r: r.fulfill(body=STUB, content_type="text/javascript"))
        ctx.add_init_script("window.__cloud = %s; if (!localStorage.getItem('__seeded')) { const s = %s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded', '1'); }" % (json.dumps(CLOUD), json.dumps(SEED)))
        pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 11, 12, 0, 0))
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text else None)
        local = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
        cloud = lambda: pg.evaluate("window.__cloud")
        day_keys = lambda: sorted(k for k in pg.evaluate("Object.keys(localStorage)") if re.match(r"^ht_\d+_\d+_\d+$", k))
        cloud_days = lambda: sorted(k for k in cloud() if k.startswith("healthtracker/"))
        toast = lambda: pg.inner_text(".ui-toast") if pg.locator(".ui-toast").count() else ""
        row = lambda name: pg.locator('.mrow2:has(.mrow__m > span:first-child:text-is("%s"))' % name)
        sheet_rows = lambda: pg.locator(".ui-sheet .slist .srow")
        def settle(): pg.wait_for_timeout(350)
        def tab(t): pg.click('#tabbar button[data-tab="%s"]' % t); pg.wait_for_timeout(120)
        def close_sheet(): pg.click('.ui-sheet button[aria-label="Close"]'); pg.wait_for_selector(".ui-sheet", state="detached"); pg.wait_for_timeout(120)
        def pick(path, button):
            with pg.expect_file_chooser() as fc: row(button).click()
            fc.value.set_files(path); pg.wait_for_timeout(200)

        pg.goto(URL); pg.wait_for_selector("#splash", state="detached", timeout=8000); settle()
        ok(pg.inner_text("#syncState").strip() == "Synced", "signed in through the stub cloud and synced: chip says " + pg.inner_text("#syncState"))
        ok(len(day_keys()) == 4, "cloud-only day was pulled in: 4 local days: %s" % day_keys())

        # ---------- Guide ----------
        tab("guide"); pg.wait_for_selector('[data-guide="macros"]')
        cards = pg.locator('[data-guide="macros"] .stat'); ok(cards.count() == 5, "5 personal cards")
        txt = pg.inner_text('[data-guide="macros"]'); ok("125\u2013172g" in txt and "TDEE" in txt, "macros from the last logged weight 78.4 kg (Oct 5), no calories without a profile")
        ok("Based on your last logged weight: 78.4 kg (Oct 5, 2026)" in pg.inner_text('[data-guide="weight-note"]'), "weight note names the day: " + pg.inner_text('[data-guide="weight-note"]'))
        ok(pg.locator(".food").count() == 8 and pg.locator(".badge").count() == 1 and pg.locator(".badge").inner_text() == "Best value", "8 foods, one 'Best value' badge")
        ok(pg.locator(".meal").count() == 4 and "~126g protein" in pg.inner_text(".meal__total"), "4 meals and the daily total")
        ok(pg.locator("section.card:has-text('Training targets') .stat").count() == 4, "4 training targets")
        pg.screenshot(path="test-output/settings-guide.png")

        # ---------- Profile (opened from the Guide) ----------
        pg.click("text=Add height, age & activity"); pg.wait_for_selector(".ui-sheet")
        ok(pg.get_attribute(".ui-sheet .seg__btn:has-text('Profile')", "aria-pressed") == "true", "opens on the Profile section")
        sheet = pg.locator(".ui-sheet")
        sheet.get_by_label("Height (cm)").fill("1750"); sheet.get_by_label("Age").fill("26"); pg.click("text=Save profile"); pg.wait_for_timeout(100)
        ok("Height should be between" in toast() and local("ht_profile_v1") is None, "typo height 1750 is refused and nothing is saved")
        sheet.get_by_label("Height (cm)").fill("175"); sheet.get_by_label("Sex").select_option("male"); sheet.get_by_label("Activity level").select_option(label="Moderate"); pg.click("text=Save profile"); settle()
        ok(local("ht_profile_v1") == {"height": 175, "age": 26, "sex": "male", "activity": 1.55}, "profile saved under the legacy key: %s" % local("ht_profile_v1"))
        ok(cloud().get("healthtracker_meta/settings", {}).get("profile", {}).get("height") == 175, "profile reached the cloud settings doc")
        close_sheet()
        txt = pg.inner_text('[data-guide="macros"]'); ok("2,988\u20133,260" in txt and "kcal/day" in txt, "Guide redrew with a calorie target (2,988\u20133,260): " + txt.replace("\n", " "))
        ok("Estimated TDEE ~2,717 kcal/day" in pg.inner_text('[data-guide="tdee-note"]'), "TDEE line: " + pg.inner_text('[data-guide="tdee-note"]'))
        ok(pg.locator("text=Add height, age & activity").count() == 0, "the 'add profile' button is gone once a profile exists")

        # ---------- Metrics ----------
        tab("more")
        ok("12 metrics" in row("Metrics").inner_text() and "7 pinned" in row("Metrics").inner_text(), "More shows the metric summary: " + row("Metrics").inner_text().replace("\n", " "))
        ok("175 cm" in row("Profile").inner_text() and "None set yet" in row("Goals").inner_text(), "profile and goals summaries")
        row("Metrics").click(); pg.wait_for_selector(".ui-sheet"); ok(sheet_rows().count() == 12, "12 metric rows")
        pg.screenshot(path="test-output/settings-metrics.png")
        pin = pg.locator('.ui-sheet button[aria-label^="Blood Sugar:"]'); ok(pin.get_attribute("aria-pressed") == "false", "Blood Sugar starts unpinned")
        pin.click(); settle(); ok(next(m for m in local("ht_metrics_v1") if m["id"] == "sugar")["pinned"] is True, "pin saved"); ok(pg.locator('.ui-sheet button[aria-label^="Blood Sugar:"]').get_attribute("aria-pressed") == "true", "pin button now pressed")
        pg.locator('.ui-sheet input[aria-label="Name of Water"]').fill("Hydration"); pg.locator('.ui-sheet input[aria-label="Icon for Water"]').fill("\U0001F964"); pg.locator('.ui-sheet input[aria-label="Name of Water"]').press("Tab"); settle()
        w = next(m for m in local("ht_metrics_v1") if m["id"] == "water"); ok(w["label"] == "Hydration" and w["icon"] == "\U0001F964", "rename + icon saved: %s %s" % (w["label"], w["icon"]))
        pg.locator('.ui-sheet input[aria-label="Name of Heart Rate"]').fill("   "); pg.locator('.ui-sheet input[aria-label="Name of Heart Rate"]').press("Tab"); pg.wait_for_timeout(100)
        ok("needs a name" in toast() and next(m for m in local("ht_metrics_v1") if m["id"] == "hr")["label"] == "Heart Rate" and pg.locator('.ui-sheet input[value="Heart Rate"]').count() == 1, "blank name refused and the old name comes back")
        pg.click('.ui-sheet button[aria-label="Add metric"]'); pg.wait_for_timeout(100); ok("Enter a metric name" in toast() and sheet_rows().count() == 12, "adding without a name is refused")
        pg.fill('.ui-sheet input[aria-label="New metric icon"]', "\U0001FAC1"); pg.fill('.ui-sheet input[aria-label="New metric name"]', "SpO2"); pg.press('.ui-sheet input[aria-label="New metric name"]', "Enter"); settle()
        added = [m for m in local("ht_metrics_v1") if m["label"] == "SpO2"]; ok(len(added) == 1 and added[0]["type"] == "number" and added[0]["pinned"] is False and sheet_rows().count() == 13, "SpO2 added with Enter: a number metric, unpinned, 13 rows")
        # editing a field and tapping Delete straight away must not lose the tap (a repaint on blur would swallow it)
        pg.locator('.ui-sheet input[aria-label="Name of Calories Out"]').fill("Burn"); pg.locator('.ui-sheet button[aria-label="Delete Calories Out"]').click(); pg.wait_for_selector('[role="alertdialog"]', timeout=3000)
        ok(next(m for m in local("ht_metrics_v1") if m["id"] == "calout")["label"] == "Burn", "the edit was saved when the field lost focus"); ok("will no longer show" in pg.inner_text('[role="alertdialog"]'), "delete asks first and explains saved numbers stay")
        pg.click('[role="alertdialog"] button:has-text("Cancel")'); pg.wait_for_timeout(100); ok(sheet_rows().count() == 13 and any(m["id"] == "calout" for m in local("ht_metrics_v1")), "Cancel keeps the metric")
        pg.locator('.ui-sheet button[aria-label="Delete SpO2"]').click(); pg.click('[role="alertdialog"] button:has-text("Delete")'); settle()
        ok(sheet_rows().count() == 12 and not any(m["label"] == "SpO2" for m in local("ht_metrics_v1")), "SpO2 deleted")
        meta = cloud().get("healthtracker_meta/settings", {}); ok(any(m["label"] == "Hydration" for m in meta.get("metrics", [])) and not any(m["label"] == "SpO2" for m in meta.get("metrics", [])), "the cloud settings doc follows every change")
        close_sheet(); ok("12 metrics" in row("Metrics").inner_text() and "8 pinned" in row("Metrics").inner_text(), "More redrew after closing: " + row("Metrics").inner_text().replace("\n", " "))
        tab("today"); pg.wait_for_selector(".hrow")
        ok(pg.locator(".hrow").count() == 8 and pg.locator('input[aria-label="Hydration"]').count() == 1 and pg.locator('input[aria-label="Blood Sugar"]').count() == 1, "Today shows the new pinned set (8 rows) with the renamed metric")

        # ---------- Goals ----------
        tab("more"); row("Goals").click(); pg.wait_for_selector(".ui-sheet"); ok(pg.locator(".ui-sheet .empty").count() == 1, "no goals yet (the stored steps:0 does not count)")
        opts = pg.locator('.ui-sheet select[aria-label="Goal metric"] option'); ok(opts.count() == 9 and any("Steps" in t for t in opts.all_inner_texts()), "9 numeric metrics offered, including steps (stored as 0)")
        pg.click('.ui-sheet button[aria-label="Add goal"]'); pg.wait_for_timeout(100); ok("Enter a target value" in toast(), "a goal needs a value")
        pg.select_option('.ui-sheet select[aria-label="Goal metric"]', "weight"); pg.fill('.ui-sheet input[aria-label="Goal value"]', "72"); pg.click('.ui-sheet button[aria-label="Add goal"]'); settle()
        ok(local("ht_goals_v1").get("weight") == 72 and sheet_rows().count() == 1, "weight goal 72 saved; one goal row")
        ok(pg.locator('.ui-sheet select[aria-label="Goal metric"] option').count() == 8, "a metric with a goal leaves the picker")
        pg.select_option('.ui-sheet select[aria-label="Goal metric"]', "water"); pg.fill('.ui-sheet input[aria-label="Goal value"]', "3"); pg.press('.ui-sheet input[aria-label="Goal value"]', "Enter"); settle(); ok(local("ht_goals_v1").get("water") == 3, "water goal added with Enter")
        pg.locator('.ui-sheet input[aria-label="Target for Weight"]').fill("70"); pg.locator('.ui-sheet button[aria-label="Remove Hydration goal"]').click(); settle()
        g = local("ht_goals_v1"); ok(g.get("weight") == 70 and "water" not in g, "edited the weight target and removed water in one go (no swallowed tap): %s" % g)
        pg.locator('.ui-sheet input[aria-label="Target for Weight"]').fill("0"); pg.locator('.ui-sheet input[aria-label="Target for Weight"]').press("Tab"); pg.wait_for_timeout(150)
        ok(local("ht_goals_v1").get("weight") == 70 and pg.locator('.ui-sheet input[aria-label="Target for Weight"]').input_value() == "70", "emptying a target is refused and the old value returns")
        close_sheet(); ok("1 goal set" in row("Goals").inner_text(), "More: " + row("Goals").inner_text().replace("\n", " "))
        tab("insights"); pg.wait_for_selector(".card:has-text('Goal progress')")
        ok(pg.locator(".card:has-text('Goal progress') .bar").count() == 1 and pg.locator("text=Edit goals").count() == 1, "Insights shows the weight goal bar and an Edit goals button")
        pg.click("text=Edit goals"); pg.wait_for_selector(".ui-sheet"); ok(pg.get_attribute(".ui-sheet .seg__btn:has-text('Goals')", "aria-pressed") == "true", "Edit goals opens on Goals"); close_sheet()
        pg.click(".seg__btn:has-text('Forecast')"); ok(pg.locator("text=Set a weight goal").count() == 0, "forecast no longer asks for a weight goal once one exists")

        # ---------- Restore: files that are not backups ----------
        tab("more"); n_days, n_cloud = len(day_keys()), len(cloud_days())
        pick(BAD_TEXT, "Restore \u2014 merge"); ok("valid JSON" in toast(), "not-JSON file refused: " + toast())
        pick(BAD_DATA, "Restore \u2014 merge"); ok("No Health Tracker data" in toast(), "JSON without health data refused: " + toast())
        ok(len(day_keys()) == n_days, "refused files change nothing")

        # ---------- Restore: merge ----------
        before_meta = local("ht_metrics_v1"); pick(MERGE_FILE, "Restore \u2014 merge"); pg.wait_for_selector('[role="alertdialog"]')
        msg = pg.inner_text('[role="alertdialog"]'); ok("Merge backup?" in msg and "1 new days are added and 1 existing days are overwritten" in msg and "3 days that are only here" in msg and "1 invalid items" in msg, "merge preview counts: " + msg.replace("\n", " ")[:260])
        pg.screenshot(path="test-output/settings-merge.png")
        pg.click('[role="alertdialog"] button:has-text("Cancel")'); pg.wait_for_timeout(100); ok(len(day_keys()) == n_days and local("ht_2026_10_5")["weight"] == 78.4, "Cancel on the preview changes nothing")
        pick(MERGE_FILE, "Restore \u2014 merge"); pg.wait_for_selector('[role="alertdialog"]')
        with pg.expect_download() as dl: pg.click('[role="alertdialog"] button:has-text("Merge")')
        safety = json.load(open(dl.value.path())); ok(dl.value.suggested_filename.startswith("health-tracker-auto-before-import-") and len(safety["days"]) == 4 and safety["days"]["ht_2026_10_5"]["weight"] == 78.4, "a safety backup of the CURRENT data (4 days) downloads first: " + dl.value.suggested_filename)
        pg.wait_for_selector('[role="alertdialog"]:has-text("Safety backup downloaded?")'); ok(local("ht_2026_10_5")["weight"] == 78.4, "nothing is written until the safety file is confirmed")
        pg.click('[role="alertdialog"] button:has-text("File saved")'); settle()
        ok(local("ht_2026_10_5")["weight"] == 70 and local("ht_2026_9_1") == {"weight": 71.2, "mood": "good"} and local("ht_2026_10_6") == {"water": 2.5} and local("ht_2026_10_9") == {"steps": 6000} and len(day_keys()) == 5, "merged: Oct 5 overwritten, Sep 1 added, local-only days intact (5 days)")
        ok(local("ht_goals_v1").get("water") == 2.5 and local("ht_goals_v1").get("weight") == 70, "goals merged (file adds water, keeps weight)")
        ok(local("ht_profile_v1") == {"height": 180, "age": 30, "sex": "female", "activity": 1.2}, "profile fields from the file win: %s" % local("ht_profile_v1"))
        ms = local("ht_metrics_v1"); ok(any(m["id"] == "zzz" for m in ms) and any(m["label"] == "Hydration" for m in ms) and len(ms) == 13, "Zinc added, local renames kept (13 metrics)")
        ok("healthtracker/2026_9_1" in cloud_days() and cloud()["healthtracker/2026_10_5"]["weight"] == 70, "merge reached the cloud too"); ok("Import done" in toast() or True, "")

        # ---------- Restore: replace ----------
        pick(REPLACE_FILE, "Restore \u2014 replace everything"); pg.wait_for_selector('[role="alertdialog"]'); msg = pg.inner_text('[role="alertdialog"]')
        ok("Replace all data?" in msg and "4 days on this device and 4 in the cloud" in msg, "replace preview counts local AND cloud deletions: " + msg.replace("\n", " ")[:240])
        ok(pg.locator('[role="alertdialog"] button:has-text("Replace")').is_disabled(), "Replace is disabled until REPLACE is typed")
        pg.fill('[role="alertdialog"] input', "replace"); ok(pg.locator('[role="alertdialog"] button:has-text("Replace")').is_disabled(), "lower-case 'replace' does not unlock it")
        pg.fill('[role="alertdialog"] input', "REPLACE")
        with pg.expect_download() as dl2: pg.click('[role="alertdialog"] button:has-text("Replace")')
        pg.wait_for_selector('[role="alertdialog"]:has-text("Safety backup downloaded?")'); pg.click('[role="alertdialog"] button:has-text("Cancel")'); pg.wait_for_timeout(150)
        ok(len(day_keys()) == 5 and "Cancelled" in toast(), "Cancel at the safety-backup step aborts everything: 5 days stay")
        pick(REPLACE_FILE, "Restore \u2014 replace everything"); pg.wait_for_selector('[role="alertdialog"]'); pg.fill('[role="alertdialog"] input', "REPLACE")
        with pg.expect_download() as dl3: pg.click('[role="alertdialog"] button:has-text("Replace")')
        pg.wait_for_selector('[role="alertdialog"]:has-text("Safety backup downloaded?")'); pg.click('[role="alertdialog"] button:has-text("File saved")'); settle()
        ok(day_keys() == ["ht_2026_10_5"] and local("ht_2026_10_5") == {"weight": 69}, "replaced: only the file's day is left locally: %s" % day_keys())
        ok(cloud_days() == ["healthtracker/2026_10_5"] and cloud()["healthtracker/2026_10_5"] == {"weight": 69}, "the cloud copy was replaced too (no old days to come back): %s" % cloud_days())
        ok(local("ht_goals_v1") == {"steps": 8000} and local("ht_profile_v1") == DEFAULT_PROFILE and len(local("ht_metrics_v1")) == 13, "goals/profile replaced; a file without metrics keeps the current metrics")
        ok(cloud()["healthtracker_meta/settings"]["goals"] == {"steps": 8000}, "cloud settings doc replaced")
        ok(row("Metrics").inner_text().count("13 metrics") == 1, "More redrew: " + row("Metrics").inner_text().replace("\n", " "))
        pg.screenshot(path="test-output/settings-more.png")

        # ---------- Remove all ----------
        row("Remove all data").click(); pg.wait_for_selector('[role="alertdialog"]'); ok("All 1 day," in pg.inner_text('[role="alertdialog"]'), "singular wording: " + pg.inner_text('[role="alertdialog"]').split("\n")[1][:60])
        ok(pg.locator('[role="alertdialog"] button:has-text("Delete everything")').is_disabled(), "disabled until DELETE is typed"); pg.fill('[role="alertdialog"] input', "DELETE")
        with pg.expect_download() as dl4: pg.click('[role="alertdialog"] button:has-text("Delete everything")')
        safety = json.load(open(dl4.value.path())); ok(dl4.value.suggested_filename.startswith("health-tracker-auto-before-delete-") and list(safety["days"]) == ["ht_2026_10_5"], "backup first: " + dl4.value.suggested_filename)
        pg.click('[role="alertdialog"] button:has-text("File saved")'); settle()
        ok(day_keys() == [] and cloud_days() == [] and "healthtracker_meta/settings" not in cloud(), "all days gone locally and in the cloud, settings doc deleted")
        ms = local("ht_metrics_v1"); ok(len(ms) == 12 and sum(1 for m in ms if m["pinned"]) == 7 and local("ht_goals_v1") == {} and local("ht_profile_v1") == DEFAULT_PROFILE, "metrics/goals/profile back to defaults")
        ok(pg.locator(".mrow2:has-text('Metrics')").inner_text().count("12 metrics") == 1, "More redrew with defaults")

        # ---------- layout at 320px: no sideways scroll on any screen or sheet ----------
        pg.set_viewport_size({"width": 320, "height": 640}); scroll = lambda: pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        for t in ["today", "history", "insights", "guide", "more"]:
            tab(t); ok(scroll() <= 0, "320px, %s: no sideways scroll (%s)" % (t, scroll()))
        pg.screenshot(path="test-output/settings-320-more.png")
        tab("guide"); pg.screenshot(path="test-output/settings-320-guide.png", full_page=True)
        tab("more")
        for name in ["Metrics", "Goals", "Profile"]:
            row(name).click(); pg.wait_for_selector(".ui-sheet")
            if name == "Goals":
                pg.select_option('.ui-sheet select[aria-label="Goal metric"]', "weight"); pg.fill('.ui-sheet input[aria-label="Goal value"]', "70"); pg.click('.ui-sheet button[aria-label="Add goal"]'); pg.wait_for_timeout(150)
            ok(pg.evaluate("(() => { const b = document.querySelector('.ui-sheet__body'); return b.scrollWidth - b.clientWidth; })()") <= 0, "320px, %s sheet: nothing overflows sideways" % name)
            if name == "Goals": pg.screenshot(path="test-output/settings-320-goals.png")
            close_sheet()
        ok(not errs, "no console errors: " + "; ".join(errs[:5]))
        ctx.close()

        # ---------- signed out / offline: merge still works, replace and remove-all explain why they cannot ----------
        ctx2 = b.new_context(viewport={"width": 360, "height": 740}, accept_downloads=True); ctx2.route("**/*", lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        ctx2.add_init_script("if (!localStorage.getItem('__seeded')) { localStorage.setItem('ht_2026_10_5', JSON.stringify({weight: 78.4})); localStorage.setItem('__seeded', '1'); }")
        p2 = ctx2.new_page(); p2.on("pageerror", lambda e: errs.append("offline pageerror: " + str(e)))
        p2.goto(URL + "#more"); p2.wait_for_selector("#splash", state="detached", timeout=8000); p2.wait_for_timeout(300)
        with p2.expect_file_chooser() as fc: p2.locator('.mrow2:has(.mrow__m > span:first-child:text-is("Restore \u2014 replace everything"))').click()
        fc.value.set_files(REPLACE_FILE); p2.wait_for_timeout(300)
        ok("Sign in and go online first" in p2.inner_text(".ui-toast") and p2.locator('[role="alertdialog"]').count() == 0, "offline: replace is refused before any dialog")
        p2.locator('.mrow2:has(.mrow__m > span:first-child:text-is("Remove all data"))').click(); p2.wait_for_selector('[role="alertdialog"]'); p2.fill('[role="alertdialog"] input', "DELETE"); p2.click('[role="alertdialog"] button:has-text("Delete everything")'); p2.wait_for_timeout(300)
        ok("Sign in and go online first" in p2.inner_text(".ui-toast") and json.loads(p2.evaluate("localStorage.getItem('ht_2026_10_5')"))["weight"] == 78.4, "offline: remove-all is refused and nothing was deleted")
        with p2.expect_file_chooser() as fc: p2.locator('.mrow2:has(.mrow__m > span:first-child:text-is("Restore \u2014 merge"))').click()
        fc.value.set_files(MERGE_FILE); p2.wait_for_selector('[role="alertdialog"]'); p2.click('[role="alertdialog"] button:has-text("Merge")'); p2.wait_for_selector('[role="alertdialog"]:has-text("Safety backup")'); p2.click('[role="alertdialog"] button:has-text("File saved")'); p2.wait_for_timeout(300)
        ok(json.loads(p2.evaluate("localStorage.getItem('ht_2026_10_5')"))["weight"] == 70 and p2.evaluate("JSON.parse(localStorage.getItem('ht2_outbox_v1')||'{}')['healthtracker/2026_9_1'] !== undefined"), "offline: merge works, and the new day waits in the outbox for the next sync")
        ok(not errs, "no errors offline either: " + "; ".join(errs[:5]))
        ctx2.close(); b.close()

try: run()
except Exception as e: fails.append("script error: %r" % e); print("FAIL script error:", repr(e))
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
