"""Storage Keeper/tests/test_compile_ticket.py

Guards the short-lived compile ticket.

WHY THIS EXISTS

Compiling on the owner's machine used to be proxied: the browser POSTed to the
worker and the worker relayed to here. A 6000-line script takes 100+ seconds on
this machine, and a Worker holding a subrequest open that long is killed by
Cloudflare with HTTP 520 - reported as "can't understand the response from your
origin", which points at this machine and hides that the relay was the problem.

So the browser now posts HERE directly, and authenticates with a ticket the
worker mints. That moves the decision "is this caller allowed to spend the
owner's CPU?" from a permanent shared secret into a short-lived signed claim.
The tests below are about that claim:

  * a correctly signed, unexpired ticket is accepted;
  * the permanent token still works (the worker's own calls use it);
  * a forged signature is refused;
  * an expired ticket is refused - including one whose expiry was edited,
    which a signature that did not cover the expiry would happily allow;
  * a ticket signed with the WRONG secret is refused.

The last two are the ones worth having. A ticket scheme that accepts an expired
or unsigned ticket is just the permanent token with extra steps and a worse
story, and the expiry is the only thing standing between a leaked URL and an
open compile service.

Run:  py "Storage Keeper/tests/test_compile_ticket.py"
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from storage_keeper.app import Handler, KeeperServer  # noqa: E402
from storage_keeper.config import Config  # noqa: E402
from storage_keeper.store import Store  # noqa: E402

TOKEN = "compile-ticket-test-token"
ORIGIN = "https://example.test"


def mint(secret: str, exp_ms: int) -> str:
    """Build a ticket exactly the way the worker does.

    Mirrors worker.js:
        payload = b64url({"exp": <unix ms>})
        ticket  = payload + "." + hex(HMAC-SHA256(payload))
    """
    raw = json.dumps({"exp": exp_ms}, separators=(",", ":")).encode()
    payload = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


class CompileTicketTestCase(unittest.TestCase):
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
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(10)
        self.store.close()
        self.tmp.cleanup()

    # -- the preflight that decides whether any of this is reachable --------
    def test_preflight_allows_the_ticket_header(self):
        """If this fails, EVERY browser compile is blocked before it is sent.

        X-SH-Ticket is a non-simple header, so sending it triggers a preflight.
        A preflight that does not name it causes the browser to drop the
        request - and the page reports that as "could not reach the host",
        sending the user to restart a machine that is running perfectly.
        """
        req = urllib.request.Request(self.base + "/v1/obfuscate", method="OPTIONS")
        req.add_header("Origin", ORIGIN)
        req.add_header("Access-Control-Request-Method", "POST")
        req.add_header("Access-Control-Request-Headers", "content-type,x-sh-ticket")
        with urllib.request.urlopen(req, timeout=30) as resp:
            # 200 and 204 are both valid preflight answers; only the header
            # list decides whether the real request survives.
            self.assertIn(resp.status, (200, 204), f"preflight returned {resp.status}")
            allow = resp.headers.get("Access-Control-Allow-Headers", "").lower()
            self.assertIn("x-sh-ticket", allow,
                          f"preflight does not allow X-SH-Ticket, so every compile is blocked: {allow!r}")

    # -- helpers -----------------------------------------------------------
    def post(self, ticket=None, token=None):
        """POST /v1/obfuscate with EITHER a bearer token OR a ticket."""
        body = json.dumps({"code": "print('hi')"}).encode()
        req = urllib.request.Request(self.base + "/v1/obfuscate", data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Origin", ORIGIN)
        if token is not None:
            req.add_header("Authorization", f"Bearer {token}")
        if ticket is not None:
            req.add_header("X-SH-Ticket", ticket)
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def assertRefused(self, status, body):
        self.assertEqual(status, 401, f"expected 401, got {status}: {body[:200]!r}")

    # -- accepted ----------------------------------------------------------
    def test_valid_unexpired_ticket_is_accepted(self):
        """The whole feature: a browser holding only a ticket can compile."""
        status, body = self.post(ticket=mint(TOKEN, int(time.time() * 1000) + 600_000))
        self.assertEqual(status, 200, f"valid ticket was refused: {body[:200]!r}")
        self.assertTrue(json.loads(body)["ok"])

    def test_permanent_token_still_works(self):
        """The worker's own calls keep using the bearer token.

        Ticket support is additive. If this broke, every keeper write would
        fail the moment the ticket path landed.
        """
        status, body = self.post(token=TOKEN)
        self.assertEqual(status, 200, f"bearer token was refused: {body[:200]!r}")

    # -- refused -----------------------------------------------------------
    def test_no_credentials_at_all_is_refused(self):
        self.assertRefused(*self.post())

    def test_forged_signature_is_refused(self):
        """Right shape, wrong signature."""
        good = mint(TOKEN, int(time.time() * 1000) + 600_000)
        payload, sig = good.rsplit(".", 1)
        forged = payload + "." + ("0" * len(sig))
        self.assertRefused(*self.post(ticket=forged))

    def test_ticket_signed_with_the_wrong_secret_is_refused(self):
        self.assertRefused(*self.post(ticket=mint("not-the-real-token", int(time.time() * 1000) + 600_000)))

    def test_expired_ticket_is_refused(self):
        self.assertRefused(*self.post(ticket=mint(TOKEN, int(time.time() * 1000) - 1_000)))

    def test_ticket_with_no_expiry_is_refused(self):
        """A ticket that never expires is a permanent credential."""
        payload = base64.urlsafe_b64encode(b"{}").decode().rstrip("=")
        sig = hmac.new(TOKEN.encode(), payload.encode(), hashlib.sha256).hexdigest()
        self.assertRefused(*self.post(ticket=f"{payload}.{sig}"))

    def test_expiry_cannot_be_extended_by_editing_it(self):
        """THE IMPORTANT ONE.

        The signature covers the payload, and the payload carries the expiry.
        Re-signing is impossible without the secret, so editing the expiry to a
        later time invalidates the signature and the ticket is refused.

        If a future change ever signs only the id and leaves the expiry as an
        unsigned claim, this test fails - which is the point of writing it.
        """
        good = mint(TOKEN, int(time.time() * 1000) + 600_000)
        payload, sig = good.rsplit(".", 1)

        # Re-encode the same payload with an expiry a year out, keeping the
        # original signature.
        tampered_payload = base64.urlsafe_b64encode(
            json.dumps({"exp": int(time.time() * 1000) + 31_536_000_000},
                       separators=(",", ":")).encode()).decode().rstrip("=")
        self.assertNotEqual(tampered_payload, payload)
        self.assertRefused(*self.post(ticket=f"{tampered_payload}.{sig}"))

    def test_garbage_ticket_is_refused(self):
        for junk in ("", "....", "nodot", "a.b", "%%%.$$$"):
            with self.subTest(junk=junk):
                self.assertRefused(*self.post(ticket=junk))

    def test_ticket_does_not_unlock_other_routes(self):
        """A ticket authorises a COMPILE. It is not a keeper-wide credential.

        Without this, a ticket minted for a 6 MB compile would also grant read
        and write on every stored script.
        """
        req = urllib.request.Request(self.base + "/v1/admin/objects", method="GET")
        req.add_header("Origin", ORIGIN)
        req.add_header("X-SH-Ticket", mint(TOKEN, int(time.time() * 1000) + 600_000))
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.fail(f"a compile ticket listed stored scripts: {resp.status}")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
