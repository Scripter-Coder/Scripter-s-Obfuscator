"""Storage Keeper HTTP service.

Design constraints that shape everything here:

* There is no filesystem path in the API. The only thing a caller names is a script id,
  and the id is matched against the same grammar the worker enforces before it is ever
  joined onto a directory. A "give me /foo/bar" parameter does not exist to be abused.
* Nothing internal is ever returned. Not a path, not an exception type, not a stack
  trace, not a row count, not a SQL string. Failures are logged here with detail and
  answered with a fixed body.
* A missing script and an expired script are the same answer, byte for byte. Otherwise
  the endpoint becomes a probe for which ids ever existed.
* Expiry is decided in the store, on read. This layer never decides it, never caches a
  "live" answer, and has no way to make an expired object servable.

Run it:  py Storage Keeper/run.py
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import re
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

from .config import GONE_BODY, Config
from .ids import ID_PATTERN, KIND_ARTIFACT, KIND_LOADER, InvalidId, validate_kind
from .store import Store

log = logging.getLogger("storage_keeper")

# Route patterns. Every one of them is anchored and closed - there is no catch-all and
# no wildcard, so an unrecognised path cannot fall through to something unintended.
ROUTE_PUT = re.compile(r"^/v1/objects/(ScripterHub[0-9]{6,16})$")
ROUTE_GET = re.compile(r"^/v1/objects/(ScripterHub[0-9]{6,16})$")
ROUTE_META = re.compile(r"^/v1/objects/(ScripterHub[0-9]{6,16})/meta$")
ROUTE_STATS = re.compile(r"^/v1/admin/stats$")
ROUTE_OBJECTS = re.compile(r"^/v1/admin/objects$")
ROUTE_SWEEP = re.compile(r"^/v1/admin/sweep$")
ROUTE_HEALTH = re.compile(r"^/v1/health$")
# Host-side obfuscation. NEW. The browser cannot compile a large script - a
# 6000-line Lua file expands ~195x and a tab runs out of heap long before it
# finishes - so the compile is done on the owner's machine, where it is Node
# with a full heap, and the browser only ships the source and renders the result.
ROUTE_OBFUSCATE = re.compile(r"^/v1/obfuscate$")
ROUTE_OBFUSCATE_HEALTH = re.compile(r"^/v1/obfuscate/health$")

# CORS. ADDED, and its absence is why this never worked from another device.
#
# The service bound to 127.0.0.1 and sent exactly one header
# (X-Content-Type-Options). A browser on the SAME machine is exempt from CORS,
# so it worked from there and looked healthy. Any other device's browser makes
# a cross-origin request, the preflight comes back without
# Access-Control-Allow-Origin, and the browser drops the request before it is
# ever sent - which presents as "it just doesn't work from other devices" with
# nothing in the console of the service to explain it.
#
# The tunnel makes this necessary rather than merely tidy: a trycloudflare
# hostname is a different ORIGIN from the site, so every call is cross-origin.
#
# The credentials question is answered by NOT using cookies. A request with
# credentials "include" plus a wildcard origin is rejected by browsers anyway,
# and this service authenticates with a bearer token rather than a session, so
# Access-Control-Allow-Credentials stays false and the wildcard is valid.
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
}

# Bound on a single obfuscation request. The point of hosting is to escape the
# browser's limits, not to remove all limits: this is an unauthenticated-ish
# public endpoint that will compile anything, so it is capped and serialised.
MAX_OBFUSCATE_BYTES = 8 * 1024 * 1024      # 8 MB of Lua source
OBFUSCATE_TIMEOUT_SEC = 900                # 15 min; 1.5 MB measured at 243 s

# The single refusal body. One string, for every way a script can be unavailable.
NOT_FOUND = GONE_BODY

GENERIC_ERROR = b"SHERR internal"
UNAUTHORIZED = b"unauthorized"

# ---- host-side obfuscation helpers -----------------------------------------
#
# One compile at a time, process-wide. See _serve_obfuscate for why.
_obfuscate_slots = threading.Lock()

_APP_DIR = Path(__file__).resolve().parent.parent      # the "Storage Keeper" dir
_HOST_SCRIPT = _APP_DIR / "host_obfuscate.mjs"


def _find_node() -> Optional[str]:
    """Locate the node executable, or None.

    shutil.which first because PATH is the normal case; the extra names are
    there because a Windows install is often not on the PATH of whatever
    account runs the scheduled task.
    """
    import shutil
    found = shutil.which("node")
    if found:
        return found
    for name in ("node.exe", "node"):
        for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if not base:
                continue
            candidate = Path(base) / "nodejs" / name
            if candidate.exists():
                return str(candidate)
    return None


def _run_node_obfuscate(node_exe: str, code: str, options: dict) -> Optional[bytes]:
    """Run the compile in a child Node process and return its JSON reply.

    A child process rather than an in-process call for three reasons: a
    multi-hundred-MB compile must not be able to take the storage service down
    with it, the timeout has to be real (a thread cannot be cancelled), and the
    obfuscator's own global state cannot leak into a later request.
    """
    import subprocess

    if not _HOST_SCRIPT.exists():
        log.error("obfuscate: %s is missing", _HOST_SCRIPT.name)
        return None

    payload = json.dumps({"code": code, "options": options}).encode("utf-8")
    started = time.time()
    try:
        proc = subprocess.run(
            [node_exe, str(_HOST_SCRIPT)],
            input=payload,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=OBFUSCATE_TIMEOUT_SEC,
            cwd=str(_APP_DIR.parent),
        )
    except subprocess.TimeoutExpired:
        log.error("obfuscate: compile exceeded %ds", OBFUSCATE_TIMEOUT_SEC)
        return None
    except Exception as exc:
        log.error("obfuscate: could not start node: %s", exc)
        return None

    took = time.time() - started
    out = (proc.stdout or b"").strip()
    if not out:
        log.error("obfuscate: node produced no output (%s)",
                  (proc.stderr or b"")[:300])
        return None

    # One JSON object on one line. A trailing line means the script logged
    # something; taking the LAST complete line is what the contract says the
    # answer is, so a stray warning cannot be mistaken for a result.
    last = out.splitlines()[-1]
    try:
        parsed = json.loads(last)
    except Exception:
        log.error("obfuscate: node output was not JSON")
        return None

    if not parsed.get("ok"):
        log.warning("obfuscate: compile failed after %.1fs: %s", took,
                    str(parsed.get("error"))[:200])
    else:
        size_mb = len(str(parsed.get("code") or "")) / (1024 * 1024)
        log.info("obfuscate: compiled %.1f KB -> %.1f MB in %.1fs",
                 len(code) / 1024, size_mb, took)
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "StorageKeeper"
    sys_version = ""  # do not advertise the Python version

    # -- plumbing ----------------------------------------------------------
    @property
    def store(self) -> Store:
        return self.server.store  # type: ignore[attr-defined]

    @property
    def config(self) -> Config:
        return self.server.config  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        # Route access through logging rather than stderr directly, and never let a
        # client-controlled string be formatted into a log line unescaped.
        log.info("%s %s", self.address_string(), fmt % args)

    def log_error(self, fmt: str, *args) -> None:
        log.warning("%s %s", self.address_string(), fmt % args)

    def _send(self, status: HTTPStatus, body: bytes, ctype: str = "text/plain; charset=utf-8",
              extra: Optional[dict] = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        # On EVERY response, including the error ones. A CORS failure is reported
        # by the browser as an opaque network error, so a refusal that omitted
        # these headers would be indistinguishable in the browser from a refusal
        # that had been delivered - and the client could never tell why.
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and body:
            self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        # The preflight. Without this the browser refuses the real request
        # before it is sent, which is why this service looked broken from every
        # browser except the one on the same machine.
        self.send_response(HTTPStatus.NO_CONTENT)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _fail(self, status: HTTPStatus, body: bytes) -> None:
        self._send(status, body)

    def _authorized(self) -> bool:
        header = self.headers.get("Authorization") or ""
        prefix = "Bearer "
        if not header.startswith(prefix):
            return False
        presented = header[len(prefix):].strip()
        expected = self.config.token
        # compare_digest on equal-length inputs; a length mismatch is itself a failure
        # and is reported as one rather than being padded out.
        if len(presented) != len(expected):
            return False
        return hmac.compare_digest(presented, expected)

    def _require_auth(self) -> bool:
        if self._authorized():
            return True
        # Drain first, THEN refuse.
        #
        # Answering while the client is still uploading leaves unread bytes in
        # the socket. The client is mid-write when the response lands, so it
        # reads a body that does not match Content-Length and reports
        # ERR_CONTENT_LENGTH_MISMATCH - an error that looks like a transport
        # fault rather than the 401 it actually got. That is worse than slow:
        # the caller cannot tell a credential problem from a dead network.
        #
        # The drain is bounded, so this cannot be used to make the service read
        # an unbounded body on behalf of a caller with no token.
        self._drain_body()
        self._fail(HTTPStatus.UNAUTHORIZED, UNAUTHORIZED)
        return False

    def _drain_body(self, limit: int = MAX_OBFUSCATE_BYTES) -> None:
        """Read and discard whatever the client is still sending.

        Bounded on purpose. An unauthenticated caller must not be able to make
        the service hold an arbitrary amount of data in memory.
        """
        encoding = (self.headers.get("Transfer-Encoding") or "").lower()
        try:
            if "chunked" in encoding:
                while True:
                    line = self.rfile.readline(1 << 16)
                    if not line:
                        break
                    head = line.split(b";", 1)[0].strip()
                    try:
                        size = int(head, 16)
                    except ValueError:
                        break
                    if size == 0:
                        break
                    remaining = size
                    while remaining > 0:
                        chunk = self.rfile.read(min(remaining, 1 << 16))
                        if not chunk:
                            return
                        remaining -= len(chunk)
                return
            raw_len = self.headers.get("Content-Length")
            if raw_len is None:
                return
            try:
                declared = int(raw_len)
            except ValueError:
                return
            if declared < 0 or declared > limit:
                # Too big to drain. Say so rather than pretending the request
                # was fully handled.
                return
            remaining = declared
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 1 << 16))
                if not chunk:
                    return
                remaining -= len(chunk)
        except Exception:
            return

    def _kind_from(self, query: str) -> Optional[str]:
        """Resolve the ?kind= parameter, or None if it is not a kind this service stores.

        A bad kind is answered 400 rather than 404: unlike a bad id, the set of valid kinds
        is not secret, and there is no existence to probe - the route has already matched a
        well-formed script id by the time this runs.
        """
        raw = (parse_qs(query).get("kind") or [KIND_ARTIFACT])[0]
        try:
            return validate_kind(raw)
        except InvalidId:
            return None

    def _read_body(self, limit: int) -> Optional[bytes]:
        """Read at most `limit` bytes. Returns None if the client sent more.

        Both framings are handled. Content-Length is the easy case, but a client is
        free to send Transfer-Encoding: chunked instead, and one that does - a Worker
        runtime re-encoding a body, for instance - otherwise arrives here as an empty
        request and fails as "too small" rather than as the protocol error it is.

        The cap is enforced while reading rather than after, so an oversized upload is
        refused without ever being buffered in full.
        """
        encoding = (self.headers.get("Transfer-Encoding") or "").lower()
        if "chunked" in encoding:
            return self._read_chunked(limit)

        raw_len = self.headers.get("Content-Length")
        if raw_len is None:
            return b""
        try:
            declared = int(raw_len)
        except ValueError:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return None
        if declared < 0:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return None
        if declared > limit:
            self._fail(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, GENERIC_ERROR)
            return None
        data = bytearray()
        remaining = declared
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 1 << 16))
            if not chunk:
                break
            data.extend(chunk)
            remaining -= len(chunk)
        return bytes(data)

    def _read_chunked(self, limit: int) -> Optional[bytes]:
        data = bytearray()
        while True:
            line = self.rfile.readline(1 << 16)
            if not line:
                self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
                return None
            size_text = line.split(b";", 1)[0].strip()
            try:
                size = int(size_text, 16)
            except ValueError:
                self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
                return None
            if size == 0:
                # Consume the trailer section, then stop.
                while True:
                    trailer = self.rfile.readline(1 << 16)
                    if not trailer or trailer in (b"\r\n", b"\n"):
                        break
                return bytes(data)
            if len(data) + size > limit:
                self._fail(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, GENERIC_ERROR)
                return None
            while size > 0:
                chunk = self.rfile.read(size)
                if not chunk:
                    self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
                    return None
                data.extend(chunk)
                size -= len(chunk)
            self.rfile.read(2)  # the CRLF that terminates the chunk

    # -- verbs -------------------------------------------------------------
    def do_PUT(self) -> None:  # noqa: N802
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        m = ROUTE_PUT.match(parsed.path)
        if not m:
            # A malformed id is answered exactly like a missing one. Returning 400 here
            # and 404 there would turn this endpoint into an id-existence oracle.
            self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)
            return
        script_id = m.group(1)
        if not ID_PATTERN.match(script_id):
            self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)
            return
        kind = self._kind_from(parsed.query)
        if kind is None:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return
        body = self._read_body(self.config.max_object_bytes)
        if body is None:
            return
        # Optional expiry, as a unix timestamp IN SECONDS. Absent means "no timer" - the
        # owner setting a lifetime is an explicit act, and creating a script must not
        # imply one.
        #
        # SECONDS, not milliseconds. A millisecond count is numerically larger than any
        # plausible second-count, so it passes "is it in the future" and is then clamped
        # to the one-year cap - silently turning a 30-second timer into a one-year one
        # and hiding the mistake behind a policy that looks like it worked. Every expiry
        # on the wire and in the index is seconds; nothing in this codebase mixes the two.
        expires_at: Optional[int] = None
        raw_exp = (parse_qs(parsed.query).get("expires_at") or [None])[0]
        if raw_exp:
            try:
                expires_at = int(raw_exp)
            except ValueError:
                self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
                return
        try:
            rec = self.store.put(body, kind, script_id=script_id, expires_at=expires_at)
        except InvalidId:
            self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)
            return
        except ValueError as e:
            # Logged with detail, answered with a fixed body. A client that sent an empty
            # body and one that sent an oversized body both get the same 4xx, so the
            # status cannot be used to probe the service - but the operator still gets
            # the actual reason in the log.
            log.warning("put refused (%s): %s", script_id, e)
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return
        except Exception:  # noqa: BLE001
            # The detail goes to the log with a traceback; the client gets a fixed body.
            # An unexpected exception must never become an information leak.
            log.exception("put failed")
            self._fail(HTTPStatus.INTERNAL_SERVER_ERROR, GENERIC_ERROR)
            return
        payload = json.dumps(rec.to_public()).encode()
        self._send(HTTPStatus.OK, payload, "application/json")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        # Health is deliberately unauthenticated but reveals nothing beyond "up".
        if ROUTE_HEALTH.match(parsed.path):
            self._send(HTTPStatus.OK, b'{"ok":true}')
            return
        # Same reasoning for the compile-ready probe: it answers "can the host
        # take this job", which is safe to ask and needed BEFORE sending work,
        # so the client can say "waiting for host" rather than hanging.
        if ROUTE_OBFUSCATE_HEALTH.match(parsed.path):
            self._serve_obfuscate_health()
            return
        if not self._require_auth():
            return
        meta = ROUTE_META.match(parsed.path)
        if meta:
            self._serve_meta(meta.group(1), parsed.query)
            return
        m = ROUTE_GET.match(parsed.path)
        if m:
            self._serve_object(m.group(1), parsed.query)
            return
        if ROUTE_OBJECTS.match(parsed.path):
            # to_public() per record: id, kind, size, hash and the countdown fields.
            # No path, no filename, no directory - the dashboard has no use for them and
            # every one of them is information about the owner's disk.
            rows = [r.to_public() for r in self.store.list()]
            self._send(HTTPStatus.OK, json.dumps({"objects": rows}).encode(), "application/json")
            return
        self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)

    def do_DELETE(self) -> None:  # noqa: N802
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        m = ROUTE_GET.match(parsed.path)
        if not m:
            self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)
            return
        script_id = m.group(1)
        # "no ?kind=" must mean EVERY kind, not the artifact.
        #
        # _kind_from defaults to artifact, which is right for a read and wrong for a
        # delete: a delete that silently spared the parts would leave a deleted script's
        # bytes sitting on the owner's drive with no expiry left to sweep them, and no
        # stat that reports them. The default is the bug, not the delete.
        named = parse_qs(parsed.query).get("kind")
        if not named:
            removed = self.store.delete(script_id, None)
            self._send(HTTPStatus.OK, json.dumps({"removed": removed}).encode(), "application/json")
            return
        kind = self._kind_from(parsed.query)
        if kind is None:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return
        removed = self.store.delete(script_id, kind)
        self._send(HTTPStatus.OK, json.dumps({"removed": removed}).encode(), "application/json")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        # Obfuscation is checked BEFORE the blanket auth requirement so it can
        # answer /health without a token: the client polls that to decide
        # whether to say "waiting for host" or "host refused the credential",
        # and those are different problems needing different fixes.
        if ROUTE_OBFUSCATE_HEALTH.match(parsed.path):
            self._serve_obfuscate_health()
            return
        if ROUTE_OBFUSCATE.match(parsed.path):
            if not self._require_auth():
                return
            self._serve_obfuscate()
            return
        if not self._require_auth():
            return
        if ROUTE_SWEEP.match(parsed.path):
            report = self.store.sweep()
            log.info("sweep: %s", report)
            self._send(HTTPStatus.OK, json.dumps(report).encode(), "application/json")
            return
        self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)

    # -- host-side obfuscation ------------------------------------------------
    def _serve_obfuscate_health(self) -> None:
        """Report whether a compile could run right now.

        Deliberately unauthenticated and deliberately dull: no paths, no Node
        version, no queue depth. It answers one question - is the host ready -
        and that question is safe to let anyone ask.
        """
        report = {
            "ok": True,
            "node": bool(_find_node()),
            "busy": _obfuscate_slots.locked(),
            "maxSourceBytes": MAX_OBFUSCATE_BYTES,
        }
        self._send(HTTPStatus.OK, json.dumps(report).encode(), "application/json")

    def _serve_obfuscate(self) -> None:
        """Compile Lua on this machine and return the artifact.

        The whole point: a browser tab cannot do this. A 6000-line script
        expands ~195x, and the tab dies before the compile finishes.

        Serialised behind a single lock. Two concurrent multi-hundred-MB
        compiles would exhaust the machine's memory, and this endpoint is
        reachable by anyone who learns the tunnel URL, so the bound is a
        availability guard rather than a nicety.
        """
        raw = self._read_body(MAX_OBFUSCATE_BYTES)
        if raw is None:
            return  # _read_body already answered

        try:
            req = json.loads(raw.decode("utf-8"))
        except Exception:
            log.warning("obfuscate: body was not JSON")
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return

        code = str((req or {}).get("code") or "")
        options = (req or {}).get("options") or {}
        if not isinstance(options, dict):
            options = {}
        if not code:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return

        node_exe = _find_node()
        if not node_exe:
            # Not "gone": the host is up and refusing. The client must be able
            # to tell this from a missing script.
            log.warning("obfuscate: node was not found on PATH")
            self._fail(HTTPStatus.SERVICE_UNAVAILABLE,
                       b'{"ok":false,"error":"host has no node on PATH"}')
            return

        if not _obfuscate_slots.acquire(blocking=False):
            # 429, not a queue. A queued multi-minute compile would blow
            # through every browser and proxy timeout between here and the
            # client, so the caller is told to retry rather than left hanging.
            self._send(HTTPStatus.TOO_MANY_REQUESTS,
                       b'{"ok":false,"error":"host is already compiling"}',
                       "application/json")
            return

        try:
            result = _run_node_obfuscate(node_exe, code, options)
        finally:
            _obfuscate_slots.release()

        if result is None:
            self._fail(HTTPStatus.INTERNAL_SERVER_ERROR, GENERIC_ERROR)
            return
        self._send(HTTPStatus.OK, result, "application/json")

    # -- handlers ----------------------------------------------------------
    def _serve_object(self, script_id: str, query: str) -> None:
        kind = self._kind_from(query)
        if kind is None:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return
        data = self.store.get(script_id, kind)
        if data is None:
            # Missing and expired are indistinguishable here by construction: the store
            # returns None for both, and this layer does not know which it was.
            self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)
            return
        self._send(HTTPStatus.OK, data, "application/octet-stream")

    def _serve_meta(self, script_id: str, query: str) -> None:
        kind = self._kind_from(query)
        if kind is None:
            self._fail(HTTPStatus.BAD_REQUEST, GENERIC_ERROR)
            return
        rec = self.store.head(script_id, kind)
        if rec is None:
            self._fail(HTTPStatus.NOT_FOUND, NOT_FOUND)
            return
        # to_public() carries the countdown fields and nothing else - no path, no name.
        self._send(HTTPStatus.OK, json.dumps(rec.to_public()).encode(), "application/json")


class KeeperServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr, handler, config: Config, store: Store):
        super().__init__(addr, handler)
        self.config = config
        self.store = store


def _cleanup_loop(store: Store, interval: int, stop: threading.Event) -> None:
    """Periodic sweep. Enforces expiry and the one-year cap whether or not anyone reads.

    The on-read check is the enforcement; this is what makes an expired script that
    nobody ever asks about actually give its disk space back.
    """
    while not stop.wait(interval):
        try:
            report = store.sweep()
            if report["expired"] or report["orphan_tmp_removed"]:
                log.info("cleanup removed %s", report)
        except Exception:  # noqa: BLE001
            # A cleanup failure must never kill the service. The next tick retries, and
            # the on-read check still refuses to serve anything expired.
            log.exception("cleanup sweep failed")


def serve(config: Optional[Config] = None, *, block: bool = True, cleanup_interval: Optional[int] = None):
    config = config or Config.from_env()
    logging.basicConfig(
        level=os.environ.get("SH_STORE_LOG", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    store = Store(config)
    server = KeeperServer((config.host, config.port), Handler, config, store)

    stop = threading.Event()
    interval = cleanup_interval if cleanup_interval is not None else config.cleanup_interval_seconds
    cleaner = threading.Thread(
        target=_cleanup_loop, args=(store, interval, stop), name="storage-keeper-cleanup", daemon=True
    )
    cleaner.start()

    # One sweep at startup, so a service that was down over an expiry boundary does not
    # serve a stale window or wait a full interval to reclaim the space.
    try:
        store.sweep()
    except Exception:  # noqa: BLE001
        log.exception("startup sweep failed")

    log.info("Storage Keeper listening on http://%s:%d", config.host, config.port)
    log.info("storage root: %s", config.root)
    if os.environ.get("SH_STORE_TOKEN"):
        log.info("auth: bearer token from SH_STORE_TOKEN")
    else:
        # Nothing is ever logged at request time; this is the single place the operator
        # learns the generated token. Without it the service would be unusable, and
        # unusable is not the same as safe - a silent empty token would be neither.
        log.warning("SH_STORE_TOKEN not set - generated one for this run only:")
        log.warning("    %s", config.token)
    if config.host not in ("127.0.0.1", "localhost", "::1"):
        log.warning(
            "bound to %s, which is reachable off-box. Put an authenticating reverse "
            "proxy (or a cloudflared tunnel) in front of it before exposing it.",
            config.host,
        )

    if not block:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("shutting down")
    finally:
        stop.set()
        server.server_close()
        store.close()
    return server