"""Storage Keeper - configuration.

Every knob is an environment variable with a safe default, so the service runs with no
setup at all. Nothing here is ever echoed to an HTTP client: the values include a token,
and a token in a log line is a token in somebody's scrollback.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

# The service refuses to run against a root that is not a real directory. Kept as a
# module constant so tests can assert on it without importing config.
DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "data"

# Hard retention ceiling. This is a SAFETY NET, not a feature: an object that somehow
# outlives its own expiry is still removed at this age. It is not the default lifetime -
# objects with no explicit expiry live until this cap.
HARD_CAP_DAYS = 365
HARD_CAP_SECONDS = HARD_CAP_DAYS * 24 * 60 * 60


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _persisted_token(root: Path) -> str:
    """The token from a previous run, or "" on a first run.

    WHY THIS EXISTS, AND WHY IT IS NOT THE OBVIOUS SIMPLIFICATION

    Generating a fresh token per run looks like the safer default, and tunnel.py
    already persists one. But this function is reached by a BARE
    `py run.py` restart, which is exactly what an operator does after pulling
    a change - and that path used to mint a new token silently.

    The worker holds its own copy of this token. So a "harmless" restart locked
    the service out of its own worker: every script stopped delivering and every
    browser call returned a credential error, with nothing in the keeper's own
    logs to say the token had changed. The service looked perfectly healthy.

    A token is only secret because it is the SAME secret in two places. Changing
    it in one place is a configuration change, so it must not be something a
    restart can do by accident. Reading the previous value first - and writing
    it on first run - makes a restart idempotent, which is the whole property
    that was missing.
    """
    token_file = root / "token.txt"
    try:
        existing = token_file.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        existing = ""
    if existing:
        return existing

    fresh = secrets.token_urlsafe(32)
    try:
        root.mkdir(parents=True, exist_ok=True)
        token_file.write_text(fresh, encoding="utf-8")
    except OSError:
        # An unwritable data directory must not stop the service from starting.
        # The operator reads the token from the startup banner instead.
        pass
    return fresh


@dataclass(frozen=True)
class Config:
    """Resolved runtime configuration."""

    root: Path = DEFAULT_ROOT
    host: str = "127.0.0.1"
    port: int = 8787

    # Write/read/delete authorisation. Generated at startup if unset so the service is
    # NEVER reachable without a token, even by accident.
    token: str = field(default_factory=lambda: os.environ.get("SH_STORE_TOKEN", "") or "")

    # Largest single object accepted, in bytes.
    max_object_bytes: int = 64 * 1024 * 1024

    # How often the cleanup thread sweeps for expired objects.
    cleanup_interval_seconds: int = 300

    # Set true only by the test suite. Never reachable from a real request.
    allow_empty_token: bool = False

    @classmethod
    def from_env(cls, **overrides) -> "Config":
        root = Path(overrides.get("root") or os.environ.get("SH_STORE_ROOT") or DEFAULT_ROOT)
        cfg = cls(
            root=root,
            host=os.environ.get("SH_STORE_HOST") or "127.0.0.1",
            port=_env_int("SH_STORE_PORT", 8787),
            token=os.environ.get("SH_STORE_TOKEN", ""),
            max_object_bytes=_env_int("SH_STORE_MAX_OBJECT_BYTES", 64 * 1024 * 1024),
            cleanup_interval_seconds=_env_int("SH_STORE_CLEANUP_SECONDS", 300),
        )
        if not cfg.token:
            # Resolved against the SAME root the service will use.
            #
            # This used to read the environment/default root and apply the
            # caller's root override afterwards, so `from_env(root=tmp)` read
            # and could WRITE the real data/token.txt while appearing to work
            # in a temporary directory. Order matters: the root has to be
            # settled before anything touches the disk.
            token = _persisted_token(root) or secrets.token_urlsafe(32)
            cfg = Config(**{**cfg.__dict__, "token": token})
        if overrides:
            cfg = Config(**{**cfg.__dict__, **overrides})
        return cfg

    # -- derived paths -----------------------------------------------------
    @property
    def objects_dir(self) -> Path:
        return self.root / "scripts"

    @property
    def db_path(self) -> Path:
        return self.root / "index.sqlite3"

    def ensure_dirs(self) -> None:
        self.objects_dir.mkdir(parents=True, exist_ok=True)


# The one message a client is allowed to see for a missing or expired script. The loader
# turns it into the required sentence, and nothing about the filesystem leaks through it.
GONE_BODY = b"SHERR gone"

# Required user-facing sentence, produced by the loader from SHERR gone.
GONE_MESSAGE = "Script cannot be loaded, doesnt exist or expired."