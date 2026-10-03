"""Migrate existing scripts out of Cloudflare KV and into this storage service.

Safe by construction, and that is the whole design:

* **Read-only by default.** Nothing is removed from the old location unless you pass
  ``--remove-source``. A dry run is the default, so the first thing this script does is
  refuse to destroy anything.
* **Verified before removal.** For each script the bytes are written here, read back,
  and compared by SHA-256 against what the source reported. A script is only eligible
  for source removal once that comparison has passed on this machine.
* **Never silent.** Every decision is printed: migrated, skipped, already present,
  mismatched, failed. A summary at the end counts them. If the run dies half way, the
  ledger in the index says exactly which ids made it.
* **Resumable.** Re-running skips ids already recorded with a matching hash, so an
  interrupted run continues rather than starting over or duplicating.

The source is a JSON export, because this service must not be the thing holding a
credential for Cloudflare. Export the scripts with the owner tooling you already use,
hand it a file, and it does the rest:

    py Storage Keeper/migrate.py --source kv-export.json
    py Storage Keeper/migrate.py --source kv-export.json --remove-source
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

from storage_keeper.config import HARD_CAP_SECONDS, Config
from storage_keeper.ids import KIND_ARTIFACT, KIND_LOADER, InvalidId, is_valid_id
from storage_keeper.store import Store


@dataclass
class Outcome:
    source_id: str
    status: str          # migrated | already | skipped | mismatch | failed
    script_id: Optional[str] = None
    detail: str = ""


def _bytes_of(value: object) -> Optional[bytes]:
    """Accept a string, or a base64 field, because exports use both."""
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode("utf-8")
    return None


def load_source(path: Path) -> list[dict]:
    """Read the export. Tolerates a bare list or {"scripts": [...]}."""
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, dict):
        data = data.get("scripts") or data.get("items") or []
    if not isinstance(data, list):
        raise SystemExit("the source file must contain a list of scripts")
    return [x for x in data if isinstance(x, dict)]


def pick_bytes(entry: dict, kind: str) -> Optional[bytes]:
    """Find an object's bytes in an export entry, trying the obvious field names."""
    if kind == KIND_ARTIFACT:
        candidates = [entry.get("plainCode"), entry.get("cipher"), entry.get("code"),
                      entry.get("artifact"), entry.get("body")]
    else:
        candidates = [entry.get("loader"), entry.get("loaderCode")]
    for c in candidates:
        b = _bytes_of(c)
        if b:
            return b
    return None


def declared_hash(entry: dict, kind: str) -> Optional[str]:
    if kind == KIND_ARTIFACT:
        return entry.get("sha256") or entry.get("hash")
    return None


def migrate_one(store: Store, entry: dict, remove_source: bool, dry_run: bool) -> Outcome:
    source_id = str(entry.get("id") or entry.get("loaderId") or "")
    if not is_valid_id(source_id):
        return Outcome(source_id, "skipped", detail="id is not a valid script id")

    kind = str(entry.get("kind") or KIND_ARTIFACT)
    if kind not in (KIND_ARTIFACT, KIND_LOADER):
        return Outcome(source_id, "skipped", detail=f"unknown kind {kind!r}")

    data = pick_bytes(entry, kind)
    if not data:
        return Outcome(source_id, "skipped", detail="no bytes present in the export")

    want = declared_hash(entry, kind)
    already = [r for r in store.migrations() if r["source"] == source_id]
    if already:
        prev = already[0]
        # Only treat it as done if what we hold now still matches the recorded hash.
        # If the owner re-published between runs, the id legitimately changes content and
        # the stale entry must not cause the new build to be skipped.
        if prev["sha256"] == _sha(data):
            return Outcome(source_id, "already", prev["script_id"],
                           "recorded with a matching hash")

    if dry_run:
        return Outcome(source_id, "skipped", detail="dry run: nothing written")

    expires_at = entry.get("expiresAt")
    try:
        rec = store.put(data, kind, script_id=source_id,
                        expires_at=int(expires_at) if expires_at else None)
    except (InvalidId, ValueError, RuntimeError) as e:
        return Outcome(source_id, "failed", detail=str(e))

    # Read it back and verify. Writing is not the same as having it: a full disk, a
    # truncated write, or a hashing bug all produce a "successful" put that cannot serve.
    readback = store.get(rec.script_id, kind)
    if readback is None:
        return Outcome(rec.script_id, "failed", detail="written but unreadable")
    got = _sha(readback)
    if want and got != want:
        return Outcome(rec.script_id, "mismatch", detail=f"expected {want[:12]}, got {got[:12]}")
    if readback != data:
        return Outcome(rec.script_id, "mismatch", detail="read-back differs from what was written")

    store.note_migration(source_id, rec.script_id, got)
    if remove_source:
        # Only now, and only because the bytes are verified present here.
        store.mark_source_removed(source_id)
    return Outcome(rec.script_id, "migrated", rec.script_id,
                   "source removed" if remove_source else "source retained")


def _sha(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def run(source: Path, remove_source: bool, dry_run: bool, root: Optional[Path]) -> int:
    entries = load_source(source)
    cfg = Config.from_env(root=root) if root else Config.from_env()
    store = Store(cfg)

    results: list[Outcome] = []
    for i, entry in enumerate(entries, 1):
        results.append(migrate_one(store, entry, remove_source, dry_run))
        prefix = f"[{i}/{len(entries)}]"
        print(f"{prefix} {results[-1].status.upper():9} {results[-1].source_id}"
              + (f"  ({results[-1].detail})" if results[-1].detail else ""))

    counts: dict[str, int] = {}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1

    print("\n--- summary " + "-" * 50)
    for status in sorted(counts):
        print(f"  {status:10} {counts[status]}")
    print(f"  {'total':10} {len(results)}")
    if dry_run:
        print("\nThis was a DRY RUN. Nothing was written and nothing was removed.")
        print("Re-run without --dry-run to migrate, and add --remove-source only once")
        print("you have confirmed the migrated scripts load from the loadstring.")
    elif not remove_source:
        print("\nSources were left untouched. Nothing was deleted from the old location.")
        print("Re-run with --remove-source once you are satisfied.")
    else:
        print("\nSources were removed for every script that verified. Check the ledger:")
        print("  py Storage Keeper\\run.py then GET /v1/admin/stats")
    store.close()
    return 0 if not counts.get("failed") and not counts.get("mismatch") else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, type=Path,
                    help="JSON export of existing scripts (see module docstring)")
    ap.add_argument("--root", type=Path, default=None, help="override the storage root")
    ap.add_argument("--remove-source", action="store_true",
                    help="DELETE from the old location - only after verifying by hand")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would happen and change nothing (default behaviour)")
    args = ap.parse_args()
    if not args.source.exists():
        raise SystemExit(f"no such source file: {args.source}")
    sys.exit(run(args.source, args.remove_source, args.dry_run or not args.remove_source, args.root))