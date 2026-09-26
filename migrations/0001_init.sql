-- ============================================================================
-- ScripterHub — D1 schema (Phase 2)
-- ============================================================================
-- WHY THIS EXISTS AT ALL
--
-- Cloudflare KV is eventually consistent and has no atomic compare-and-swap.
-- That makes it structurally unable to implement the three operations that
-- session-gated delivery depends on:
--
--   1. one-time nonce consumption
--   2. rate-limit increment
--   3. validate-and-consume as a SINGLE step
--
-- A naive KV implementation of (3) reads "is this nonce spent?", decides it is
-- not, then writes "spent". Two concurrent requests both read "not spent" and
-- both receive the artifact. That is a TOCTOU hole sitting directly on the
-- property this whole system exists to provide, so it is not acceptable at any
-- level of "good enough".
--
-- KV therefore stays what it is genuinely good at — large immutable values
-- addressed by key, i.e. the artifact store. Everything with a lifecycle or a
-- uniqueness requirement lives here.
--
-- Apply with:  wrangler d1 execute scripterhub --file=migrations/0001_init.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Replaces the `sh_users` KV map. The old map stored passwords as
-- btoa(password) — i.e. base64, which is encoding and NOT hashing. Anything
-- that could read the KV namespace could recover every user password. Phase 1
-- moves to PBKDF2; this table carries the fields that migration needs.
--
-- `password_hash` format (Phase 1):
--     pbkdf2$<iterations>$<base64 salt>$<base64 derived key>
-- A value that does NOT start with "pbkdf2$" is treated as LEGACY and is
-- rehashed on the next successful login (opportunistic migration).
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,          -- stable user id
    email         TEXT NOT NULL UNIQUE,      -- canonical login identity
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,             -- pbkdf2$... (never plaintext)
    role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'owner'
    disabled      INTEGER NOT NULL DEFAULT 0,     -- 1 = revoked
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    last_login_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Ownership back-pointer. A user must not be deleted while they still own
-- scripts; this index makes that check cheap and the FK makes it enforced.
CREATE TABLE IF NOT EXISTS scripts (
    id             TEXT PRIMARY KEY,          -- the public loader id
    owner_id       TEXT NOT NULL,             -- users.id  (enforces item 19)
    name           TEXT NOT NULL,
    -- 'anyone' | 'account' | 'private'
    -- Enforced SERVER-SIDE (item 18). Before Phase 2 this existed only as a
    -- localStorage field in the browser, so "private" meant "hidden in the UI"
    -- while /sh/<id> still served anyone who asked.
    visibility     TEXT NOT NULL DEFAULT 'anyone',
    auth_required  INTEGER NOT NULL DEFAULT 0,     -- license required to fetch
    killed         INTEGER NOT NULL DEFAULT 0,     -- kill switch for this script
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    retired_at     INTEGER,                        -- rotation / kill
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_scripts_owner ON scripts(owner_id);


-- ---------------------------------------------------------------------------
-- licenses
-- ---------------------------------------------------------------------------
-- Replaces the `sh_licenses` KV map. `revoked_at` is separate from the flag so
-- revocation has a timestamp for the audit log and for "when did this stop
-- working" questions.
CREATE TABLE IF NOT EXISTS licenses (
    key         TEXT PRIMARY KEY,
    script_id   TEXT NOT NULL,
    owner_id    TEXT NOT NULL,
    hwid        TEXT,                        -- NULL until first successful auth
    expires_at  INTEGER,                     -- NULL = never
    revoked_at  INTEGER,                     -- set on ban/reset
    revoke_reason TEXT,
    executions  INTEGER NOT NULL DEFAULT 0,
    last_auth_at INTEGER,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id)  REFERENCES users(id)   ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_licenses_script ON licenses(script_id);
CREATE INDEX IF NOT EXISTS idx_licenses_owner  ON licenses(owner_id);


-- ---------------------------------------------------------------------------
-- sessions  (Phase 3 — the core of the target architecture)
-- ---------------------------------------------------------------------------
-- ONE ROW = ONE AUTHORIZED DELIVERY.
--
-- A session is created only after the server has authenticated the caller
-- (license + HWID + killswitch + visibility). It is short-lived, bound to a
-- single script and a single identity, and it may be spent EXACTLY ONCE.
--
-- The single-use guarantee comes from `consumed_at` plus this statement, which
-- is atomic because every precondition lives in the WHERE clause:
--
--   UPDATE sessions SET consumed_at = ?
--    WHERE sid = ? AND consumed_at IS NULL
--      AND expires_at > ? AND revoked = 0
--
-- The caller treats success as "changes() returned exactly 1". A second
-- concurrent request matches zero rows because consumed_at is no longer NULL.
-- There is no read-then-write window, so there is no TOCTOU hole.
CREATE TABLE IF NOT EXISTS sessions (
    sid          TEXT PRIMARY KEY,          -- random >=128-bit, opaque
    script_id    TEXT NOT NULL,
    -- What the session is bound to. license_key is NULL for account-only
    -- sessions; hwid is NULL when the executor cannot supply one.
    license_key  TEXT,
    user_id      TEXT,
    hwid         TEXT,
    -- Which transport minted it. The URL fallback is strictly weaker, so it
    -- gets a shorter life and is counted separately in the audit log.
    transport    TEXT NOT NULL DEFAULT 'header',   -- 'header' | 'url'
    -- The one-time value the client must present to claim the artifact.
    -- Stored here so consumption can be a single DELETE ... RETURNING.
    nonce        TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,          -- 30-60s, CHECK-enforced below
    consumed_at  INTEGER,                   -- set exactly once
    revoked      INTEGER NOT NULL DEFAULT 0,
    ip           TEXT,
    ua           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_script ON sessions(script_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry  ON sessions(expires_at);

-- A session that outlives its stated TTL is a bug, not a tuning choice.
-- This makes an accidental "expires_at = now + 86400" impossible to merge.
-- The 60s ceiling is the outer bound; the header path targets 30-45s and the
-- URL path 10-15s.
CREATE TRIGGER IF NOT EXISTS trg_sessions_ttl
BEFORE INSERT ON sessions
WHEN NEW.expires_at > NEW.created_at + 60000
BEGIN
    SELECT RAISE(ABORT, 'session TTL exceeds 60s ceiling');
END;


-- ---------------------------------------------------------------------------
-- nonces
-- ---------------------------------------------------------------------------
-- A nonce is a single-use claim ticket. It is deliberately separate from
-- `sessions` so that "one artifact per session" and "one use per nonce" are
-- two independent constraints rather than one overloaded flag.
--
-- Consumption is a single atomic statement; only one concurrent caller can
-- ever receive the returned row:
--
--   DELETE FROM nonces WHERE nonce = ? AND expires_at > ? RETURNING session_id
CREATE TABLE IF NOT EXISTS nonces (
    nonce       TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    script_id   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    consumed_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(sid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_nonces_session ON nonces(session_id);


-- ---------------------------------------------------------------------------
-- revocations
-- ---------------------------------------------------------------------------
-- Explicit, auditable kill list. Separate from licenses.banned and
-- users.disabled so that a revocation has an actor, a reason and a timestamp
-- even when it targets something that is not a license (a session, a build,
-- an account).
CREATE TABLE IF NOT EXISTS revocations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    subject    TEXT NOT NULL,      -- 'license' | 'session' | 'user' | 'build'
    subject_id TEXT NOT NULL,
    reason     TEXT,
    actor      TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revocations_subject ON revocations(subject, subject_id);


-- ---------------------------------------------------------------------------
-- rate_limits
-- ---------------------------------------------------------------------------
-- Durable, and the reason it is not an in-memory Map on globalThis: the old
-- signup limiter lived on globalThis.__shStats, which dies with the isolate.
-- Cloudflare recycles isolates continuously, so that limiter was reset by
-- garbage collection rather than by the clock.
--
-- Keyed on (bucket, window_start) so a fixed window is ONE row and the
-- increment is a single atomic upsert:
--
--   INSERT INTO rate_limits(bucket, window_start, count) VALUES (?,?,1)
--   ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1
--   RETURNING count
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       TEXT NOT NULL,
    window_start INTEGER NOT NULL,     -- floor(now / window_ms) * window_ms
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);


-- ---------------------------------------------------------------------------
-- build_versions  (Phase 4 — key rotation)
-- ---------------------------------------------------------------------------
-- One row per obfuscation build. `generation` increments on every re-upload,
-- which is what finally makes the current static `t0` rotatable: today `t0` is
-- baked into the file once and is identical forever, so any token derived from
-- it is permanent. A build id that changes per upload means a captured
-- session or token dies with its build.
--
-- `artifact_id` names the KV key holding the bytes, so the D1 row never has
-- to carry the artifact itself.
CREATE TABLE IF NOT EXISTS build_versions (
    id             TEXT PRIMARY KEY,      -- opaque build id baked into the file
    script_id      TEXT NOT NULL,
    generation     INTEGER NOT NULL,      -- 1, 2, 3... per script
    artifact_id    TEXT NOT NULL,         -- KV key for the artifact bytes
    keystore_id    TEXT,                  -- KV key for the at-rest KEK envelope
    wrap_key_id    TEXT,                  -- KV key for the per-build wrap key
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL,
    retired_at     INTEGER,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_builds_script ON build_versions(script_id, generation);
CREATE UNIQUE INDEX IF NOT EXISTS idx_builds_generation ON build_versions(script_id, generation);


-- ---------------------------------------------------------------------------
-- audit_log  (Phase 5 — durable, replaces globalThis.__shStats)
-- ---------------------------------------------------------------------------
-- Append-only. Every row is metadata. The schema has NO column that can hold
-- source code, a license key, a Special Key, or artifact bytes — that is
-- deliberate, so "never log the secret" is enforced by the shape of the table
-- rather than by discipline at the call site.
--
-- The old `notifyDiscord` appended the plaintext source and every valid
-- license key to a Discord webhook. Nothing here has a field for any of it.
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          INTEGER NOT NULL,
    event       TEXT NOT NULL,     -- 'auth.ok' 'auth.fail' 'delivery.ok' ...
    outcome     TEXT NOT NULL,     -- 'ok' | 'denied' | 'error'
    script_id   TEXT,
    -- Hashed references, not the secrets themselves. A license key is stored
    -- as sha256(key) so the log can correlate events without being a
    -- credential store in its own right.
    license_ref TEXT,
    user_ref    TEXT,
    session_id  TEXT,
    nonce_ref   TEXT,
    reason      TEXT,
    transport   TEXT,              -- 'header' | 'url'
    ip          TEXT,
    ua          TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at      ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_script  ON audit_log(script_id, at);
CREATE INDEX IF NOT EXISTS idx_audit_outcome ON audit_log(outcome, at);
