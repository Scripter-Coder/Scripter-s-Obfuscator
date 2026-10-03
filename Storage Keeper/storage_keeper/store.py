"""On-disk object store with a SQLite index.

Layout under the storage root:

    data/scripts/<id>.bin      the bytes
    data/index.sqlite3         id -> kind -> {size, sha256, expiry, state}

Expiry is enforced HERE, on every read, not by the caller and not by the browser. A
countdown in the UI is a courtesy; this is the authority. An object is gone when either
its own expiry has passed OR it has reached the one-year hard cap, and in both cases the
file is unlinked rather than merely hidden.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

from .config import HARD_CAP_SECONDS, Config
from .ids import KIND_ARTIFACT, KIND_LOADER, KINDS, InvalidId, new_id, validate_id, validate_kind

SCHEMA = """
CREATE TABLE IF NOT EXISTS objects (
    script_id   TEXT NOT NULL,
    kind        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER,            -- NULL means "no timer set"
    hard_cap_at INTEGER NOT NULL,    -- created_at + 1 year, always
    size        INTEGER NOT NULL,
    sha256      TEXT NOT NULL,
    state       TEXT NOT NULL,       -- 'live' | 'expired' | 'deleted'
    PRIMARY KEY (script_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_objects_state ON objects(state, hard_cap_at);
CREATE TABLE IF NOT EXISTS migrations (
    source      TEXT PRIMARY KEY,
    script_id   TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    migrated_at INTEGER NOT NULL,
    source_removed INTEGER NOT NULL DEFAULT 0
);
"""


@dataclass(frozen=True)
class Record:
    script_id: str
    kind: str
    created_at: int
    expires_at: Optional[int]
    hard_cap_at: int
    size: int
    sha256: str
    state: str

    def is_expired(self, now: Optional[int] = None) -> bool:
        """The authority on liveness. One year maximum, always, regardless of intent."""
        if self.state != "live":
            return True
        t = int(time.time()) if now is None else now
        if t >= self.hard_cap_at:
            return True
        return self.expires_at is not None and t >= self.expires_at

    @property
    def has_timer(self) -> bool:
        """True when the owner set an explicit expiry, as opposed to relying on the cap."""
        return self.expires_at is not None

    def expires_effective_at(self) -> int:
        """When this object actually stops working: the earlier of its timer and the cap."""
        return min(self.hard_cap_at, self.expires_at) if self.expires_at else self.hard_cap_at

    def to_public(self, now: Optional[int] = None) -> dict:
        """Metadata safe to hand to a client: no path, no filename, nothing internal."""
        t = int(time.time()) if now is None else now
        eff = self.expires_effective_at()
        return {
            "id": self.script_id,
            "kind": self.kind,
            "size": self.size,
            "sha256": self.sha256,
            "created_at": self.created_at,
            "expires_at": self.expires_at,          # the owner's timer, or null
            "hard_cap_at": self.hard_cap_at,
            "effective_expires_at": eff,             # what the countdown must show
            "remaining_seconds": max(0, eff - t),
            "has_timer": self.expires_at is not None,
            "state": "expired" if self.is_expired(t) else "live",
        }


class Store:
    def __init__(self, config: Config):
        self.config = config
        self.config.ensure_dirs()
        self.root = self.config.objects_dir.resolve()
        self._local = threading.local()
        self._write_lock = threading.Lock()
        # Every connection handed out is retained here. Thread-local storage alone
        # cannot be closed from anywhere else, so a service with a worker pool would
        # leak a database handle per thread for its whole lifetime - and on Windows a
        # leaked handle makes the file undeletable, which is how this was found.
        self._conns: list[sqlite3.Connection] = []
        self._conns_lock = threading.Lock()
        self._init_db()

    # -- sqlite plumbing ---------------------------------------------------
    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            # check_same_thread=False is required, not merely convenient. Each thread
            # gets its OWN connection, so there is no sharing - but close() is called
            # from whichever thread is shutting the store down, and with the default
            # True that raises ProgrammingError, which leaves the handle open and the
            # database file undeletable on Windows. Writes are still serialised by
            # _write_lock, and WAL is what makes the concurrent readers safe.
            conn = sqlite3.connect(str(self.config.db_path), timeout=30.0, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            # WAL lets the cleanup thread delete while readers are mid-download.
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA busy_timeout=30000")
            conn.execute("PRAGMA foreign_keys=ON")
            self._local.conn = conn
            with self._conns_lock:
                self._conns.append(conn)
        return conn

    def _init_db(self) -> None:
        conn = self._conn()
        with self._write_lock:
            conn.executescript(SCHEMA)
            conn.commit()

    # -- path handling -----------------------------------------------------
    def _path_for(self, script_id: str, kind: str) -> Path:
        """Resolve an id to a path. The id is the ONLY input.

        The containment assert is not redundant belt-and-braces for its own sake: it is
        the single place where an id becomes a path, so it is the single place where a
        path-escape bug would have to be caught.
        """
        script_id = validate_id(script_id)
        validate_kind(kind)
        # The kind is part of the filename. Without it, artifact and loader resolve to
        # the same file and storing one silently destroys the other - which is invisible
        # until a script publishes fine and then delivers the loader text as its body.
        candidate = (self.root / f"{script_id}.{kind}.bin").resolve()
        if candidate.parent != self.root:
            raise InvalidId("resolved path escaped the storage root")
        return candidate

    # -- writes ------------------------------------------------------------
    def put(
        self,
        data: bytes,
        kind: str = KIND_ARTIFACT,
        script_id: Optional[str] = None,
        expires_at: Optional[int] = None,
        now: Optional[int] = None,
    ) -> Record:
        """Store bytes. Atomic: the file lands via os.replace, never partially."""
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError("data must be bytes")
        data = bytes(data)
        if len(data) == 0:
            raise ValueError("refusing to store an empty object")
        if len(data) > self.config.max_object_bytes:
            raise ValueError("object exceeds the configured size limit")

        kind = validate_kind(kind)
        t = int(time.time()) if now is None else now

        with self._write_lock:
            sid = script_id
            if sid is None:
                # Collision-checked mint. 10^10 ids makes this rare, but "rare" is not
                # "impossible" and an id collision would overwrite a live script.
                for _ in range(64):
                    cand = new_id()
                    if self._get_row(cand, kind) is None:
                        sid = cand
                        break
                if sid is None:
                    raise RuntimeError("could not mint a unique script id")
            sid = validate_id(sid)

            # The owner may set a timer, but never past the one-year cap. A 5-year timer
            # is not a longer lifetime; it is the cap.
            if expires_at is not None:
                expires_at = int(expires_at)
                if expires_at > t + HARD_CAP_SECONDS:
                    expires_at = t + HARD_CAP_SECONDS
                if expires_at <= t:
                    raise ValueError("expiry must be in the future")

            hard_cap_at = t + HARD_CAP_SECONDS
            digest = hashlib.sha256(data).hexdigest()
            path = self._path_for(sid, kind)

            # Write to a temp file in the SAME directory, then replace. os.replace is
            # atomic on Windows and POSIX, so a reader sees either the old file or the
            # new one, never a half-written one.
            fd, tmp = tempfile.mkstemp(dir=str(self.root), prefix=".tmp-", suffix=".part")
            try:
                with os.fdopen(fd, "wb") as fh:
                    fh.write(data)
                    fh.flush()
                    os.fsync(fh.fileno())
                os.replace(tmp, path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise

            conn = self._conn()
            # Re-uploading a LIVE script replaces its content but does NOT reset its age.
            # If created_at/hard_cap_at were overwritten here, publishing the same id
            # every month would keep a script alive forever, and the one-year maximum
            # would bind only on scripts nobody touched - the opposite of what a
            # retention ceiling is for.
            #
            # An EXPIRED or deleted id is treated as a fresh create. Re-publishing a dead
            # script is a new act by the owner, and refusing it would make the id
            # permanently unusable with no way back short of deleting the row by hand.
            conn.execute(
                """INSERT INTO objects(script_id,kind,created_at,expires_at,hard_cap_at,size,sha256,state)
                   VALUES(?,?,?,?,?,?,?,'live')
                   ON CONFLICT(script_id,kind) DO UPDATE SET
                     created_at  = CASE WHEN objects.state='live' THEN objects.created_at  ELSE excluded.created_at  END,
                     hard_cap_at = CASE WHEN objects.state='live' THEN objects.hard_cap_at ELSE excluded.hard_cap_at END,
                     expires_at  = excluded.expires_at,
                     size        = excluded.size,
                     sha256      = excluded.sha256,
                     state       = 'live'""",
                (sid, kind, t, expires_at, hard_cap_at, len(data), digest),
            )
            conn.commit()
            return Record(sid, kind, t, expires_at, hard_cap_at, len(data), digest, "live")

    # -- reads -------------------------------------------------------------
    def _get_row(self, script_id: str, kind: str) -> Optional[sqlite3.Row]:
        conn = self._conn()
        return conn.execute(
            "SELECT * FROM objects WHERE script_id=? AND kind=?", (script_id, kind)
        ).fetchone()

    @staticmethod
    def _to_record(row: sqlite3.Row) -> Record:
        return Record(
            script_id=row["script_id"],
            kind=row["kind"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            hard_cap_at=row["hard_cap_at"],
            size=row["size"],
            sha256=row["sha256"],
            state=row["state"],
        )

    def head(self, script_id: str, kind: str = KIND_ARTIFACT, now: Optional[int] = None) -> Optional[Record]:
        """Metadata only. Returns None if missing OR expired - callers cannot tell which,
        and must not be able to: 'missing' and 'expired' are the same answer to a caller."""
        try:
            row = self._get_row(script_id, kind)
        except InvalidId:
            return None
        if row is None:
            return None
        rec = self._to_record(row)
        if rec.is_expired(now):
            # Mark it, so the UI and the cleanup sweep agree without waiting for a tick.
            self._mark_expired(rec)
            return None
        return rec

    def get(self, script_id: str, kind: str = KIND_ARTIFACT, now: Optional[int] = None) -> Optional[bytes]:
        """Read bytes. None means gone or expired - indistinguishable by design."""
        rec = self.head(script_id, kind, now)
        if rec is None:
            return None
        path = self._path_for(script_id, kind)
        try:
            data = path.read_bytes()
        except OSError:
            # The row says live but the file is not there. The index is not the truth;
            # the filesystem is. Report gone rather than serving a hole.
            return None
        if hashlib.sha256(data).hexdigest() != rec.sha256:
            # A truncated or altered file must not be served as if it were the script.
            return None
        return data

    def _mark_expired(self, rec: Record) -> None:
        """Record the expiry AND remove the bytes.

        Marking the row alone would leave the script sitting on disk until the next
        sweep, so an expired script would still occupy disk for up to one cleanup
        interval. Expiry means the bytes are gone, not that a flag says they are gone.
        """
        try:
            self._path_for(rec.script_id, rec.kind).unlink()
        except (FileNotFoundError, InvalidId):
            pass
        except OSError:
            pass  # the sweep will retry
        try:
            conn = self._conn()
            with self._write_lock:
                conn.execute(
                    "UPDATE objects SET state='expired' WHERE script_id=? AND kind=?",
                    (rec.script_id, rec.kind),
                )
                conn.commit()
        except sqlite3.Error:
            pass

    def exists(self, script_id: str, kind: str = KIND_ARTIFACT, now: Optional[int] = None) -> bool:
        return self.head(script_id, kind, now) is not None

    # -- deletes -----------------------------------------------------------
    def delete(self, script_id: str, kind: Optional[str] = None, hard: bool = False) -> int:
        """Remove one kind, or every kind for the script. Returns objects removed."""
        try:
            validate_id(script_id)
        except InvalidId:
            return 0
        if kind:
            kinds: tuple[str, ...] = (kind,)
        else:
            # Every kind the index knows for this script, not just the three singletons.
            #
            # Enumerating a fixed tuple here would leave part0..partN on disk while their
            # rows were cleared - and the sweep walks ROWS, so it could never see them
            # again. That is silent, permanent disk usage on the owner's drive, invisible
            # to every stat the service reports, which is the worst shape a leak can take.
            rows = self._conn().execute(
                "SELECT DISTINCT kind FROM objects WHERE script_id=?", (script_id,)
            ).fetchall()
            kinds = tuple(dict.fromkeys(tuple(KINDS) + tuple(r["kind"] for r in rows)))
        removed = 0
        for k in kinds:
            try:
                path = self._path_for(script_id, k)
            except InvalidId:
                continue
            try:
                path.unlink()
                removed += 1
            except FileNotFoundError:
                pass
            except OSError:
                # The row is only cleared if the bytes actually went away. A row marked
                # deleted while the file survives is a leak that cleanup can no longer see.
                continue
            conn = self._conn()
            with self._write_lock:
                conn.execute(
                    "UPDATE objects SET state='deleted' WHERE script_id=? AND kind=?",
                    (script_id, k),
                )
                conn.commit()
        return removed

    # -- cleanup -----------------------------------------------------------
    def sweep(self, now: Optional[int] = None, remove_files: bool = True) -> dict:
        """One cleanup pass. Removes expired objects and anything past the hard cap."""
        t = int(time.time()) if now is None else now
        conn = self._conn()
        rows = conn.execute(
            "SELECT script_id, kind, expires_at, hard_cap_at FROM objects WHERE state='live'"
        ).fetchall()
        expired_rows = conn.execute(
            "SELECT script_id, kind FROM objects WHERE state='expired'"
        ).fetchall()

        expired: list[tuple[str, str]] = []
        for r in rows:
            past_cap = t >= r["hard_cap_at"]
            past_timer = r["expires_at"] is not None and t >= r["expires_at"]
            if past_cap or past_timer:
                expired.append((r["script_id"], r["kind"]))

        removed_files = 0
        removed_rows = 0
        targets = expired + [(r["script_id"], r["kind"]) for r in expired_rows]
        for script_id, kind in targets:
            if remove_files:
                try:
                    self._path_for(script_id, kind).unlink()
                    removed_files += 1
                except FileNotFoundError:
                    pass
                except (InvalidId, OSError):
                    continue
            with self._write_lock:
                conn.execute(
                    "UPDATE objects SET state='expired' WHERE script_id=? AND kind=?",
                    (script_id, kind),
                )
                conn.commit()
                removed_rows += 1

        # Temp files from an interrupted write are never referenced by any row.
        orphan_tmp = 0
        if remove_files:
            for stray in self.root.glob(".tmp-*.part"):
                try:
                    stray.unlink()
                    orphan_tmp += 1
                except OSError:
                    pass

        return {
            "checked": len(rows),
            "expired": len(expired),
            "removed_files": removed_files,
            "removed_rows": removed_rows,
            "orphan_tmp_removed": orphan_tmp,
        }

    # -- listing -----------------------------------------------------------
    def list(self, now: Optional[int] = None) -> Iterator[Record]:
        conn = self._conn()
        for row in conn.execute("SELECT * FROM objects ORDER BY created_at DESC"):
            yield self._to_record(row)

    def stats(self, now: Optional[int] = None) -> dict:
        t = int(time.time()) if now is None else now
        recs = list(self.list(t))
        live = [r for r in recs if not r.is_expired(t) and r.state == "live"]
        return {
            "objects": len(recs),
            "live": len(live),
            "expired": sum(1 for r in recs if r.is_expired(t)),
            "bytes_live": sum(r.size for r in live),
            "next_expiry_in": min((r.expires_effective_at() for r in live), default=None),
        }

    def close(self) -> list[str]:
        """Close every connection this store ever opened, from any thread.

        Returns the failures instead of swallowing them. An earlier version caught
        sqlite3.Error and passed, which turned a real leak - connections that never
        close because close() itself throws - into a silent one.
        """
        with self._conns_lock:
            conns, self._conns = self._conns, []
        failures: list[str] = []
        for conn in conns:
            try:
                conn.close()
            except Exception as e:  # noqa: BLE001 - reported, never hidden
                failures.append(f"{type(e).__name__}: {e}")
        self._local.conn = None
        return failures

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # -- migration ---------------------------------------------------------
    def note_migration(self, source: str, script_id: str, sha256: str) -> None:
        conn = self._conn()
        with self._write_lock:
            conn.execute(
                """INSERT INTO migrations(source,script_id,sha256,migrated_at)
                   VALUES(?,?,?,?)
                   ON CONFLICT(source) DO UPDATE SET
                     script_id=excluded.script_id, sha256=excluded.sha256,
                     migrated_at=excluded.migrated_at, source_removed=0""",
                (source, script_id, sha256, int(time.time())),
            )
            conn.commit()

    def migrations(self) -> list[dict]:
        conn = self._conn()
        return [dict(r) for r in conn.execute("SELECT * FROM migrations ORDER BY migrated_at DESC")]

    def mark_source_removed(self, source: str) -> None:
        conn = self._conn()
        with self._write_lock:
            conn.execute("UPDATE migrations SET source_removed=1 WHERE source=?", (source,))
            conn.commit()