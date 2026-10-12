"""Storage Keeper/tests/test_obfuscate_host.py

Guards the host-side obfuscation endpoint.

This exists because the endpoint did not exist and, when it did not, the
failure was invisible from the machine that ran it. The service bound to
127.0.0.1, so the owner's own browser was exempt from CORS and every call
succeeded locally while every other device was blocked by a preflight the
service never answered. "It works here" was true and useless.

These tests check the properties that make it usable from anywhere - CORS on
every response including errors, an OPTIONS preflight, the readiness probe -
plus the compile itself. The server is booted exactly the way test_service.py
boots it, so the lifecycle and the Windows file-handle teardown are already
known to work.

Run:  py "Storage Keeper/tests/test_obfuscate_host.py"
"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from storage_keeper.app import (  # noqa: E402
    MAX_OBFUSCATE_BYTES,
    Handler,
    KeeperServer,
)
from storage_keeper.config import Config  # noqa: E402
from storage_keeper.store import Store  # noqa: E402

TOKEN = "host-obfuscate-test-token"
ORIGIN = "https://example.test"


class ObfuscateHostTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(
            root=Path(self.tmp.name),
            host="127.0.0.1",
            port=0,
            token=TOKEN,
            cleanup_interval_seconds=3600,
        )
        self.store = Store(self.config)
        self.server = KeeperServer(
            (self.config.host, self.config.port), Handler, self.config, self.store)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        # Same order as test_service.py: shutdown, close, join, THEN release
        # the store and remove the directory. Reversing any of these leaves
        # index.sqlite3 locked and the cleanup raises PermissionError on
        # Windows, which reports as a failure in whatever test ran last.
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(10)
        self.store.close()
        self.tmp.cleanup()

    # -- helpers -----------------------------------------------------------
    def call(self, method, path, body=None, token=TOKEN, headers=None, timeout=300):
        url = self.base + path
        data = None
        if body is not None:
            data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, method=method)
        if token is not None:
            req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Origin", ORIGIN)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    # -- the reason this feature exists ------------------------------------
    def test_cors_headers_on_success(self):
        """A tunnel hostname is a different origin, so CORS is mandatory.

        Without it the browser drops the request before it is sent. From the
        owner's own machine the service is on 127.0.0.1 and is exempt, so this
        passes locally and fails everywhere else - which is exactly how it
        behaved before.
        """
        status, headers, _ = self.call("GET", "/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")

    def test_cors_headers_on_errors_too(self):
        """An error without CORS headers is opaque in the browser.

        The client could not tell "refused" from "blocked", so a credential
        problem would be reported to the user as a network failure.
        """
        status, headers, _ = self.call(
            "GET", "/v1/objects/ScripterHub1111111111", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")

    def test_options_preflight_is_answered(self):
        status, headers, _ = self.call(
            "OPTIONS", "/v1/obfuscate", token=None,
            headers={"Access-Control-Request-Method": "POST",
                     "Access-Control-Request-Headers": "authorization,content-type"})
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")
        self.assertIn("POST", headers.get("Access-Control-Allow-Methods", ""))
        self.assertIn("authorization",
                      headers.get("Access-Control-Allow-Headers", "").lower())

    # -- readiness ---------------------------------------------------------
    def test_obfuscate_health_needs_no_token(self):
        """Polled BEFORE sending work, so the client never hangs on a dead host."""
        status, _, body = self.call("GET", "/v1/obfuscate/health", token=None)
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertTrue(data["ok"])
        self.assertIn("node", data)
        self.assertIn("busy", data)
        self.assertEqual(data["maxSourceBytes"], MAX_OBFUSCATE_BYTES)

    def test_health_leaks_nothing_internal(self):
        """It is unauthenticated, so it must answer only "can you take work"."""
        _, _, body = self.call("GET", "/v1/obfuscate/health", token=None)
        data = json.loads(body)
        text = body.decode()
        self.assertNotIn(str(HERE), text, "no filesystem path may be echoed")
        self.assertNotIn("node.exe", text)

    # -- auth --------------------------------------------------------------
    def test_obfuscate_requires_auth(self):
        """Anyone who learns the tunnel URL must not get free compiles."""
        status, headers, _ = self.call(
            "POST", "/v1/obfuscate", body={"code": "print(1)", "options": {}},
            token=None)
        self.assertEqual(status, 401)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")

    def test_obfuscate_rejects_wrong_token(self):
        status, _, _ = self.call(
            "POST", "/v1/obfuscate", body={"code": "print(1)", "options": {}},
            token="not-the-token")
        self.assertEqual(status, 401)

    # -- the compile -------------------------------------------------------
    def test_compiles_a_real_script(self):
        """The actual point: compile off-browser, get an artifact back."""
        code = ('local Players = game:GetService("Players")\n'
                'local function greet(n) return "Hello, " .. n end\n'
                'print(greet("world"))\n')
        status, _, body = self.call("POST", "/v1/obfuscate", body={
            "code": code,
            "options": {"intensity": 5, "profile": "SECURE",
                        "antiTamper": False, "antiSkid": False,
                        "hwidLock": False, "keyGate": None,
                        "scriptName": "t",
                        "scriptId": "ScripterHub1111111111",
                        "owner": "o", "keyless": True,
                        "statsEndpoint": None},
        })
        self.assertEqual(status, 200, body[:400])
        data = json.loads(body)
        self.assertTrue(data["ok"], str(data)[:300])
        self.assertGreater(len(data["code"]), len(code))
        self.assertIn("elapsedMs", data)
        self.assertIn("dbgInfo", data)

    def test_rejects_empty_source(self):
        status, _, _ = self.call(
            "POST", "/v1/obfuscate", body={"code": "", "options": {}})
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)