import os
import sys
import json
import time
import http.server
import socketserver
import threading
from playwright.sync_api import sync_playwright

PORT = 8089
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    server = socketserver.TCPServer(("127.0.0.1", PORT), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

JS_EXTRACTOR = """
() => {
    const propNames = new Set();
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of sheet.cssRules) {
                if (rule.style) {
                    for (let i = 0; i < rule.style.length; i++) {
                        const name = rule.style[i];
                        if (name.startsWith('--')) propNames.add(name);
                    }
                }
            }
        } catch (e) {}
    }
    const compHtml = getComputedStyle(document.documentElement);
    for (let i = 0; i < compHtml.length; i++) {
        const name = compHtml[i];
        if (name.startsWith('--')) propNames.add(name);
    }
    if (document.body) {
        const compBody = getComputedStyle(document.body);
        for (let i = 0; i < compBody.length; i++) {
            const name = compBody[i];
            if (name.startsWith('--')) propNames.add(name);
        }
    }

    function extractFrom(el) {
        if (!el) return {};
        const style = getComputedStyle(el);
        const res = {};
        for (const name of Array.from(propNames).sort()) {
            const val = style.getPropertyValue(name).trim();
            if (val) {
                res[name] = val;
            }
        }
        return res;
    }

    return {
        html: extractFrom(document.documentElement),
        body: extractFrom(document.body)
    };
}
"""

TARGETS = [
    {
        "id": "money",
        "path": "/apps/money/index.html",
        "out": "baseline-money.json"
    },
    {
        "id": "health",
        "path": "/apps/health/index.html",
        "out": "baseline-health.json"
    },
    {
        "id": "english-tracker",
        "path": "/english-tracker.html",
        "out": "baseline-english-tracker.json"
    },
    {
        "id": "garments",
        "path": "/garments-accounts.html",
        "out": "baseline-garments.json"
    }
]

def dump(prefix="baseline"):
    server = start_server()
    out_dir = os.path.dirname(os.path.abspath(__file__))

    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        context = browser.new_context()
        context.route("**/login.html*", lambda route: route.abort())

        for t in TARGETS:
            page = context.new_page()
            page.add_init_script("window.goLogin = function(){};")
            url = f"http://127.0.0.1:{PORT}{t['path']}"
            page.goto(url, wait_until="domcontentloaded")
            # Wait a tick for stylesheets to load and attach
            page.wait_for_load_state("load")
            time.sleep(0.2)

            # 1. Light mode
            page.evaluate("() => { document.documentElement.removeAttribute('data-theme'); }")
            time.sleep(0.1)
            light_styles = page.evaluate(JS_EXTRACTOR)

            # 2. Dark mode
            page.evaluate("() => { document.documentElement.setAttribute('data-theme', 'dark'); }")
            time.sleep(0.1)
            dark_styles = page.evaluate(JS_EXTRACTOR)

            page_data = {
                "page": t["path"],
                "light": {
                    "html": light_styles["html"],
                    "body": light_styles["body"]
                },
                "dark": {
                    "html": dark_styles["html"],
                    "body": dark_styles["body"]
                }
            }

            filename = f"{prefix}-{t['id']}.json" if prefix != "baseline" else t["out"]
            out_path = os.path.join(out_dir, filename)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(page_data, f, indent=2)

            results[t["id"]] = page_data
            print(f"Dumped {filename} (html props: {len(light_styles['html'])}, body props: {len(light_styles['body'])})")

            page.close()

        browser.close()
    server.shutdown()
    return results

def diff(baseline_prefix="baseline", after_prefix="after"):
    out_dir = os.path.dirname(os.path.abspath(__file__))
    diffs = {}
    for t in TARGETS:
        b_file = os.path.join(out_dir, f"baseline-{t['id']}.json")
        a_file = os.path.join(out_dir, f"{after_prefix}-{t['id']}.json")
        if not os.path.exists(b_file) or not os.path.exists(a_file):
            print(f"Skipping {t['id']}: missing file {b_file} or {a_file}")
            continue
        with open(b_file, "r", encoding="utf-8") as f:
            b_data = json.load(f)
        with open(a_file, "r", encoding="utf-8") as f:
            a_data = json.load(f)

        target_diffs = []
        for mode in ["light", "dark"]:
            for el in ["html", "body"]:
                b_props = b_data[mode][el]
                a_props = a_data[mode][el]
                all_keys = sorted(set(b_props.keys()) | set(a_props.keys()))
                for k in all_keys:
                    b_val = b_props.get(k)
                    a_val = a_props.get(k)
                    if b_val != a_val:
                        target_diffs.append({
                            "mode": mode,
                            "element": el,
                            "prop": k,
                            "before": b_val,
                            "after": a_val
                        })
        diffs[t["id"]] = target_diffs

    print("\n--- DIFF SUMMARY ---")
    total_diffs = 0
    for tid, td in diffs.items():
        if not td:
            print(f"[{tid}] 0 differences (IDENTICAL)")
        else:
            print(f"[{tid}] {len(td)} differences:")
            for d in td:
                print(f"  - {d['mode']} <{d['element']}> {d['prop']}: '{d['before']}' -> '{d['after']}'")
            total_diffs += len(td)
    print(f"Total differences across all pages: {total_diffs}")
    return diffs

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "baseline"
    if action == "diff":
        diff()
    else:
        dump(action)
