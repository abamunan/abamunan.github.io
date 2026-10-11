# Browser smoke test (real Chromium via Playwright). Needs: pip install playwright && playwright install chromium
# Run from the repo root:  python3 -m http.server 8123 &   then   python3 apps/money/tests/browser-smoke.py
# External network is blocked on purpose, so it exercises the offline path. Screenshots go to ./test-output/
import json, datetime, os
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
today = datetime.date(2026,10,8)
def key(d): return f"mt_{d.year}_{d.month}_{d.day}"
old = today - datetime.timedelta(days=5)
seed = {key(old): {"lunch":150,"acct_lunch":"bkash","note_lunch":"old note","ts_lunch":1,"self":900,"acct_self":"cash"}}
errs=[]; fails=[]
def ok(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":360,"height":740}, reduced_motion="no-preference")
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    ctx.add_init_script("""(() => { if (!localStorage.getItem('__seeded')) { const s=%s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('__seeded','1'); } })()""" % json.dumps(seed))
    pg=ctx.new_page(); pg.clock.install(time=datetime.datetime(2026,10,8,12,0,0)); pg.on("pageerror", lambda e: errs.append("pageerror: "+str(e))); pg.on("console", lambda m: errs.append("console."+m.type+": "+m.text) if m.type=="error" else None)
    pg.goto("http://localhost:8123/apps/money/index.html"); pg.wait_for_selector("#splash", state="detached", timeout=8000)
    ok(pg.locator("main#main").count()==1, "main landmark present")
    ok(pg.locator("#tabbar button").count()==5, "5 tabs")
    ok(pg.inner_text("#syncState")=="Offline", "offline status shown (no network here): "+pg.inner_text("#syncState"))
    pg.screenshot(path="test-output/1-today.png")
    # add entry: FAB -> 2 5 0 -> Save
    pg.click("#fab"); pg.wait_for_selector(".ui-sheet"); pg.wait_for_timeout(400); pg.screenshot(path="test-output/2a-add-open.png")
    pg.set_viewport_size({"width":360,"height":640}); pg.wait_for_timeout(200); pg.screenshot(path="test-output/2b-add-640.png"); vis=pg.evaluate("(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();return {keypad_above_save:r('.keypad').bottom<=r('.add-save').top+1}})()"); print("   at 360x640 visible without scrolling:", vis); pg.set_viewport_size({"width":360,"height":740})
    for k in "250": pg.click(f".keypad button[aria-label='{k}']")
    ok(pg.input_value(".add-amount")=="250", "keypad typed 250")
    pg.screenshot(path="test-output/2-add.png")
    pg.click(".add-save"); pg.wait_for_selector(".ui-sheet", state="detached")
    ls=pg.evaluate("Object.fromEntries(Object.entries(localStorage))"); k=key(today)
    doc=json.loads(ls[k]); print("   stored:", doc)
    first=[c for c in ["nasta","lunch","dinner"] if c in doc and doc[c]]
    ok(len(first)==1 and doc[first[0]]==250 and len(doc["entries"])==1 and doc["entries"][0]["amt"]==250, "flat field and entries both written")
    ok(pg.locator(".erow").count()==1 and "250" in pg.inner_text(".erow"), "row visible in Today")
    ok(pg.locator(".ui-toast button").count()==1, "undo toast shown")
    pg.click(".ui-toast button"); pg.wait_for_timeout(300)
    doc2=json.loads(pg.evaluate(f"localStorage.getItem('{k}')")); ok(doc2.get(first[0],0)==0 and not doc2.get("entries"), "Undo removed the entry (flat back to 0)")
    # expression: 100+50*2 = 200
    pg.click("#fab"); pg.wait_for_selector(".ui-sheet")
    for k2 in ["1","0","0","+","5","0","×","2"]: pg.click(f".keypad button:text-is('{k2}')")
    ok("= ৳ 200" in pg.inner_text(".add-preview"), "live preview 100+50×2 = ৳ 200: "+pg.inner_text(".add-preview"))
    pg.click(".seg__btn:has-text('Income')"); ok(pg.locator(".add-save").inner_text().startswith("Save +"), "save button shows + for income: "+pg.inner_text(".add-save")); pg.click(".seg__btn:has-text('Expense')")
    pg.click(".add-save"); pg.wait_for_selector(".ui-sheet", state="detached"); dd=json.loads(pg.evaluate(f"localStorage.getItem('{key(today)}')")); ok(len(dd["entries"])==1 and dd["entries"][0]["amt"]==200, "Save evaluates 100+50x2 -> entry of 200")
    # edit: tap row -> change amount -> save
    pg.click(".erow"); pg.wait_for_selector(".ui-sheet"); ok("Edit entry" in pg.inner_text(".ui-sheet"), "edit sheet opens on tap")
    pg.fill(".add-amount","210"); pg.dispatch_event(".add-amount","input"); pg.click(".add-save"); pg.wait_for_selector(".ui-sheet", state="detached")
    ok("210" in pg.inner_text(".erow"), "edited amount shown")
    # delete via keyboard + undo
    pg.focus(".erow"); pg.keyboard.press("Delete"); pg.wait_for_timeout(200); ok(pg.locator(".erow").count()==0, "Delete key removes row")
    pg.click(".ui-toast button"); pg.wait_for_timeout(300); ok(pg.locator(".erow").count()==1, "Undo restores row")
    # history + legacy day
    pg.click("#tabbar [data-tab=history]"); pg.wait_for_selector(".dgroup"); txt=pg.inner_text("main")
    ok(pg.locator(".dgroup").count()==2, "history groups 2 days"); ok("adjustment" in txt, "legacy day shows 'adjustment' rows")
    ok(pg.locator(".lockico").count()==1, "legacy day (5 days old) shows lock icon")
    pg.screenshot(path="test-output/3-history.png")
    # locked edit -> unlock confirm -> save -> still locked
    pg.locator(".dgroup").nth(1).locator(".erow").first.click(); pg.wait_for_selector(".ui-sheet"); ok(pg.locator(".add-lock:visible").count()==1, "locked banner in edit sheet")
    pg.fill(".add-amount","160"); pg.dispatch_event(".add-amount","input"); pg.click(".add-save"); pg.wait_for_selector(".ui-confirm")
    with pg.expect_download() as dl: pg.click(".ui-confirm .ui-btn--primary")
    fn=dl.value.suggested_filename; ok(fn.startswith("money-tracker-auto-before-migration-") and fn.endswith(".json"), "safety backup downloaded: "+fn)
    dl.value.save_as("test-output/auto-backup.json")
    pg.wait_for_selector(".ui-confirm:has-text('Safety backup')"); pg.click(".ui-confirm .ui-btn--primary"); pg.wait_for_selector(".ui-sheet", state="detached")
    od=json.loads(pg.evaluate(f"localStorage.getItem('{key(old)}')")); print("   legacy day after edit:", {k3:v for k3,v in od.items() if k3!='entries'})
    ok(od["lunch"]==160 and "locked" not in od, "legacy day edited; lock flag untouched (auto-lock stays)")
    pg.click("#tabbar [data-tab=history]"); ok(pg.locator(".lockico").count()==1, "day is still locked after edit")
    # year mode, filters
    pg.click(".seg__btn:has-text('Year')"); ok(pg.locator(".mrow").count()==12, "year mode: 12 month rows")
    pg.click(".mrow >> nth=9"); ok("October 2026" in pg.inner_text(".hnav__t"), "month row opens that month")
    pg.select_option("select", "self"); ok(pg.locator(".dgroup").count()==1, "category filter works")
    # other tabs / a11y basics
    pg.click("#tabbar [data-tab=insights]"); pg.wait_for_selector("main :text('Spending by day')", timeout=3000); ok(True, "Insights tab opens")
    pg.click("#tabbar [data-tab=more]"); pg.screenshot(path="test-output/4-more.png")
    ok(pg.get_attribute("#tabbar [data-tab=more]","aria-current")=="page", "aria-current on active tab")
    pg.click("#tabbar [data-tab=today]"); pg.emulate_media(color_scheme="dark"); pg.evaluate("MunanTheme.set('dark')"); pg.wait_for_timeout(200); pg.screenshot(path="test-output/5-dark.png")
    small=pg.evaluate("[...document.querySelectorAll('button,a,select,input')].filter(e=>e.offsetParent&&(e.getBoundingClientRect().height<43.5||e.getBoundingClientRect().width<43.5)).map(e=>e.className||e.tagName)"); print("   <44px targets:", small)
    ok(pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"), "no horizontal scroll at 360px")
    b.close()
print("console/page errors:", [e for e in errs if "ERR_FAILED" not in e and "net::" not in e and "Failed to load resource" not in e])
print("FAILED:", fails if fails else "none")
