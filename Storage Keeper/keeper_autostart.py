"""Bring the Storage Keeper up, unattended.

Why this exists
---------------
Obfuscation runs entirely in the browser and has never needed the tunnel. What needs the
tunnel is PUBLISHING and DELIVERY: the worker moves script bytes onto this PC through it.
Running `py "Storage Keeper/tunnel.py"` by hand broke publishing four times, because
closing the window kills the service AND a quick tunnel issues a new random address on
every start, leaving the worker pointing at an address that no longer exists.

So this does the whole sequence with nobody watching:

    1. if a tunnel is already live, reuse it - do NOT start a second one
    2. otherwise start the service + tunnel in the background
    3. WAIT until the public address actually answers
    4. deploy the worker pointed at that address

Step 3 is the one that matters, and the earlier batch version got it wrong twice.

WHAT WENT WRONG, AND WHY THIS IS PYTHON INSTEAD OF BATCH
---------------------------------------------------------
A fresh *.trycloudflare.com hostname takes roughly 30-60 s to resolve from a resolver that
has not seen it. During development the service answered on 127.0.0.1, cloudflared
reported readyConnections:1, and every external fetch still failed - then all of it
worked seconds later with neither process changed.

The batch version polled by spawning PowerShell thirty times, which costs about a second
each, so it burned its whole budget before DNS caught up and then looked like a hang. It
also failed its own "is it already up" check and started a SECOND tunnel over a healthy
one.

Both are the wrong tool for this. One Python process, one poll loop, HTTP done with
urllib - no shell quoting between three languages, and it is testable.

Run: py "Storage Keeper/keeper_autostart.py"
     py "Storage Keeper/keeper_autostart.py" --timeout 300
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
URL_FILE = HERE / "data" / "tunnel-url.txt"
TUNNEL_PY = HERE / "tunnel.py"


def log(msg: str) -> None:
    print(f"[keeper] {msg}", flush=True)


def read_url() -> str | None:
    try:
        if URL_FILE.is_file():
            v = URL_FILE.read_text(encoding="utf-8").strip()
            return v or None
    except OSError:
        pass
    return None


def alive(base: str, timeout: float = 6.0) -> bool:
    """Is this public address serving the keeper right now?

    Deliberately does NOT follow redirects and does not care about the body beyond
    status 200: this is a liveness probe, and a slow or chatty check here is what turned
    a 30-second DNS wait into an apparent hang.
    """
    if not base:
        return False
    req = urllib.request.Request(base.rstrip("/") + "/v1/health")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status == 200
    except urllib.error.HTTPError as e:
        return e.code == 200
    except Exception:
        return False


def port_busy(host: str = "127.0.0.1", port: int = 8787) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.5)
        return s.connect_ex((host, port)) == 0


def service_running() -> bool:
    """Is our own storage service listening locally?

    Checked separately from the tunnel because the two fail independently, and telling
    them apart is the difference between "wait longer" and "go look at the logs".
    """
    req = urllib.request.Request("http://127.0.0.1:8787/v1/health")
    try:
        with urllib.request.urlopen(req, timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def start_tunnel() -> subprocess.Popen:
    log("starting the storage service and tunnel (background)")
    # CREATE_NO_WINDOW so a scheduled task does not flash a console at the user at login.
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.Popen(
        [sys.executable, str(TUNNEL_PY)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=flags,
    )


def wait_for_tunnel(timeout: int) -> str | None:
    """Poll until the public address answers. Returns it, or None on timeout."""
    deadline = time.time() + timeout
    announced = False
    last_seen = None
    while time.time() < deadline:
        url = read_url()
        if url and url != last_seen:
            # A new tunnel rewrites the file; say so once so a stale address being
            # replaced is visible rather than mysterious.
            if announced:
                log("address changed to " + url + " (tunnel restarted)")
            last_seen = url
        if url and alive(url):
            if not announced:
                log("tunnel is live: " + url)
            return url
        if not announced:
            local = "service up" if service_running() else "service NOT up yet"
            log(f"waiting for the tunnel to route and DNS to settle ({local})...")
            announced = True
        time.sleep(3)
    return None


def write_url(url: str) -> bool:
    """Point wrangler.toml at this address.

    MISSING IN THE FIRST PYTHON VERSION, and it is the step that matters most. The batch
    script this replaced called update-keeper-url.cmd, which did the rewrite; rewriting it
    in Python without carrying that step over produced a deploy that SUCCEEDED while
    wrangler.toml still held the previous, dead address. The symptom is the worst kind:
    "Deployed scripterhub-stats" in the log, and publishing still broken.

    Only the SH_STORE_URL line is touched. The value is validated as an https URL first,
    so a corrupt or empty tunnel-url.txt cannot end up written into the deployment config.
    """
    if not url.startswith("https://"):
        log(f"refusing to write a non-https address into wrangler.toml: {url!r}")
        return False
    toml = ROOT / "wrangler.toml"
    try:
        text = toml.read_text(encoding="utf-8")
    except OSError as e:
        log(f"could not read wrangler.toml: {e}")
        return False

    import re
    pattern = re.compile(r"(?m)^(SH_STORE_URL\s*=\s*)(\"[^\"]*\"|'[^']*')")
    if not pattern.search(text):
        log("wrangler.toml has no SH_STORE_URL line - add one under [vars] or deploy will")
        log("silently fall back to Cloudflare KV and nothing will be stored on the PC.")
        return False

    updated = pattern.sub(lambda m: m.group(1) + '"' + url + '"', text, count=1)
    if updated == text:
        log("wrangler.toml already points at this address")
        return True
    try:
        toml.write_text(updated, encoding="utf-8", newline="\n")
    except OSError as e:
        log(f"could not write wrangler.toml: {e}")
        return False
    log(f"wrangler.toml SH_STORE_URL -> {url}")
    return True


def deploy(url: str) -> bool:
    if not write_url(url):
        return False
    log("deploying the worker")
    # npx is a .cmd shim on Windows, and subprocess will not resolve one from a bare argv
    # list - it reports "npx not found on PATH" while npx plainly IS on PATH. Naming the
    # shim explicitly is the fix. shell=True would also work but hands a command line to
    # cmd.exe, which is a needless thing to do with a path in it.
    npx = "npx.cmd" if os.name == "nt" else "npx"
    try:
        r = subprocess.run(
            [npx, "wrangler", "deploy"],
            cwd=str(ROOT), capture_output=True, text=True, timeout=600,
            # wrangler draws box characters in its banner. Without an explicit encoding
            # Python decodes the pipe as cp1252 and dies with a UnicodeDecodeError
            # *after* the deploy has already succeeded - so the deploy looked broken when
            # it was fine. errors="replace" because this output is only ever logged.
            encoding="utf-8", errors="replace",
        )
    except FileNotFoundError:
        log("npx not found on PATH - cannot deploy. Is Node installed?")
        return False
    except subprocess.TimeoutExpired:
        log("wrangler deploy timed out")
        return False
    if r.returncode != 0:
        tail = (r.stderr or r.stdout or "").strip().splitlines()[-6:]
        log("wrangler deploy FAILED:")
        for line in tail:
            log("    " + line)
        return False
    for line in (r.stdout or "").splitlines():
        if "Current Version ID" in line:
            log(line.strip())
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="Start the keeper and point the worker at it.")
    ap.add_argument("--timeout", type=int, default=150,
                    help="seconds to wait for the tunnel to answer (default 150)")
    ap.add_argument("--skip-deploy", action="store_true",
                    help="start the tunnel but do not touch the worker")
    ap.add_argument("--force-restart", action="store_true",
                    help="start a fresh tunnel even if one is already live")
    args = ap.parse_args()

    print()
    print("=" * 68)
    print("  ScripterHub keeper autostart")
    print("=" * 68)

    proc = None
    existing = read_url()

    if args.force_restart:
        log("--force-restart: ignoring any tunnel that is already live")
        existing = None
    elif existing and alive(existing):
        # The bug this replaces: the batch version's equivalent check failed and started a
        # SECOND tunnel over a healthy one, which is worse than doing nothing because two
        # quick tunnels compete and the worker ends up on whichever wrote the file last.
        log("a tunnel is already live, reusing it")
        url = existing
    else:
        if existing:
            log("a stale address is on disk but not answering; starting a fresh tunnel")
        if port_busy():
            # The service is up but the tunnel is not routing. tunnel.py owns the service
            # too, so starting it again is wrong; say what is actually wrong instead.
            log("port 8787 is already in use but no tunnel is answering.")
            log("A keeper process may be running with a dead tunnel. Close it, or run:")
            log('    py "Storage Keeper/keeper_autostart.py" --force-restart')
            return 1
        proc = start_tunnel()
        url = wait_for_tunnel(args.timeout)
        if not url:
            log("the tunnel never answered within " + str(args.timeout) + "s")
            log("the service and cloudflared are often both healthy while DNS still lags;")
            log("wait a minute and run this again. Nothing was deployed.")
            if proc and proc.poll() is None:
                proc.terminate()
            return 1

    if args.skip_deploy:
        log("--skip-deploy: stopping here, the worker was not touched")
        return 0

    if not deploy(url):
        log("the tunnel is live but the worker was NOT updated.")
        log("Publishing will keep using the OLD address until a deploy succeeds.")
        return 1

    print()
    print("=" * 68)
    print("  Ready. Publishing and delivery both point at this PC.")
    print(f"  {url}")
    print("=" * 68)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())