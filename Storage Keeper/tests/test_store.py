"""Store layer tests. Run: py Storage Keeper/tests/test_store.py"""

from __future__ import annotations

import contextlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from storage_keeper.config import GONE_MESSAGE, HARD_CAP_SECONDS, Config
from storage_keeper.ids import (
    InvalidId,
    is_part_kind,
    is_valid_id,
    part_kind,
    validate_id,
    validate_kind,
)
from storage_keeper.store import Store

NOW = 1_800_000_000  # fixed clock, so expiry assertions are exact rather than timing-dependent


def make_store(tmp: str) -> Store:
    return Config and Store(
        Config(
            root=Path(tmp),
            token="t" * 40,
            max_object_bytes=64 * 1024,
            cleanup_interval_seconds=300,
        )
    )


@contextlib.contextmanager
def store_ctx():
    """A store over a throwaway directory.

    The store is closed BEFORE the directory is removed. Order matters on Windows: an
    open SQLite handle makes the file undeletable, so a leaked handle turns every test
    into a PermissionError in tempfile cleanup - a failure that looks like a bug in the
    code under test and is actually a bug in the test's teardown.
    """
    with tempfile.TemporaryDirectory() as tmp:
        st = make_store(tmp)
        try:
            yield st
        finally:
            failures = st.close()
            if failures:
                # A handle that will not close makes every later teardown fail with an
                # unrelated-looking PermissionError. Fail here, where it is explainable.
                raise AssertionError(f"store.close() left connections open: {failures}")


class TestIdValidation(unittest.TestCase):
    def test_accepts_the_grammar_the_worker_uses(self):
        for good in ("ScripterHub5873710983", "ScripterHub123456", "ScripterHub1234567890123456"):
            self.assertTrue(is_valid_id(good), good)
            self.assertEqual(validate_id(good), good)

    def test_rejects_everything_else(self):
        for bad in (
            "", "ScripterHub", "ScripterHub12345", "ScripterHub12345678901234567",
            "scripterhub1234567890", "ScripterHub123456789a", "ScripterHub1234567890 ",
            "ScripterHub1234567890/", "ScripterHub1234567890\\",
            "../ScripterHub1234567890", "ScripterHub1234567890/../../etc/passwd",
            "ScripterHub1234567890:stream", "ScripterHub1234567890%00",
            ".ScripterHub1234567890", "ScripterHub-1234567890", "ScripterHub+1234567890",
            "ScripterHub1234567890\x00",
        ):
            self.assertFalse(is_valid_id(bad), repr(bad))
            with self.assertRaises(InvalidId, msg=repr(bad)):
                validate_id(bad)

    def test_rejects_non_strings(self):
        for bad in (None, 123, [], {}, b"ScripterHub1234567890", True):
            with self.assertRaises(InvalidId):
                validate_id(bad)

    def test_traversal_never_produces_a_path_outside_the_root(self):
        """The containment check, not the regex, is the last line of defence."""
        with store_ctx() as st:
            for evil in ("../../windows/system32", "..\\..\\boot.ini", "/etc/passwd"):
                with self.assertRaises(InvalidId, msg=repr(evil)):
                    st._path_for(evil, "artifact")
            good = st._path_for("ScripterHub1234567890", "artifact")
            self.assertEqual(good.parent, st.root)
            self.assertNotIn("..", good.name)


