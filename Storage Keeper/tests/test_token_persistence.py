"""Storage Keeper/tests/test_token_persistence.py

A restart must not change the bearer token.

WHY THIS TEST EXISTS

The worker holds its own copy of the keeper's token. ``tunnel.py`` persisted one
to ``data/token.txt``, but a BARE ``py run.py`` restart - which is exactly what
an operator does after pulling a change - went through
``Config.from_env()``, found no ``SH_STORE_TOKEN`` in the environment, and minted
a brand new one.

The result looked like a healthy service that had lost its configuration: every
script stopped delivering, every browser call came back a credential error, and
nothing in the keeper's own logs said the token had changed. Restarting the
keeper - the obvious remedy - silently re-broke it, because each restart minted
another token.

So: a restart is a routine action and must be idempotent. These tests pin that.

Run:  py "Storage Keeper/tests/test_token_persistence.py"
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from storage_keeper.config import Config, _persisted_token  # noqa: E402


class TokenPersistenceTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        # Make sure a developer's real SH_STORE_TOKEN cannot make these pass or
        # fail by accident.
        self._saved = os.environ.pop("SH_STORE_TOKEN", None)
        self._saved_root = os.environ.pop("SH_STORE_ROOT", None)

    def tearDown(self):
        for key, value in (("SH_STORE_TOKEN", self._saved), ("SH_STORE_ROOT", self._saved_root)):
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def from_env(self):
        return Config.from_env(root=self.root)

    # -- the property ------------------------------------------------------
    def test_restart_keeps_the_same_token(self):
        """THE test. Stop the service, start it again, and nothing moved."""
        first = self.from_env().token
        second = self.from_env().token
        self.assertTrue(first, "no token was produced at all")
        self.assertEqual(first, second,
                         "a restart changed the bearer token; the worker holds the old "
                         "one and every script would stop delivering")

    def test_token_is_persisted_to_disk(self):
        """It has to survive the process, not just the Config object."""
        token = self.from_env().token
        on_disk = (self.root / "token.txt").read_text(encoding="utf-8").strip()
        self.assertEqual(token, on_disk)

    def test_token_is_written_on_first_run_only(self):
        """A restart must not rewrite the file either.

        If it did, and the write were interrupted, the next start would mint a
        new token - the same failure with an extra step.
        """
        self.from_env()
        path = self.root / "token.txt"
        before = path.stat().st_mtime_ns
        self.from_env()
        self.assertEqual(before, path.stat().st_mtime_ns,
                         "a restart rewrote token.txt")

    def test_many_restarts_stay_stable(self):
        tokens = {self.from_env().token for _ in range(8)}
        self.assertEqual(len(tokens), 1, f"token changed across restarts: {len(tokens)} distinct values")

    def test_existing_token_file_is_honoured(self):
        """A token written by tunnel.py, or by hand, must win.

        This is the migration path: an operator who already has a working token
        on disk must not be handed a new one, because the worker already has the
        old one.
        """
        (self.root / "token.txt").write_text("the-token-the-worker-already-has", encoding="utf-8")
        self.assertEqual(self.from_env().token, "the-token-the-worker-already-has")

    # -- safety must not be weakened --------------------------------------
    def test_env_var_still_wins(self):
        """An explicit SH_STORE_TOKEN is the operator's override."""
        os.environ["SH_STORE_TOKEN"] = "explicitly-set"
        try:
            self.assertEqual(self.from_env().token, "explicitly-set")
        finally:
            os.environ.pop("SH_STORE_TOKEN", None)

    def test_first_run_still_generates_a_real_token(self):
        """Never an empty token - that would make the service reachable by anyone."""
        token = _persisted_token(self.root)
        self.assertTrue(token)
        self.assertGreaterEqual(len(token), 32, "token is too short to be a real secret")

    def test_blank_token_file_is_replaced_not_trusted(self):
        """An empty file must not yield an empty token."""
        (self.root / "token.txt").write_text("   \n", encoding="utf-8")
        token = self.from_env().token
        self.assertTrue(token, "a blank token.txt produced an unauthenticated service")


if __name__ == "__main__":
    unittest.main(verbosity=2)
