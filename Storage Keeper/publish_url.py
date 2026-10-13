# Storage Keeper/publish_url.py
#
# Keep the worker's SH_STORE_URL pointing at the live tunnel.
#
# WHY THIS EXISTS
#
# `cloudflared tunnel --url` hands out a RANDOM hostname every time it starts.
# The worker cannot follow that on its own, so between a keeper restart and a
# worker redeploy the worker is pointing at an address that no longer exists
# and every PC-stored script fails - which the delivery gate reports as
# "SHERR gone", a message that says the script does not exist.
#
# That is not hypothetical. It happened twice while building the host
# obfuscation path, and it is the single most likely reason a user will
# report "it worked yesterday".
#
# keeper_autostart.py already rewrites data/tunnel-url.txt. This reads THAT
# file and updates the worker, so the address is published the moment it
# changes instead of at the next manual deploy.
#
# Usage:
#   py "Storage Keeper/publish_url.py"            # publish if changed
#   py "Storage Keeper/publish_url.py" --check    # report, change nothing
#
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
URL_FILE = HERE / "data" / "tunnel-url.txt"
TOML = ROOT / "wrangler.toml"

# Matches the SH_STORE_URL assignment so the rest of the file - including every
# comment explaining why it changes - is preserved byte for byte.
ASSIGN = re.compile(r'^(SH_STORE_URL\s*=\s*)"([^"]*)"(.*)$', re.M)


def current_toml_url() -> str | None:
    if not TOML.is_file():
        return None
    m = ASSIGN.search(TOML.read_text(encoding="utf-8"))
    return m.group(2) if m else None


def live_tunnel_url() -> str | None:
    if not URL_FILE.is_file():
        return None
    value = URL_FILE.read_text(encoding="utf-8").strip()
    return value if value.startswith("https://") else None


def write_toml_url(url: str) -> bool:
    text = TOML.read_text(encoding="utf-8")
    updated, n = ASSIGN.subn(lambda m: f'{m.group(1)}"{url}"{m.group(3)}', text, count=1)
    if n == 0:
        return False
    TOML.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, change nothing")
    args = ap.parse_args()

    live = live_tunnel_url()
    if not live:
        print("no tunnel address in data/tunnel-url.txt - start the keeper first")
        return 1
    current = current_toml_url()
    print("live tunnel : " + live)
    print("wrangler    : " + str(current))
    if live == current:
        print("already current")
        return 0
    if args.check:
        print("DRIFTED (run without --check to fix)")
        return 2

    if not write_toml_url(live):
        print("could not find SH_STORE_URL in wrangler.toml")
        return 1
    print("updated wrangler.toml")

    # Deploy so the worker starts using it. A tunnel that is live but that the
    # worker has not been told about is still a broken configuration.
    try:
        subprocess.run(["npx", "wrangler", "deploy"], cwd=str(ROOT), check=True)
    except FileNotFoundError:
        print("npx not found - wrangler.toml updated; deploy the worker by hand")
        return 0
    except subprocess.CalledProcessError as e:
        print("deploy failed (%s) - wrangler.toml updated, deploy by hand" % e.returncode)
        return 1
    print("deployed")
    return 0


if __name__ == "__main__":
    sys.exit(main())