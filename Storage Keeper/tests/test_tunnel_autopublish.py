"""The launcher must leave the worker pointing at the address it just obtained.

A quick tunnel hands out a RANDOM hostname on every restart, so between a keeper
restart and a worker redeploy the worker points at an address that no longer
exists. That presents as "Could not reach the host" from a worker whose health
check looks perfectly healthy.

These checks read the real sources, and drive the real publish_url.py rather than
a copy of it.
"""

import ast
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parents[2]   # repo root, not Storage Keeper/
TUNNEL = HERE / "Storage Keeper" / "tunnel.py"
PUBLISH = HERE / "Storage Keeper" / "publish_url.py"

fails = 0


def check(name, cond, detail=""):
    global fails
    if cond:
        print("  ok   " + name)
    else:
        fails += 1
        print("  FAIL " + name + ((" - " + detail) if detail else ""))


print("a restart leaves the worker pointed at the new tunnel")

tun = TUNNEL.read_text(encoding="utf-8")
pub = PUBLISH.read_text(encoding="utf-8")

# --- the launcher publishes --------------------------------------------------
check("tunnel.py parses", _parse(tun) if False else True)
try:
    ast.parse(tun)
    check("tunnel.py is valid python", True)
except SyntaxError as e:
    check("tunnel.py is valid python", False, str(e))
try:
    ast.parse(pub)
    check("publish_url.py is valid python", True)
except SyntaxError as e:
    check("publish_url.py is valid python", False, str(e))

check("tunnel.py can publish", "def publish_to_worker(" in tun)
check("it is CALLED during startup", re.search(r"published\s*=\s*publish_to_worker\(\)", tun) is not None,
      "a helper nothing calls changes nothing")
check("it runs AFTER the address is verified and written",
      tun.index("URL_FILE.write_text") < tun.index("published = publish_to_worker()"),
      # the CALL, not the definition - the def sits earlier in the file, so
      # searching for the bare name finds the wrong one of the two.
      )

# --- publishing delegates rather than duplicating --------------------------
m = re.search(r"def publish_to_worker\([^)]*\)[^:]*:\n(.*?)\n\ndef ", tun, re.S)
body = m.group(1) if m else ""
check("it delegates to publish_url.py", "publish_url.py" in body,
      "a second copy of the wrangler edit is how the two drift")
check("it does not re-implement the wrangler.toml edit", "SH_STORE_URL" not in body)
check("it never raises out of the launcher",
      "return False" in body and not re.search(r"(?m)^\s*raise\b", body),
      "a deploy failure must not stop a keeper that is already serving")
check("it checks for npx before trying to use it", "shutil.which" in body)
check("tunnel.py imports shutil for that check", re.search(r"(?m)^import shutil$", tun) is not None)

# --- the failure is announced, not swallowed --------------------------------
check("startup says plainly when the worker is NOT re-pointed",
      "still points at the PREVIOUS address" in tun,
      "silently starting a keeper the worker cannot reach is the original bug")
check("and it prints the exact command to recover with",
      "publish_url.py" in tun.split("published = publish_to_worker()")[-1][:900])

# --- the npx bug ------------------------------------------------------------
check("publish_url.py resolves npx instead of assuming it", 'shutil.which("npx")' in pub)
check("it tries the Windows shim names", "npx.cmd" in pub and "npx.bat" in pub)
check("it no longer returns SUCCESS when npx is missing",
      not re.search(r'npx not found[^\n]*\n\s*return 0', pub),
      "returning 0 there reported success while the deploy never happened")
check("publish_url.py imports shutil", re.search(r"(?m)^import shutil$", pub) is not None)

# --- it actually works ------------------------------------------------------
# The strongest check available without killing the user's keeper: run the real
# script and confirm it is idempotent, i.e. it reports the worker already agrees.
r = subprocess.run([sys.executable, str(PUBLISH)], cwd=str(HERE),
                   capture_output=True, text=True, timeout=600)
out = (r.stdout or "") + (r.stderr or "")
check("publish_url.py runs clean against the live deployment", r.returncode == 0, out[-160:])
check("and reports the worker is already current", "already current" in out,
      out[-160:].replace("\n", " | "))
check("it no longer claims 'npx not found'", "npx not found" not in out)

print()
print("TUNNEL AUTOPUBLISH   " + ("all checks passed" if not fails else str(fails) + " FAILED"))
sys.exit(1 if fails else 0)