class TestPutAndGet(unittest.TestCase):
    def test_round_trip(self):
        with store_ctx() as st:
            rec = st.put(b"print(1)", "artifact", now=NOW)
            self.assertTrue(is_valid_id(rec.script_id))
            self.assertEqual(st.get(rec.script_id, "artifact", now=NOW), b"print(1)")
            self.assertEqual(rec.size, 8)
            self.assertEqual(len(rec.sha256), 64)

    def test_expires_at_is_stored_and_read_back(self):
        with store_ctx() as st:
            want = NOW + 3600
            rec = st.put(b"x" * 10, "artifact", expires_at=want, now=NOW)
            self.assertEqual(rec.expires_at, want)
            self.assertTrue(rec.has_timer)
            self.assertEqual(rec.expires_effective_at(), want)

    def test_no_timer_by_default(self):
        """Creating a script has no timer. The one-year cap still applies."""
        with store_ctx() as st:
            rec = st.put(b"x" * 10, "artifact", now=NOW)
            self.assertIsNone(rec.expires_at)
            self.assertFalse(rec.has_timer)
            self.assertEqual(rec.expires_effective_at(), rec.hard_cap_at)
            self.assertEqual(rec.hard_cap_at, NOW + HARD_CAP_SECONDS)

    def test_expiry_is_clamped_to_one_year(self):
        with store_ctx() as st:
            rec = st.put(b"x", "artifact", expires_at=NOW + 10 * 365 * 86400, now=NOW)
            self.assertEqual(rec.expires_at, NOW + HARD_CAP_SECONDS,
                             "a 10-year timer must not outlive the 1-year cap")

    def test_rejects_empty_and_oversized(self):
        with store_ctx() as st:
            with self.assertRaises(ValueError):
                st.put(b"", now=NOW)
            with self.assertRaises(ValueError):
                st.put(b"x" * (64 * 1024 + 1), now=NOW)
            with self.assertRaises(TypeError):
                st.put("a string", now=NOW)  # type: ignore[arg-type]

    def test_explicit_id_is_honoured_and_reused(self):
        with store_ctx() as st:
            st.put(b"v1", "artifact", script_id="ScripterHub1111111111", now=NOW)
            st.put(b"v2", "artifact", script_id="ScripterHub1111111111", now=NOW)
            self.assertEqual(st.get("ScripterHub1111111111", "artifact", now=NOW), b"v2")

    def test_minted_ids_are_unique(self):
        with store_ctx() as st:
            seen = {st.put(b"x", "artifact", now=NOW).script_id for _ in range(200)}
            self.assertEqual(len(seen), 200)

    def test_artifact_and_loader_are_separate_objects(self):
        with store_ctx() as st:
            sid = "ScripterHub2222222222"
            st.put(b"THE SCRIPT", "artifact", script_id=sid, now=NOW)
            st.put(b"THE LOADER", "loader", script_id=sid, now=NOW)
            self.assertEqual(st.get(sid, "artifact", now=NOW), b"THE SCRIPT")
            self.assertEqual(st.get(sid, "loader", now=NOW), b"THE LOADER")
            self.assertEqual(st.delete(sid, "loader"), 1)
            self.assertIsNone(st.get(sid, "loader", now=NOW))
            self.assertEqual(st.get(sid, "artifact", now=NOW), b"THE SCRIPT")

    def test_two_stores_over_one_root_share_the_index(self):
        """The service runs one store per process, but a restart must find old data."""
        with tempfile.TemporaryDirectory() as tmp:
            a = make_store(tmp)
            rec = a.put(b"persisted", "artifact", now=NOW)
            a.close()
            b = make_store(tmp)
            try:
                self.assertEqual(b.get(rec.script_id, "artifact", now=NOW), b"persisted")
            finally:
                b.close()


