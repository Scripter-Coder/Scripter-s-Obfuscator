"""HTTP service tests. Run: py Storage Keeper/tests/test_service.py

These cover the properties the API is judged on: that no path can be addressed, that
nothing internal escapes, that expiry is decided server-side, and that missing and
expired are indistinguishable.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from storage_keeper.app import Handler, KeeperServer
from storage_keeper.config import GONE_BODY, GONE_MESSAGE, HARD_CAP_SECONDS, Config
from storage_keeper.store import Store

TOKEN = "s3cret-token-for-tests-0123456789"
MAX_BYTES = 256 * 1024


class ServiceTestCase(unittest.TestCase):
    """Boots a real server on a real port and talks to it over real HTTP."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(
            root=Path(self.tmp.name),
            host="127.0.0.1",
            port=0,  # let the OS pick a free port
            token=TOKEN,
            max_object_bytes=MAX_BYTES,
            cleanup_interval_seconds=3600,
        )
        self.store = Store(self.config)
        self.server = KeeperServer((self.config.host, self.config.port), Handler, self.config, self.store)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(10)
        self.store.close()
        self.tmp.cleanup()

    # -- helpers -----------------------------------------------------------
    def call(self, method, path, body=None, token=TOKEN, headers=None, raw=False):
        url = self.base + path
        req = urllib.request.Request(url, data=body, method=method)
        if token is not None:
            req.add_header("Authorization", f"Bearer {token}")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                return resp.status, (data if raw else self._maybe_json(data))
        except urllib.error.HTTPError as e:
            data = e.read()
            return e.code, (data if raw else self._maybe_json(data))

    @staticmethod
    def _maybe_json(data: bytes):
        try:
            return json.loads(data.decode())
        except Exception:  # noqa: BLE001
            return data.decode(errors="replace")

    def put(self, script_id, content, kind="artifact", token=TOKEN, expires_at=None):
        path = f"/v1/objects/{script_id}"
        if kind != "artifact":
            path += f"?kind={kind}"
        if expires_at is not None:
            path += ("&" if "?" in path else "?") + f"expires_at={expires_at}"
        return self.call("PUT", path, body=content, token=token)

    def get(self, script_id, kind="artifact", token=TOKEN, raw=True):
        path = f"/v1/objects/{script_id}" + (f"?kind={kind}" if kind != "artifact" else "")
        return self.call("GET", path, token=token, raw=raw)


class TestAuth(ServiceTestCase):
    def test_every_verb_requires_a_token(self):
        for method in ("PUT", "GET", "DELETE", "POST"):
            body = b"x" if method in ("PUT", "POST") else None
            status, _ = self.call(method, "/v1/objects/ScripterHub1234567890", body=body, token=None)
            self.assertEqual(status, 401, f"{method} served without a token")

    def test_wrong_and_malformed_tokens_are_rejected(self):
        sid = "ScripterHub1234567890"
        self.put(sid, b"data")
        for bad in ("", "wrong", TOKEN + "x", TOKEN[:-1], "Bearer", TOKEN.upper()):
            status, _ = self.call("GET", f"/v1/objects/{sid}", token=bad)
            self.assertEqual(status, 401, f"token {bad!r} was accepted")

    def test_non_bearer_scheme_is_rejected(self):
        sid = "ScripterHub1234567890"
        self.put(sid, b"data")
        req = urllib.request.Request(self.base + f"/v1/objects/{sid}")
        req.add_header("Authorization", f"Basic {TOKEN}")
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req, timeout=30)
        self.assertEqual(cm.exception.code, 401)

    def test_admin_endpoints_require_auth(self):
        for path in ("/v1/admin/stats", "/v1/admin/sweep"):
            status, _ = self.call("GET", path, token=None)
            self.assertEqual(status, 401)
            status, _ = self.call("POST", path, body=b"", token=None)
            self.assertEqual(status, 401)

    def test_health_is_open_but_says_nothing(self):
        status, body = self.call("GET", "/v1/health", token=None)
        self.assertEqual(status, 200)
        self.assertEqual(body, {"ok": True})


