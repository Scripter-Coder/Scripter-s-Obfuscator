"""Run the Storage Keeper service behind a Cloudflare Tunnel.

Why this exists
---------------
Executors run on your friends' phones and PCs. They cannot reach this machine - it sits
behind a router with no public IP. The tunnel is the bridge: Cloudflare gives the service
a public HTTPS address and holds the connection open, so the worker can fetch bytes
without ever touching your NAT.

Two modes, and the difference matters:

``--quick`` (default)
    ``cloudflared tunnel --url ...`` No login, no domain. Cloudflare hands out a random
    ``*.trycloudflare.com`` address.

    GOOD FOR: proving the whole path works end to end.
    THE CATCH: the address CHANGES every time the tunnel restarts. A worker holding an
    old ``SH_STORE_URL`` will simply stop finding the service after a reboot - and the
    symptom is every script failing at once, with the service sitting right there on
    disk looking perfectly healthy. Read the printed warning before relying on it.

``--named NAME``
    A tunnel with a fixed hostname you choose. Survives restarts. Requires a
    one-time ``cloudflared tunnel login`` and a domain in your Cloudflare account.

TOKEN PERSISTENCE
The token is generated once and written to ``data/token.txt``, then reused. Generating a
fresh one per run would be the obvious simplification and it is a trap: the worker holds
one copy, so a restart would lock the service out of its own worker and every script
would stop delivering until someone reconfigured it by hand.

VERIFIED BEFORE ANNOUNCING
The launcher does not print "ready" until it has fetched ``/v1/health`` THROUGH the
public tunnel address. A tunnel that is up but not actually routing is worse than one
that failed to start, because it looks fine.
"""

from __future__ import annotations

import argparse
import atexit
import hashlib
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
TOKEN_FILE = DATA / "token.txt"
URL_FILE = DATA / "tunnel-url.txt"

TUNNEL_URL_RE = re.compile(r"https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com")
READY_TIMEOUT = 90


def log(msg: str) -> None:
    print(f"[keeper] {msg}", flush=True)


