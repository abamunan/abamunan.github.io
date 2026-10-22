# Browser test for the floating calculator. Run from the repo root:
#   python3 -m http.server 8123 &    then    python3 apps/money/tests/browser-calc.py
import json, os, datetime
os.makedirs("test-output", exist_ok=True)
from playwright.sync_api import sync_playwright
errs, fails = [], []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
URL = "http://localhost:8123/apps/money/index.html"
def newpage(b, init=""):
    ctx = b.new_context(viewport={"width": 360, "height": 740}); ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost:8123") else r.abort())
    if init: ctx.add_init_script(init)
    pg = ctx.new_page(); pg.clock.install(time=datetime.datetime(2026, 10, 8, 12, 0, 0))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto(URL); pg.wait_for_selector("#splash", state="detached", timeout=10000); return pg
with sync_playwright() as p:
    b = p.chromium.launch(); pg = newpage(b)
    ls = lambda k: json.loads(pg.evaluate("k => localStorage.getItem(k)", k) or "null")
    fab = pg.get_by_label("Open calculator"); win = pg.locator(".calc")
    key = lambda k: pg.locator(f'.calc [data-key="{k}"]').click()
    box = lambda sel: pg.locator(sel).bounding_box()
    ok(fab.is_hidden() and not win.is_visible(), "calculator is hidden on the landing view")
    pg.goto(URL + "#more"); pg.get_by_role("button", name="Show calculator").click()
    ok(fab.is_visible() and win.is_visible(), "More → Show calculator restores and opens it")
    pg.get_by_label("Close calculator").click()
    fb = box(".calc-fab"); ok(0 <= fb["x"] and fb["x"] + fb["width"] <= 360 and 0 <= fb["y"] and fb["y"] + fb["height"] <= 740, "icon is inside the screen")
    fab.click(); ok(win.is_visible() and fab.get_attribute("aria-expanded") == "true", "tap opens the window")
    for k in "12+30": key(k)
    ok(pg.inner_text(".calc__expr") == "12 + 30" and pg.inner_text(".calc__res") == "= 42", "live preview while typing: 12 + 30 → = 42")
    key("="); ok(pg.inner_text(".calc__expr") == "42", "equals shows 42")
    h0 = ls("mt2_calc_history_v1"); ok(h0 and h0[0] == {"e": "12 + 30", "r": "42"}, "result saved to history")
    for k in ["C", "(", "2", "+", "3", ")", "×", "4", "="]: key(k)
    ok(pg.inner_text(".calc__expr") == "20", "brackets and multiply: (2+3)×4 = 20")
    # keyboard (focus is on the window after a pointer click)
    pg.keyboard.press("Escape"); ok(not win.is_visible() and pg.evaluate("document.activeElement.classList.contains('calc-fab')"), "Escape closes and returns focus to the icon")
    fab.click()
    for k in ["Delete", "5", "*", "4", "Enter"]: pg.keyboard.press(k)
    ok(pg.inner_text(".calc__expr") == "20", "keyboard: 5 * 4 Enter = 20")
    pg.keyboard.press("Backspace"); pg.keyboard.press("9"); ok(pg.inner_text(".calc__expr") == "29", "Backspace edits the result, digits continue")
    for k in ["Delete", "5", "/", "0", "Enter"]: pg.keyboard.press(k)
    ok(pg.inner_text(".calc__res") == "Check the expression" and pg.inner_text(".calc__expr") == "5 ÷ 0", "divide by zero shows a message and keeps the expression")
    # history
    pg.get_by_label("History").click(); items = pg.locator(".calc__h"); ok(items.count() >= 2 and "5 × 4" in items.first.inner_text(), "history lists newest first")
    items.nth(1).click(); ok(pg.inner_text(".calc__expr").replace("−", "-") in ("20", "42") and not pg.locator(".calc__hist").is_visible(), "tapping a history row reuses the result")
    pg.get_by_label("History").click(); pg.get_by_role("button", name="Clear history").click(); ok(ls("mt2_calc_history_v1") == [], "clear history")
    pg.get_by_label("History").click()
    # drag window by header, position is remembered
    hb = box(".calc__head"); pg.mouse.move(hb["x"] + 40, hb["y"] + 15); pg.mouse.down(); pg.mouse.move(hb["x"] + 40, hb["y"] + 150, steps=6); pg.mouse.up()
    wb2 = box(".calc"); ok(wb2["y"] > hb["y"] + 100, "window dragged down by its header")
    w = ls("mt2_calc_win_v1"); ok(w and 0 <= w["fx"] <= 1 and 0 <= w["fy"] <= 1, "window position saved as a fraction")
    pg.get_by_label("Close calculator").click(); pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=10000); pg.get_by_label("Open calculator").click()
    ok(abs(box(".calc")["y"] - wb2["y"]) < 3, "window reopens where it was left after a reload")
    pg.get_by_label("Close calculator").click()
    # drag icon: moves, does not open, saved
    fb = box(".calc-fab"); pg.mouse.move(fb["x"] + 27, fb["y"] + 27); pg.mouse.down(); pg.mouse.move(250, 300, steps=8); pg.mouse.up()
    fb2 = box(".calc-fab"); ok(abs(fb2["x"] + 27 - 250) < 4 and abs(fb2["y"] + 27 - 300) < 4 and not pg.locator(".calc").is_visible(), "icon follows the finger; dropping it does not open the window")
    ok(ls("mt2_calc_icon_v1") is not None, "icon position saved")
    # works over the Add sheet
    pg.locator("#fab").click(); pg.wait_for_selector(".ui-sheet"); pg.get_by_label("Open calculator").click(); ok(win.is_visible(), "opens while the Add sheet is open")
    cb = box(".calc"); top = pg.evaluate("([x,y]) => !!document.elementFromPoint(x,y).closest('.calc')", [cb["x"] + cb["width"] / 2, cb["y"] + cb["height"] / 2]); ok(top, "window is above the sheet")
    for k in "7+8": key(k)
    key("="); ok(pg.inner_text(".calc__expr") == "15", "keys work while the app behind is locked")
    pg.get_by_label("Close calculator").click(); pg.keyboard.press("Escape")
    # hold on the icon shows the ✕ target; drop on it hides for 10 minutes
    fb = box(".calc-fab"); pg.mouse.move(fb["x"] + 27, fb["y"] + 27); pg.mouse.down(); pg.mouse.move(fb["x"] + 27, fb["y"] + 60, steps=3)
    ok(pg.locator(".calc-drop").is_visible(), "drag shows the ✕ target"); db = box(".calc-drop__x"); pg.mouse.move(db["x"] + 28, db["y"] + 28, steps=8)
    ok(pg.evaluate("document.querySelector('.calc-drop').classList.contains('calc-drop--hot')"), "target lights up when the icon is over it")
    pg.mouse.up(); ok(pg.locator(".calc-fab").is_hidden() and pg.locator(".calc-drop").is_hidden(), "icon hidden after dropping on ✕")
    pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=10000); ok(pg.locator(".calc-fab").is_hidden(), "still hidden after a reload")
    pg.clock.fast_forward("11:00"); pg.wait_for_timeout(200); ok(pg.locator(".calc-fab").is_hidden(), "calculator stays hidden until More restores it")
    # bring back from More
    pg.evaluate("localStorage.setItem('mt2_calc_hidden_until_v1', String(Date.now()+600000))"); pg.reload(); pg.wait_for_selector("#splash", state="detached", timeout=10000)
    pg.goto(URL + "#more"); pg.get_by_role("button", name="Show calculator").click(); ok(pg.locator(".calc-fab").is_visible() and win.is_visible(), "More → Show calculator brings it back and opens it")
    ok(pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), "no horizontal scroll at 360px")
    pg.screenshot(path="test-output/calc-0.png")
    # corrupted saved data must not break anything
    pg2 = newpage(b, "localStorage.setItem('mt2_calc_icon_v1','{\"fx\":\"a\"}');localStorage.setItem('mt2_calc_win_v1','nope');localStorage.setItem('mt2_calc_history_v1','[1,{\"e\":2},{\"e\":\"1+1\",\"r\":\"2\"}]');localStorage.setItem('mt2_calc_hidden_until_v1','abc')")
    pg2.get_by_label("Open calculator").click(); pg2.get_by_label("History").click(); ok(pg2.locator(".calc__h").count() == 1 and pg2.locator(".calc").is_visible(), "bad saved values fall back to defaults; only the valid history row is kept")
    ok(not errs, "no console errors: " + "; ".join(errs[:3]))
    b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); raise SystemExit(1 if fails else 0)