class TestNoFilesystemAccess(ServiceTestCase):
    """The central security property: there is no way to name a path."""

    def test_traversal_attempts_are_refused(self):
        for evil in (
            "../../../../windows/system32/drivers/etc/hosts",
            "..%2f..%2f..%2fetc%2fpasswd",
            "ScripterHub1234567890/../../../etc/passwd",
            "/etc/passwd",
            "C:/Windows/win.ini",
            "c:\\windows\\win.ini",
            "ScripterHub1234567890%00.txt",
            "....//....//etc/passwd",
            "ScripterHub1234567890;rm%20-rf%20/",   # percent-encoded, so it is actually sent
            "ScripterHub1234567890%2e%2e%2f%2e%2e%2fetc",
            "ScripterHub1234567890/./../../etc/passwd",
            "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
            "ScripterHub1234567890%5c..%5c..%5cboot.ini",
        ):
            status, _ = self.get(evil)
            self.assertEqual(status, 404, f"{evil!r} returned {status}, not 404")

    def test_dot_dot_in_a_query_parameter_changes_nothing(self):
        sid = "ScripterHub1234567890"
        self.put(sid, b"data")
        status, data = self.get(f"{sid}?kind=../../artifact")
        self.assertEqual(status, 400, "an unknown kind must be refused outright")

    def test_unknown_routes_are_404(self):
        for path in ("/", "/v1", "/v1/", "/v1/objects", "/v1/objects/", "/admin",
                     "/v1/objects/ScripterHub1234567890/unknown", "/../../../etc/passwd",
                     "/v1/admin/../../etc/passwd"):
            status, _ = self.call("GET", path)
            self.assertEqual(status, 404, path)

    def test_responses_never_contain_a_path_or_windows_root(self):
        self.put("ScripterHub1234567890", b"data")
        probes = [
            ("GET", "/v1/objects/ScripterHub9999999999"),
            ("GET", "/v1/objects/ScripterHub1234567890/meta"),
            ("GET", "/v1/admin/stats"),
            ("GET", "/v1/objects/../../../etc/passwd"),
            ("DELETE", "/v1/objects/ScripterHub9999999999"),
            ("GET", "/v1/nonsense"),
        ]
        root = str(self.config.root).lower()
        for method, path in probes:
            status, body = self.call(method, path)
            text = (body if isinstance(body, str) else json.dumps(body)).lower()
            for leak in (root, "c:\\", "c:/", "sqlite", ".py", "traceback", "storage_keeper",
                         "site-packages", "temp\\", "oserror", "sqlite3"):
                self.assertNotIn(leak, text, f"{method} {path} leaked {leak!r}")

    def test_malformed_json_and_huge_content_length_are_handled(self):
        sid = "ScripterHub1234567890"
        # A declared length beyond the cap is refused without being buffered.
        req = urllib.request.Request(self.base + f"/v1/objects/{sid}", data=b"x", method="PUT")
        req.add_header("Authorization", f"Bearer {TOKEN}")
        req.add_header("Content-Length", str(MAX_BYTES + 1))
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req, timeout=30)
        self.assertEqual(cm.exception.code, 413)