class TestExpiryIsEnforcedOnRead(unittest.TestCase):
    def test_object_dies_the_instant_its_timer_passes(self):
        with store_ctx() as st:
            rec = st.put(b"secret", "artifact", expires_at=NOW + 100, now=NOW)
            sid = rec.script_id
            self.assertIsNotNone(st.get(sid, "artifact", now=NOW + 99))
            self.assertIsNone(st.get(sid, "artifact", now=NOW + 100), "gone AT expiry, not after")
            self.assertIsNone(st.get(sid, "artifact", now=NOW + 101))

    def test_hard_cap_kills_an_object_with_no_timer(self):
        with store_ctx() as st:
            sid = st.put(b"secret", "artifact", now=NOW).script_id
            self.assertIsNotNone(st.get(sid, "artifact", now=NOW + HARD_CAP_SECONDS - 1))
            self.assertIsNone(st.get(sid, "artifact", now=NOW + HARD_CAP_SECONDS))

    def test_hard_cap_is_independent_of_a_shorter_timer(self):
        with store_ctx() as st:
            sid = st.put(b"x", "artifact", expires_at=NOW + 10, now=NOW).script_id
            self.assertIsNone(st.get(sid, "artifact", now=NOW + HARD_CAP_SECONDS))

    def test_missing_and_expired_are_indistinguishable(self):
        """A caller must not be able to probe which ids ever existed."""
        with store_ctx() as st:
            dead = st.put(b"x", "artifact", expires_at=NOW + 10, now=NOW).script_id
            self.assertIsNone(st.get(dead, "artifact", now=NOW + 50))
            self.assertIsNone(st.get("ScripterHub9999999999", "artifact", now=NOW + 50))
            self.assertEqual(
                st.head(dead, "artifact", now=NOW + 50),
                st.head("ScripterHub9999999999", "artifact", now=NOW + 50),
            )

    def test_file_is_unlinked_not_just_hidden(self):
        with store_ctx() as st:
            rec = st.put(b"secret", "artifact", expires_at=NOW + 10, now=NOW)
            path = st._path_for(rec.script_id, "artifact")
            self.assertTrue(path.exists())
            st.get(rec.script_id, "artifact", now=NOW + 50)
            self.assertFalse(path.exists(), "expiry must remove the bytes, not mask them")

    def test_a_tampered_file_is_never_served(self):
        """The index says live but the bytes changed under it - refuse, do not serve."""
        with store_ctx() as st:
            rec = st.put(b"the real script", "artifact", now=NOW)
            st._path_for(rec.script_id, "artifact").write_bytes(b"the other script")
            self.assertIsNone(st.get(rec.script_id, "artifact", now=NOW))

    def test_countdown_fields(self):
        with store_ctx() as st:
            rec = st.put(b"x", "artifact", expires_at=NOW + 500, now=NOW)
            pub = rec.to_public(NOW + 100)
            self.assertEqual(pub["remaining_seconds"], 400)
            self.assertEqual(pub["effective_expires_at"], NOW + 500)
            self.assertTrue(pub["has_timer"])
            self.assertEqual(pub["state"], "live")
            self.assertEqual(rec.to_public(NOW + 999)["state"], "expired")
            self.assertEqual(rec.to_public(NOW + 999)["remaining_seconds"], 0)

    def test_countdown_for_an_untimed_object_shows_the_hard_cap(self):
        with store_ctx() as st:
            rec = st.put(b"x", "artifact", now=NOW)
            pub = rec.to_public(NOW)
            self.assertFalse(pub["has_timer"])
            self.assertEqual(pub["effective_expires_at"], rec.hard_cap_at)
            self.assertEqual(pub["remaining_seconds"], HARD_CAP_SECONDS)

    def test_public_metadata_leaks_no_path(self):
        with store_ctx() as st:
            rec = st.put(b"x", "artifact", now=NOW)
            blob = repr(rec.to_public(NOW)).lower()
            for leak in (str(st.config.root).lower(), "c:\\", "\\", ".bin", "sqlite", str(st.root).lower()):
                self.assertNotIn(leak, blob, f"public metadata leaked {leak!r}")


class TestDelete(unittest.TestCase):
    def test_delete_removes_file_and_row(self):
        with store_ctx() as st:
            rec = st.put(b"secret", "artifact", now=NOW)
            path = st._path_for(rec.script_id, "artifact")
            self.assertEqual(st.delete(rec.script_id, "artifact"), 1)
            self.assertFalse(path.exists())
            self.assertIsNone(st.get(rec.script_id, "artifact", now=NOW))

    def test_delete_all_kinds(self):
        with store_ctx() as st:
            sid = "ScripterHub3333333333"
            st.put(b"a", "artifact", script_id=sid, now=NOW)
            st.put(b"l", "loader", script_id=sid, now=NOW)
            self.assertEqual(st.delete(sid), 2)
            self.assertIsNone(st.get(sid, "artifact", now=NOW))
            self.assertIsNone(st.get(sid, "loader", now=NOW))

    def test_delete_unknown_id_is_a_no_op_not_an_error(self):
        with store_ctx() as st:
            self.assertEqual(st.delete("ScripterHub4444444444"), 0)
            self.assertEqual(st.delete("nonsense"), 0)
            self.assertEqual(st.delete("../../etc"), 0)

    def test_delete_is_idempotent(self):
        with store_ctx() as st:
            sid = st.put(b"x", "artifact", now=NOW).script_id
            self.assertEqual(st.delete(sid), 1)
            self.assertEqual(st.delete(sid), 0)


