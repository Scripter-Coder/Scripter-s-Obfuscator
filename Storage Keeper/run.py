"""Storage Keeper entrypoint.

    py Storage Keeper/run.py

Environment:
    SH_STORE_TOKEN               bearer token. Generated per-run if unset.
    SH_STORE_ROOT                storage directory (default: ./Storage Keeper/data)
    SH_STORE_HOST                bind address (default 127.0.0.1 - loopback only)
    SH_STORE_PORT                bind port (default 8787)
    SH_STORE_MAX_OBJECT_BYTES    per-object ceiling (default 64 MiB)
    SH_STORE_CLEANUP_SECONDS     sweep interval (default 300)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from storage_keeper import serve  # noqa: E402
from storage_keeper.config import Config  # noqa: E402

if __name__ == "__main__":
    serve(Config.from_env())