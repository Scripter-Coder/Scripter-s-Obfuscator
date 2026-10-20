-- ---------------------------------------------------------------------------
-- The reward ledger.
--
-- WHY THIS IS IN D1 AND NOT IN KV
--
-- The reward session used to be one JSON blob in KV, and the key that a
-- visitor earned used to be appended to that blob. Both are read-modify-write
-- on a single key, and KV is eventually consistent, so two requests that
-- arrive together can both read "0 keys issued" and both mint one. The
-- visitor ends up with a key the session does not know about, and the cap is
-- not a cap.
--
-- A transaction is the fix, and D1 is SQLite: a single INSERT..SELECT is
-- atomic, and the PRIMARY KEY turns a lost race into a constraint failure
-- instead of a silent overwrite.
--
-- WHAT IS IN HERE
--
--   reward_keys   one row per issued key, per session. The ordinal is the
--                 key's position in the session, and it is the PRIMARY KEY
--                 together with (rid, sid), so two claims cannot pick the
--                 same one.
--
-- The session itself stays in KV: it is a blob that is read and written
-- often, and it is guarded by a per-session lock. The ONE thing that has to
-- be exactly-once - the key - lives here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reward_keys (
    rid       TEXT    NOT NULL,
    sid       TEXT    NOT NULL,
    ordinal   INTEGER NOT NULL,
    key_text  TEXT    NOT NULL,
    at        INTEGER NOT NULL,
    expires   INTEGER NOT NULL,
    PRIMARY KEY (rid, sid, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_reward_keys_rid ON reward_keys (rid);