class TestParts(unittest.TestCase):
    """A large script is many part objects under one id.

    These exist because parts were added to a store whose delete() enumerated a FIXED list
    of kinds. Every test here is a way that could have gone wrong unnoticed.
    """

    def test_a_part_round_trips_independently_of_the_artifact(self):
        with store_ctx() as st:
            sid = "ScripterHub5555555555"
            st.put(b"ARTIFACT", "artifact", script_id=sid, now=NOW)
            st.put(b"part-zero", "part0", script_id=sid, now=NOW)
            self.assertEqual(st.get(sid, "artifact", now=NOW), b"ARTIFACT")
            self.assertEqual(st.get(sid, "part0", now=NOW), b"part-zero")

    def test_part_kinds_cover_the_whole_delivery_range(self):
        # The worker writes 'SHG <n>' into the loader header and refuses an index above
        # 255, so part0..part255 is exactly the set the delivery path can ask for.
        self.assertEqual(part_kind(0), "part0")
        self.assertEqual(part_kind(255), "part255")
        self.assertTrue(is_part_kind("part0"))
        self.assertTrue(is_part_kind("part255"))
        self.assertFalse(is_part_kind("part256"))
        self.assertFalse(is_part_kind("part-1"))
        self.assertFalse(is_part_kind("part"))
        self.assertFalse(is_part_kind("part01x"))

    def test_a_kind_that_is_also_a_path_is_refused(self):
        # The kind becomes part of a FILENAME. This is the whole reason the grammar is a
        # regex rather than an allowlist that somebody extends with a stray value.
        for bad in ("../../etc/passwd", "part0/../../x", "..", "part0.bin", "PART0", " part0"):
            with self.assertRaises(InvalidId):
                validate_kind(bad)

    def test_out_of_range_part_index_is_refused(self):
        for bad in (-1, 256, 1000):
            with self.assertRaises(InvalidId):
                part_kind(bad)

    def test_delete_removes_the_parts_too(self):
        # The regression this guards: delete() enumerated KINDS, so part files survived with
        # their rows cleared - and the sweep walks ROWS, so it could never see them again.
        with store_ctx() as st:
            sid = "ScripterHub6666666666"
            st.put(b"a", "artifact", script_id=sid, now=NOW)
            for i in (0, 1, 2):
                st.put(b"p" * 32, "part%d" % i, script_id=sid, now=NOW)
            removed = st.delete(sid)
            self.assertEqual(removed, 4)
            for i in (0, 1, 2):
                self.assertFalse(st._path_for(sid, "part%d" % i).exists())
                self.assertIsNone(st.get(sid, "part%d" % i, now=NOW))

    def test_a_part_expires_on_its_own_clock(self):
        with store_ctx() as st:
            sid = "ScripterHub7777777777"
            st.put(b"short", "part0", script_id=sid, expires_at=NOW + 10, now=NOW)
            st.put(b"long", "part1", script_id=sid, now=NOW)
            self.assertIsNone(st.get(sid, "part0", now=NOW + 11))
            self.assertEqual(st.get(sid, "part1", now=NOW + 11), b"long")

    def test_sweep_reclaims_expired_parts(self):
        with store_ctx() as st:
            sid = "ScripterHub8888888888"
            st.put(b"p", "part0", script_id=sid, expires_at=NOW + 10, now=NOW)
            report = st.sweep(now=NOW + 100)
            self.assertEqual(report["expired"], 1)
            self.assertFalse(st._path_for(sid, "part0").exists())

    def test_reuploading_a_part_replaces_it_atomically(self):
        with store_ctx() as st:
            sid = "ScripterHub9999999999"
            st.put(b"first", "part0", script_id=sid, now=NOW)
            st.put(b"second-and-longer", "part0", script_id=sid, now=NOW)
            self.assertEqual(st.get(sid, "part0", now=NOW), b"second-and-longer")
            self.assertEqual(st.head(sid, "part0", now=NOW).size, len(b"second-and-longer"))