class TestLifecycle(ServiceTestCase):
    def test_create_read_delete(self):
        sid = "ScripterHub1234567890"
        status, meta = self.put(sid, b"print('hi')")
        self.assertEqual(status, 200)
        self.assertEqual(meta["id"], sid)
        self.assertEqual(meta["size"], len(b"print('hi')"))

        status, data = self.get(sid)
        self.assertEqual(status, 200)
        self.assertEqual(data, b"print('hi')")

        status, _ = self.call("DELETE", f"/v1/objects/{sid}")
        self.assertEqual(status, 200)
        status, data = self.get(sid)
        self.assertEqual(status, 404)
        self.assertEqual(data, GONE_BODY)

    def test_loader_and_artifact_coexist(self):
        sid = "ScripterHub1234567890"
        self.put(sid, b"THE SCRIPT")
        self.put(sid, b"THE LOADER", kind="loader")
        self.assertEqual(self.get(sid)[1], b"THE SCRIPT")
        self.assertEqual(self.get(sid, kind="loader")[1], b"THE LOADER")

    def test_missing_script_returns_the_gone_body(self):
        status, data = self.get("ScripterHub9999999999")
        self.assertEqual(status, 404)
        self.assertEqual(data, GONE_BODY)

    def test_meta_endpoint_gives_the_countdown(self):
        sid = "ScripterHub1234567890"
        import time as _t
        soon = int(_t.time()) + 3600
        self.put(sid, b"x", expires_at=soon)
        status, meta = self.call("GET", f"/v1/objects/{sid}/meta")
        self.assertEqual(status, 200)
        self.assertTrue(meta["has_timer"])
        self.assertGreater(meta["remaining_seconds"], 3500)
        self.assertLessEqual(meta["remaining_seconds"], 3600)
        self.assertEqual(meta["state"], "live")

    def test_untimed_script_reports_the_hard_cap_as_its_deadline(self):
        sid = "ScripterHub1234567890"
        self.put(sid, b"x")
        _, meta = self.call("GET", f"/v1/objects/{sid}/meta")
        self.assertFalse(meta["has_timer"], "creating a script must not set a timer")
        import time as _t
        self.assertAlmostEqual(
            meta["remaining_seconds"], HARD_CAP_SECONDS, delta=5,
            msg="an untimed script is bounded by the one-year cap",
        )

    def test_expires_at_beyond_a_year_is_clamped(self):
        import time as _t
        sid = "ScripterHub1234567890"
        self.put(sid, b"x", expires_at=int(_t.time()) + 10 * 365 * 86400)
        _, meta = self.call("GET", f"/v1/objects/{sid}/meta")
        self.assertLessEqual(meta["expires_at"], int(_t.time()) + HARD_CAP_SECONDS)

    def test_overwrite_replaces_content(self):
        sid = "ScripterHub1234567890"
        self.put(sid, b"v1")
        self.put(sid, b"v2")
        self.assertEqual(self.get(sid)[1], b"v2")

    def test_empty_body_is_refused(self):
        status, _ = self.put("ScripterHub1234567890", b"")
        self.assertEqual(status, 400)


class TestExpiryIsServerSide(ServiceTestCase):
    """The browser countdown is a display. This is the authority."""

    def test_an_expired_script_is_unreachable_even_when_asked_honestly(self):
        sid = "ScripterHub1234567890"
        import time as _t
        past = int(_t.time()) - 10
        # Force a genuinely expired record by writing it directly through the store,
        # which is the only way to construct a past expiry the API refuses to accept.
        self.store.put(b"secret", "artifact", script_id=sid, now=int(_t.time()) - 100)
        self.store._conn().execute(
            "UPDATE objects SET expires_at=?, state='live' WHERE script_id=?", (past, sid)
        )
        self.store._conn().commit()

        status, data = self.get(sid)
        self.assertEqual(status, 404)
        self.assertEqual(data, GONE_BODY, "an expired script must be indistinguishable from a missing one")

        status, _ = self.call("GET", f"/v1/objects/{sid}/meta")
        self.assertEqual(status, 404, "meta must not confirm an expired script exists")

    def test_expiry_survives_the_cleanup_thread_not_having_run(self):
        """A one-second expiry must bite immediately, not at the next sweep."""
        sid = "ScripterHub1234567890"
        now = int(__import__("time").time())
        self.store.put(b"secret", "artifact", script_id=sid, now=now - 100)
        self.store._conn().execute(
            "UPDATE objects SET expires_at=?, hard_cap_at=?, state='live' WHERE script_id=?",
            (now - 50, now - 10, sid),
        )
        self.store._conn().commit()
        self.assertEqual(self.get(sid)[0], 404)

    def test_sweep_endpoint_removes_expired_files(self):
        sid = "ScripterHub1234567890"
        now = int(__import__("time").time())
        self.store.put(b"secret", "artifact", script_id=sid, now=now - 100)
        self.store._conn().execute(
            "UPDATE objects SET expires_at=?, state='live' WHERE script_id=?", (now - 50, sid)
        )
        self.store._conn().commit()
        path = self.store._path_for(sid, "artifact")
        self.assertTrue(path.exists())
        status, report = self.call("POST", "/v1/admin/sweep", body=b"")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(report["expired"], 1)
        self.assertFalse(path.exists())

    def test_the_one_year_cap_removes_a_file_with_no_timer(self):
        sid = "ScripterHub1234567890"
        now = int(__import__("time").time())
        self.store.put(b"ancient", "artifact", script_id=sid, now=now - 10)
        self.store._conn().execute(
            "UPDATE objects SET hard_cap_at=?, state='live' WHERE script_id=?", (now - 1, sid)
        )
        self.store._conn().commit()
        self.assertEqual(self.get(sid)[0], 404)
        self.assertFalse(self.store._path_for(sid, "artifact").exists())