def find_cloudflared() -> str | None:
    """Look in PATH first, then the standard install location, then winget's."""
    from shutil import which

    found = which("cloudflared")
    if found:
        return found
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "cloudflared" / "cloudflared.exe",
        Path.home() / "AppData/Local/Programs/cloudflared/cloudflared.exe",
        Path("C:/Program Files/cloudflared/cloudflared.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return None


def load_or_create_token() -> tuple[str, str]:
    """One token, persisted, reused. See the module docstring for why.

    Returns the token AND where it came from, because the operator has to be able to tell
    those apart. Reporting "generated" for a token that was in fact reused from disk is
    worse than useless: it invites someone to re-paste a token into the worker when the
    existing one is still correct, and it hides the one case that really matters - a
    genuinely fresh token, which means every script stops delivering until the worker's
    copy is updated by hand.
    """
    DATA.mkdir(parents=True, exist_ok=True)
    if TOKEN_FILE.is_file():
        existing = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if existing:
            return existing, "reused from " + str(TOKEN_FILE)
    token = os.environ.get("SH_STORE_TOKEN")
    if token:
        return token, "from SH_STORE_TOKEN"
    token = secrets.token_urlsafe(32)
    TOKEN_FILE.write_text(token, encoding="utf-8")
    try:
        # Windows only. POSIX gets 0600 from a plain write.
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        pass
    return token, "generated, saved to " + str(TOKEN_FILE)


def start_service(port: int, token: str, root: Path) -> subprocess.Popen:
    """The storage service, in its own process so a crash is visible, not swallowed."""
    env = dict(os.environ)
    env.update({
        "SH_STORE_ROOT": str(root),
        "SH_STORE_PORT": str(port),
        "SH_STORE_HOST": "127.0.0.1",
        "SH_STORE_TOKEN": token,
        "SH_STORE_LOG": "INFO",
    })
    proc = subprocess.Popen(
        [sys.executable, str(HERE / "run.py")],
        env=env, cwd=str(HERE.parent),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )

    def pump() -> None:
        # Without draining, a chatty service fills its pipe buffer and blocks.
        assert proc.stdout is not None
        for line in proc.stdout:
            if "token" in line.lower() and "SH_STORE_TOKEN" not in line:
                continue  # never echo the token back into the console log
            sys.stdout.write("  " + line)
            sys.stdout.flush()

    threading.Thread(target=pump, daemon=True).start()
    return proc


def wait_for_local(port: int, timeout: int = 30) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/health", timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def start_quick_tunnel(exe: str, port: int) -> tuple[subprocess.Popen, str | None]:
    """Run `cloudflared tunnel --url` and scrape the assigned address out of its log."""
    proc = subprocess.Popen(
        [exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    found: list[str] = []

    def scrape() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write("  " + line)
            sys.stdout.flush()
            m = TUNNEL_URL_RE.search(line)
            if m and not found:
                found.append(m.group(0))

    threading.Thread(target=scrape, daemon=True).start()
    deadline = time.time() + 60
    while time.time() < deadline and not found:
        if proc.poll() is not None:
            raise SystemExit("cloudflared exited before assigning an address")
        time.sleep(0.5)
    return proc, (found[0] if found else None)


def start_named_tunnel(exe: str, name: str, hostname: str | None) -> subprocess.Popen:
    cmd = [exe, "tunnel", "run", name]
    if hostname:
        # Set the public hostname to the local service, then run it.
        subprocess.run([exe, "tunnel", "route", "dns", name, hostname], check=False)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    def pump() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write("  " + line)
            sys.stdout.flush()

    threading.Thread(target=pump, daemon=True).start()
    return proc


def verify_through_tunnel(base: str, token: str, timeout: int = READY_TIMEOUT) -> bool:
    """Fetch /v1/health over the PUBLIC address.

    A tunnel that started but is not routing looks identical from the laptop - the
    service answers on loopback either way. Only an external fetch proves the path the
    worker will actually use.
    """
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base + "/v1/health")
            req.add_header("Authorization", f"Bearer {token}")
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200:
                    return True
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
        except Exception as e:
            last = str(e)
        time.sleep(2)
    log(f"could not reach the service through the tunnel ({last})")
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=int(os.environ.get("SH_STORE_PORT", "8787")))
    ap.add_argument("--root", type=Path, default=DATA)
    ap.add_argument("--mode", choices=["quick", "named"], default="quick")
    ap.add_argument("--name", default="scripterhub-keeper", help="named tunnel name")
    ap.add_argument("--hostname", default=None,
                    help="public hostname for --mode named, e.g. keeper.example.com")
    ap.add_argument("--no-verify", action="store_true",
                    help="skip the external health check (not recommended)")
    args = ap.parse_args()

    exe = find_cloudflared()
    if not exe:
        print("cloudflared is not installed.\n"
              "  winget install --id Cloudflare.cloudflared\n"
              "  or download cloudflared-windows-amd64.exe from the releases page and put it on PATH.",
              file=sys.stderr)
        return 1
    log(f"cloudflared: {exe}")

    token, token_source = load_or_create_token()
    log(f"token: {token_source}")
    # A fingerprint, NOT the token. The question this answers is "is the worker still
    # holding the same secret?", which is asked every single time the service restarts
    # and which nobody should have to answer by opening a file and reading a credential.
    # Eight hex characters of SHA-256 cannot be turned back into the token, and a
    # mismatch here is the earliest possible warning that every script is about to fail.
    log(f"token fingerprint: {hashlib.sha256(token.encode()).hexdigest()[:8]}")
    # A fresh token invalidates the copy the worker already holds, and the symptom is
    # every script failing at once with the service healthy on disk. Say so loudly and
    # only in that case - a reused token needs no warning, and crying wolf here trains
    # the operator to ignore the one message that matters.
    if token_source.startswith("generated"):
        print()
        print("  " + "*" * 64)
        print("  A NEW TOKEN was just generated. The worker still holds the OLD one.")
        print("  Every script will fail until you update SH_STORE_TOKEN on the worker")
        print("  with the value printed below.")
        print("  " + "*" * 64)
        print()

    service = start_service(args.port, token, args.root)
    atexit.register(lambda: service.terminate())
    if not wait_for_local(args.port):
        log("the storage service never came up on loopback")
        return 1
    log(f"service is up on 127.0.0.1:{args.port}")

    tunnel = None
    base: str | None = None
    if args.mode == "quick":
        tunnel, base = start_quick_tunnel(exe, args.port)
        if not base:
            log("the quick tunnel did not report an address")
            return 1
    else:
        if not args.hostname:
            print("--mode named needs --hostname", file=sys.stderr)
            return 1
        tunnel = start_named_tunnel(exe, args.name, args.hostname)
        base = f"https://{args.hostname}"

    atexit.register(lambda: tunnel.terminate())

    log(f"tunnel address: {base}")
    if not args.no_verify:
        log("verifying the service is reachable through the PUBLIC address...")
        if not verify_through_tunnel(base, token):
            return 1
        log("verified end to end")

    URL_FILE.write_text(base + "\n", encoding="utf-8")

    print()
    print("=" * 68)
    print("  Storage Keeper is live and reachable from anywhere.")
    print("=" * 68)
    print(f"  public address : {base}")
    print(f"  bearer token   : {token}")
    print()
    print("  Set these on the Cloudflare worker:")
    print(f"    SH_STORE_URL    (Text)    {base}")
    print(f"    SH_STORE_TOKEN  (Secret)  {token}")
    print()
    if args.mode == "quick":
        print("  WARNING - quick tunnel")
        print("  This address is RANDOM and CHANGES every restart. The worker will lose")
        print("  the service after a reboot and every script will fail at once, while the")
        print("  service still looks healthy on disk. For anything you depend on, use a")
        print("  named tunnel instead:")
        print("    cloudflared tunnel login")
        print(f'    cloudflared tunnel create {args.name}')
        print(f'    cloudflared tunnel route dns {args.name} keeper.YOUR-DOMAIN')
        print(f"    py Storage Keeper/tunnel.py --mode named --name {args.name} --hostname keeper.YOUR-DOMAIN")
    print()
    print("  Both processes must stay running for delivery to work. Ctrl-C stops them.")
    print("=" * 68)
    print()

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
    except (ValueError, AttributeError):
        pass

    try:
        while not stop.is_set():
            if service.poll() is not None:
                log("the storage service exited; shutting down")
                break
            if tunnel.poll() is not None:
                log("the tunnel exited; shutting down")
                break
            stop.wait(1)
    finally:
        for proc in (tunnel, service):
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
    return 0


if __name__ == "__main__":
    sys.exit(main())