class TestSweep(unittest.TestCase):
    def test_sweep_removes_expired_and_keeps_live(self):
        with store_ctx() as st:
            live = st.put(b"live", "artifact", now=NOW).script_id
            dead = st.put(b"dead", "artifact", expires_at=NOW + 10, now=NOW).script_id
            over = st.put(b"over", "artifact", now=NOW).script_id
            self.assertTrue(st._path_for(dead, "artifact").exists())
            report = st.sweep(now=NOW + 100)
            self.assertEqual(report["expired"], 1)
            self.assertTrue(st._path_for(live, "artifact").exists())
            self.assertFalse(st._path_for(dead, "artifact").exists())
            self.assertTrue(st._path_for(over, "artifact").exists())

    def test_sweep_enforces_the_hard_cap_without_any_timer(self):
        """The safety net: a file that outlived its own timer still goes."""
        with store_ctx() as st:
            sid = st.put(b"ancient", "artifact", now=NOW).script_id
            self.assertTrue(st._path_for(sid, "artifact").exists())
            report = st.sweep(now=NOW + HARD_CAP_SECONDS + 1)
            self.assertEqual(report["expired"], 1)
            self.assertFalse(st._path_for(sid, "artifact").exists())
            self.assertIsNone(st.get(sid, "artifact", now=NOW))

    def test_sweep_removes_orphaned_temp_files(self):
        with store_ctx() as st:
            stray = st.root / ".tmp-interrupted.part"
            stray.write_bytes(b"half a write")
            self.assertEqual(st.sweep(now=NOW)["orphan_tmp_removed"], 1)
            self.assertFalse(stray.exists())

    def test_sweep_is_idempotent(self):
        with store_ctx() as st:
            st.put(b"x", "artifact", expires_at=NOW + 10, now=NOW)
            self.assertEqual(st.sweep(now=NOW + 100)["expired"], 1)
            self.assertEqual(st.sweep(now=NOW + 100)["expired"], 0)

    def test_sweep_leaves_no_file_behind(self):
        """After a sweep, every row and every file must agree."""
        with store_ctx() as st:
            for i in range(20):
                st.put(b"x" * (i + 1), "artifact",
                       expires_at=(NOW + 10 if i % 2 else None), now=NOW)
            st.sweep(now=NOW + 100)
            self.assertEqual(st.sweep(now=NOW + 100)["expired"], 0)
            on_disk = sorted(p.name for p in st.root.glob("*.bin"))
            expected = sorted(
                f"{r.script_id}.{r.kind}.bin" for r in st.list(NOW + 100)
                if not r.is_expired(NOW + 100)
            )
            self.assertEqual(on_disk, expected, "index and filesystem disagree after a sweep")