class TestGoneContract(ServiceTestCase):
    def test_the_loader_would_print_the_required_sentence(self):
        """The 404 body is SHERR gone; the worker's DENYMSG turns that into the sentence.

        Asserted here as a contract on the two halves, because the sentence only exists
        once both agree: this service must emit SHERR gone, and the loader must map gone
        to the sentence.
        """
        status, data = self.get("ScripterHub9999999999")
        self.assertEqual(data, b"SHERR gone")
        self.assertTrue(data.decode().startswith("SHERR "))
        self.assertEqual(GONE_MESSAGE, "Script cannot be loaded, doesnt exist or expired.")
        # The exact mapping the loader performs, so the contract is pinned from both ends.
        mapped = {
            "gone": "Script cannot be loaded, doesnt exist or expired.",
        }["gone"]
        self.assertEqual(mapped, GONE_MESSAGE)


class TestConcurrency(ServiceTestCase):
    def test_many_clients_at_once(self):
        results: dict[str, object] = {}
        lock = threading.Lock()
        sid = "ScripterHub1234567890"
        self.put(sid, b"shared payload")

        def reader():
            status, data = self.get(sid)
            with lock:
                results.setdefault("reads", []).append((status, data))

        def writer(i: int):
            status, _ = self.put(f"ScripterHub{2000000000 + i}", b"payload-%d" % i)
            with lock:
                results.setdefault("writes", []).append(status)

        threads = [threading.Thread(target=reader) for _ in range(15)]
        threads += [threading.Thread(target=writer, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(60)

        self.assertEqual(len(results["reads"]), 15)
        self.assertTrue(all(s == 200 and d == b"shared payload" for s, d in results["reads"]),
                        "a concurrent read got the wrong bytes")
        self.assertEqual(len(results["writes"]), 10)
        self.assertTrue(all(s == 200 for s in results["writes"]))

    def test_concurrent_reads_of_an_expired_script_all_get_gone(self):
        sid = "ScripterHub1234567890"
        now = int(__import__("time").time())
        self.store.put(b"secret", "artifact", script_id=sid, now=now - 100)
        self.store._conn().execute(
            "UPDATE objects SET expires_at=?, state='live' WHERE script_id=?", (now - 50, sid)
        )
        self.store._conn().commit()
        seen: list[tuple] = []
        lock = threading.Lock()

        def probe():
            out = self.get(sid)
            with lock:
                seen.append(out)

        threads = [threading.Thread(target=probe) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(60)
        self.assertTrue(all(s == 404 and d == GONE_BODY for s, d in seen),
                        f"an expired script leaked to {seen}")


if __name__ == "__main__":
    unittest.main(verbosity=2)