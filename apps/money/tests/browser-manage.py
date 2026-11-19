# Browser test for Categories & sources (More tab). Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-manage.py
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
seed = {"mt_2026_10_7": {"lunch": 400, "acct_lunch": "cash", "ts_lunch": 1, "self": 5000, "acct_self": "bkash", "ts_self": 1}, "mt_2026_10_6": {"oldcat": 90, "acct_oldcat": "cash", "ts_oldcat": 1}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 360, "height": 740})
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8123/apps/money/index.html#more"); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    exp = lambda: ls("mt_categories_v1")["expense"]; inc = lambda: ls("mt_categories_v1")["income"]
    def submit(): pg.locator(".ui-sheet .add-save").click(); pg.wait_for_selector(".add-save", state="detached", timeout=3000)
    pg.get_by_role("button", name="Categories & sources").click(); pg.wait_for_selector(".ui-sheet")
    t = pg.inner_text(".ui-sheet")
    ok("Expense categories" in t and "Income sources" in t and "Lunch" in t and "Family Income" in t, "sheet lists expense categories and income sources")
    pg.screenshot(path="test-output/manage-0.png")
    # add (expense)
    pg.get_by_role("button", name="Add category").click(); pg.wait_for_selector(".add-save")
    pg.locator('.add-save').locator("xpath=ancestor::div[contains(@class,'form')]").get_by_label("Name").fill("Tea"); pg.get_by_label("Icon (optional)").fill("\u2615"); submit()
    e = exp(); ok(e[-1]["label"] == "Tea" and e[-1]["icon"] == "\u2615" and e[-1]["budget"] == 0 and e[-1]["pinned"] is False, "new category saved with budget 0, not pinned")
    ok(pg.get_by_label("Edit Tea").count() == 1, "list repainted with the new row")
    # duplicate name refused, sheet stays open
    pg.get_by_role("button", name="Add category").click(); pg.wait_for_selector(".add-save"); pg.get_by_label("Name").fill("tea"); pg.locator(".add-save").click(); pg.wait_for_timeout(300)
    ok(pg.locator(".add-save").count() == 1 and len([f for f in exp() if f["label"].lower() == "tea"]) == 1, "duplicate name is refused and nothing is saved")
    pg.keyboard.press("Escape"); pg.wait_for_selector(".add-save", state="detached")
    # add (income source)
    pg.get_by_role("button", name="Add source").click(); pg.wait_for_selector(".add-save"); pg.get_by_label("Name").fill("Tuition"); submit()
    ok(inc()[-1]["label"] == "Tuition" and "budget" not in inc()[-1], "new income source saved (no budget field)")
    # edit: rename + pin + default account
    pg.get_by_label("Edit Tea").click(); pg.wait_for_selector(".add-save")
    pg.get_by_label("Name").fill("Chai"); pg.get_by_role("button", name="Pinned").click(); pg.locator(".ui-sheet").last.get_by_role("button", name="bKash").click(); submit()
    f = [x for x in exp() if x["label"] == "Chai"][0]; ok(f["pinned"] is True and f["defaultAcct"] == "bkash", "rename, pin and default account saved")
    # reorder
    ids = [x["id"] for x in exp()]; pg.get_by_label("Move Chai up").click(); ids2 = [x["id"] for x in exp()]
    ok(ids2[-2] == ids[-1] and ids2[-1] == ids[-2], "move up swaps with the previous row")
    ok(pg.get_by_label("Move Lunch up").count() == 0 or pg.get_by_label("Move Nasta up").is_disabled(), "first row cannot move up")
    # a category that has data cannot be deleted: it can only be archived (totals do not change)
    ok(pg.get_by_label("Delete Lunch").count() == 0 and pg.get_by_label("Archive Lunch").count() == 1, "a category with saved data offers Archive, not Delete")
    pg.get_by_label("Archive Lunch").click(); pg.wait_for_timeout(300)
    lunch = [x for x in exp() if x["id"] == "lunch"]
    ok(len(lunch) == 1 and lunch[0].get("archived") is True and ls("mt_2026_10_7")["lunch"] == 400, "Lunch archived: still in the list, saved day untouched")
    ok(pg.get_by_label("Unarchive Lunch").count() == 1 and "Archived" in pg.inner_text(".ui-sheet"), "archived row says Archived and offers Unarchive")
    # data left behind by an older version's delete can be restored
    ok("Data from deleted categories" in pg.inner_text(".ui-sheet") and "oldcat" in pg.inner_text(".ui-sheet"), "orphaned data is listed")
    pg.get_by_label("Restore oldcat").click(); pg.wait_for_selector(".add-save"); pg.get_by_label("Name").fill("Old things"); submit()
    r = [x for x in exp() if x["id"] == "oldcat"]; ok(len(r) == 1 and r[0]["label"] == "Old things" and r[0]["archived"] is True, "restored as an archived expense category")
    ok("Data from deleted categories" not in pg.inner_text(".ui-sheet"), "orphan card disappears after restoring")
    # delete one with no data
    pg.get_by_label("Delete Chai").click(); pg.wait_for_selector(".ui-confirm"); ok("no saved amounts" in pg.inner_text(".ui-confirm"), "unused category says nothing in history changes")
    pg.get_by_role("button", name="Cancel").click(); ok(any(x["label"] == "Chai" for x in exp()), "cancel keeps it")
    # archived categories do not expose their templates on the Add sheet
    pg.keyboard.press("Escape"); active_cat = [x for x in exp() if x["label"] == "Chai"][0]["id"]
    pg.evaluate("""(cat) => localStorage.setItem('mt2_templates_v1', JSON.stringify([
      {id:'old-template', label:'Lunch shortcut', cat:'lunch', amt:10, acct:'cash', note:''},
      {id:'active-template', label:'Chai shortcut', cat:cat, amt:10, acct:'cash', note:''}
    ]))""", active_cat); pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    ok(any(x["label"] == "Chai" for x in exp()), "changes survive a reload")
    # Today/Add sheet shows the new source & hides deleted category
    pg.locator("#fab").click(); pg.wait_for_selector(".ui-sheet"); at = pg.inner_text(".ui-sheet"); ok("Chai" in at and "Lunch" not in at and "Old things" not in at and "Lunch shortcut" not in at and "Chai shortcut" in at, "Add sheet shows active categories and templates only")
    pg.screenshot(path="test-output/manage-1.png")
    ok(not errs, "no console errors: " + "; ".join(errs[:3]))
    b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
