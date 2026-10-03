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
        cfg = cls(
            root=Path(os.environ.get("SH_STORE_ROOT") or DEFAULT_ROOT),
            host=os.environ.get("SH_STORE_HOST") or "127.0.0.1",
            port=_env_int("SH_STORE_PORT", 8787),
            token=os.environ.get("SH_STORE_TOKEN", ""),
            max_object_bytes=_env_int("SH_STORE_MAX_OBJECT_BYTES", 64 * 1024 * 1024),
            cleanup_interval_seconds=_env_int("SH_STORE_CLEANUP_SECONDS", 300),
        )
        if not cfg.token:
            # Never fall back to an empty token on a real service. Generating one keeps the
            # service safe by default; the operator reads it from the startup banner.
            cfg = Config(**{**cfg.__dict__, "token": secrets.token_urlsafe(32)})
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