#!/usr/bin/env python3
"""
Pull photos out of Google Photos onto disk, by search term and date.

Google removed the Photos Library API read scopes on 2025-03-31, so no API or
connector can list an existing library any more. This drives a real, logged-in
Chrome instead: it copies the auth bits of a Chrome profile into a throwaway
user-data-dir, launches a second Chrome on it with remote debugging, runs the
search, and triggers Google's own Shift+D download for each hit. That yields
true originals with filenames and EXIF intact.

Your everyday Chrome is never touched, and the profile copy (which holds live
session cookies) is deleted on exit.

Usage
  python3 scripts/gphotos-grab.py notebook --since 2026-09-01 --out ./notebook-photos
  python3 scripts/gphotos-grab.py "genghis khan" --profile Default --limit 20

Requires: websocket-client (pip3 install websocket-client), macOS Chrome.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time
import urllib.parse, urllib.request
from datetime import datetime

try:
    import websocket  # websocket-client
except ImportError:
    sys.exit("pip3 install websocket-client")

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_DIR = os.path.expanduser("~/Library/Application Support/Google/Chrome")
# Only the files needed to carry the login; skips the multi-GB caches.
AUTH_FILES = ["Cookies", "Login Data", "Preferences", "Secure Preferences",
              "Web Data", "Local Storage", "Session Storage", "Network"]


class Page:
    """Minimal Chrome DevTools Protocol client."""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=60,
                                              suppress_origin=True, max_size=None)
        self.i = 0

    def send(self, method, **params):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.i:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m.get("result", {})

    def js(self, expr):
        r = self.send("Runtime.evaluate", expression=expr,
                      returnByValue=True, awaitPromise=True)
        return r.get("result", {}).get("value")

    def goto(self, url):
        self.send("Page.navigate", url=url)

    def key(self, vk, name, modifiers=0, text=None):
        base = dict(key=name, code=name, windowsVirtualKeyCode=vk,
                    nativeVirtualKeyCode=vk, modifiers=modifiers)
        self.send("Input.dispatchKeyEvent", type="keyDown", **(
            dict(base, text=text) if text else base))
        self.send("Input.dispatchKeyEvent", type="keyUp", **base)


def list_profiles():
    state = json.load(open(os.path.join(CHROME_DIR, "Local State")))
    return state.get("profile", {}).get("info_cache", {})


def stage_profile(profile, workdir):
    """Copy just enough of the Chrome profile to carry the Google login."""
    dst = os.path.join(workdir, "prof")
    os.makedirs(os.path.join(dst, "Default"), exist_ok=True)
    shutil.copy(os.path.join(CHROME_DIR, "Local State"), os.path.join(dst, "Local State"))
    src = os.path.join(CHROME_DIR, profile)
    for f in AUTH_FILES:
        s = os.path.join(src, f)
        if os.path.exists(s):
            d = os.path.join(dst, "Default", f)
            (shutil.copytree if os.path.isdir(s) else shutil.copy)(s, d)
    return dst


def launch(profile_dir, port):
    proc = subprocess.Popen(
        [CHROME, f"--remote-debugging-port={port}", f"--user-data-dir={profile_dir}",
         "--profile-directory=Default", "--no-first-run", "--no-default-browser-check",
         "--no-sync", "--remote-allow-origins=*",
         "--window-size=1400,1000", "--window-position=60,60",
         "https://photos.google.com/"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(30):
        time.sleep(1)
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            return proc
        except Exception:
            pass
    proc.kill()
    sys.exit("Chrome did not expose a debugging port")


def attach(port, match="photos.google.com"):
    pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list"))
    pages = [t for t in pages if t.get("type") == "page"]
    for t in pages:
        if match in t.get("url", ""):
            return Page(t["webSocketDebuggerUrl"])
    return Page(pages[0]["webSocketDebuggerUrl"])


def collect(p, term):
    """Return [{key,label,date}] for every tile the search turned up."""
    p.goto(f"https://photos.google.com/search/{urllib.parse.quote(term)}")
    time.sleep(8)
    for _ in range(6):                       # the grid loads lazily
        p.js("window.scrollBy(0, window.innerHeight*1.5)")
        time.sleep(2)
    raw = p.js("""
    (()=>{const o=[];document.querySelectorAll('a[href*="/photo/"]').forEach(a=>{
      const k=(a.getAttribute('href')||'').split('/photo/')[1]||'';
      let l=a.getAttribute('aria-label')||'';
      if(!l){const d=a.querySelector('[aria-label]'); if(d) l=d.getAttribute('aria-label');}
      o.push({k:k,l:l});});return JSON.stringify(o);})()
    """)
    out, seen = [], set()
    for it in json.loads(raw or "[]"):
        k = it["k"].split("?")[0]
        if not k or k in seen:
            continue
        seen.add(k)
        m = re.search(r"-\s*([A-Z][a-z]{2} \d{1,2}, \d{4})", it["l"])
        d = None
        if m:
            try:
                d = datetime.strptime(m.group(1), "%b %d, %Y").date()
            except ValueError:
                pass
        out.append({"key": k, "label": it["l"], "date": d})
    return out


def download(p, items, outdir):
    """Trigger Google's own Shift+D download for each item; returns filenames."""
    os.makedirs(outdir, exist_ok=True)
    p.send("Browser.setDownloadBehavior", behavior="allow",
           downloadPath=os.path.abspath(outdir), eventsEnabled=True)
    got, missed = [], []
    for i, it in enumerate(items, 1):
        before = set(os.listdir(outdir))
        p.goto(f"https://photos.google.com/photo/{it['key']}")
        time.sleep(5)
        p.key(68, "KeyD", modifiers=8, text="D")     # Shift+D = download
        name = None
        for _ in range(30):
            time.sleep(1)
            new = [f for f in set(os.listdir(outdir)) - before
                   if not f.endswith(".crdownload")]
            if new:
                name = new[0]
                break
        if name:
            got.append(name)
            print(f"  [{i}/{len(items)}] {name}", flush=True)
        else:
            # Usually means the file was already pulled in an earlier run.
            missed.append(it["key"])
            print(f"  [{i}/{len(items)}] no new file (already have it?)", flush=True)
    return got, missed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("term", nargs="?", help="Google Photos search term, e.g. notebook")
    ap.add_argument("--out", default="./gphotos-out")
    ap.add_argument("--profile", default="Default",
                    help="Chrome profile dir; --list-profiles to see them")
    ap.add_argument("--since", help="only photos on/after YYYY-MM-DD")
    ap.add_argument("--until", help="only photos on/before YYYY-MM-DD")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--port", type=int, default=9333)
    ap.add_argument("--list-profiles", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="list what matched without downloading")
    a = ap.parse_args()

    if a.list_profiles:
        for k, v in sorted(list_profiles().items()):
            print(f"  {k:12} {v.get('user_name') or '(not signed in)'}")
        return
    if not a.term:
        ap.error("a search term is required (or use --list-profiles)")

    work = tempfile.mkdtemp(prefix="gphotos-")
    proc = None
    try:
        print(f"staging profile {a.profile!r} ...")
        prof = stage_profile(a.profile, work)
        print("launching debug Chrome ...")
        proc = launch(prof, a.port)
        p = attach(a.port)
        p.send("Page.enable")
        time.sleep(2)

        who = p.js("""(()=>{const m=document.body.innerHTML.match(
                       /[\\w.+-]+@[\\w.-]+\\.\\w+/);return m?m[0]:'';})()""")
        if not who:
            sys.exit("Not signed in — pick another --profile (see --list-profiles)")
        print(f"signed in as {who}")

        items = collect(p, a.term)
        print(f"search {a.term!r}: {len(items)} results")

        def keep(it):
            if not it["date"]:
                return not (a.since or a.until)
            if a.since and it["date"] < datetime.strptime(a.since, "%Y-%m-%d").date():
                return False
            if a.until and it["date"] > datetime.strptime(a.until, "%Y-%m-%d").date():
                return False
            return True

        items = [i for i in items if keep(i)]
        if a.limit:
            items = items[:a.limit]
        print(f"after date filter: {len(items)}")

        if a.dry_run:
            for it in items:
                print("   ", it["date"], it["label"][:60])
            return

        got, missed = download(p, items, a.out)
        print(f"\ndownloaded {len(got)} -> {a.out}")
        if missed:
            print(f"{len(missed)} produced no new file (likely already present)")
        print("\nNote: Google's search is an ML classifier — spot-check the results. "
              "It both misses frames and returns the occasional false positive.")
    finally:
        if proc:
            proc.kill()
        # The staged copy holds live session cookies; never leave it behind.
        shutil.rmtree(work, ignore_errors=True)
        print("cleaned up staged profile")


if __name__ == "__main__":
    main()