class TestConcurrentAccess(unittest.TestCase):
    def test_concurrent_writes_and_reads(self):
        import threading

        with store_ctx() as st:
            errors: list[str] = []
            written: list[str] = []
            lock = threading.Lock()

            def writer(n: int):
                try:
                    for i in range(12):
                        rec = st.put(f"payload-{n}-{i}".encode(), "artifact", now=NOW)
                        with lock:
                            written.append(rec.script_id)
                except Exception as e:  # noqa: BLE001
                    with lock:
                        errors.append(f"writer{n}: {e!r}")

            def reader():
                try:
                    for _ in range(40):
                        for sid in list(written) or ["ScripterHub0000000000"]:
                            data = st.get(sid, "artifact", now=NOW)
                            if data is not None and not data.startswith(b"payload-"):
                                with lock:
                                    errors.append(f"torn read for {sid}: {data!r}")
                                return
                except Exception as e:  # noqa: BLE001
                    with lock:
                        errors.append(f"reader: {e!r}")

            threads = [threading.Thread(target=writer, args=(n,)) for n in range(6)]
            threads += [threading.Thread(target=reader) for _ in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(60)
            self.assertEqual(errors, [], f"concurrency errors: {errors[:4]}")
            self.assertEqual(len(set(written)), len(written), "ids collided under concurrency")
            self.assertEqual(len(written), 72)
            self.assertEqual(st.stats(now=NOW)["live"], 72)

    def test_expiry_is_sticky_once_observed(self):
        """Expiry is not a function you can query backwards out of.

        Once any reader has seen the object past its expiry, the state is flipped and
        the bytes are unlinked. A later read with an EARLIER clock still sees it gone.
        That is deliberate: liveness is not something a caller may re-argue with a
        different timestamp, and it is what makes the unlink durable.
        """
        with store_ctx() as st:
            sid = st.put(b"secret", "artifact", expires_at=NOW + 100, now=NOW).script_id
            self.assertIsNone(st.get(sid, "artifact", now=NOW + 500), "past expiry: gone")
            self.assertIsNone(st.get(sid, "artifact", now=NOW + 50),
                              "must stay dead even when asked with an earlier clock")
            self.assertFalse(st._path_for(sid, "artifact").exists())

    def test_concurrent_readers_agree_at_one_instant(self):
        """Threads hammering one object with ONE clock must never disagree."""
        import threading

        with store_ctx() as st:
            sid = st.put(b"secret", "artifact", expires_at=NOW + 100, now=NOW).script_id
            for probe_now, want in ((NOW + 50, True), (NOW + 500, False)):
                seen: list[bool] = []
                lock = threading.Lock()

                def probe() -> None:
                    got = st.get(sid, "artifact", now=probe_now) is not None
                    with lock:
                        seen.append(got)

                threads = [threading.Thread(target=probe) for _ in range(20)]
                for t in threads:
                    t.start()
                for t in threads:
                    t.join(60)
                self.assertEqual(
                    seen.count(want), 20,
                    f"at t={probe_now} expected all 20 readers to see {want}, got {seen}",
                )

    def test_concurrent_expiry_never_leaves_a_live_row_behind(self):
        """Many threads racing to be the one that observes expiry: one winner, and the
        filesystem must agree with the index afterwards."""
        import threading

        with store_ctx() as st:
            sid = st.put(b"secret", "artifact", expires_at=NOW + 10, now=NOW).script_id
            path = st._path_for(sid, "artifact")
            barrier = threading.Barrier(12)

            def race() -> None:
                barrier.wait(30)
                st.get(sid, "artifact", now=NOW + 500)

            threads = [threading.Thread(target=race) for _ in range(12)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(60)
            self.assertFalse(path.exists())
            self.assertFalse(any(not r.is_expired(NOW + 500) for r in st.list(NOW + 500)))

    def test_concurrent_deletes_do_not_raise(self):
        import threading

        with store_ctx() as st:
            sid = st.put(b"x", "artifact", now=NOW).script_id
            errs: list[str] = []

            def hammer():
                try:
                    st.delete(sid, "artifact")
                except Exception as e:  # noqa: BLE001
                    errs.append(repr(e))

            threads = [threading.Thread(target=hammer) for _ in range(24)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(60)
            self.assertEqual(errs, [])
            self.assertIsNone(st.get(sid, "artifact", now=NOW))


class TestMigrationLedger(unittest.TestCase):
    def test_migration_is_recorded_and_source_removal_is_explicit(self):
        with store_ctx() as st:
            rec = st.put(b"migrated bytes", "artifact", now=NOW)
            st.note_migration("ScripterHub1111111111", rec.script_id, rec.sha256)
            rows = st.migrations()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["source"], "ScripterHub1111111111")
            self.assertEqual(rows[0]["script_id"], rec.script_id)
            self.assertEqual(rows[0]["source_removed"], 0)
            st.mark_source_removed("ScripterHub1111111111")
            self.assertEqual(st.migrations()[0]["source_removed"], 1)


class TestGoneContract(unittest.TestCase):
    def test_the_one_message_a_dead_script_produces(self):
        self.assertEqual(GONE_MESSAGE, "Script cannot be loaded, doesnt exist or expired.")


if __name__ == "__main__":
    unittest.main(verbosity=2)