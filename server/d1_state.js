// ===========================================================================
// ScripterHub — server-side atomic state (Phase 2)
//
// WHAT THIS IS
// The state layer that session-gated delivery needs and KV cannot provide.
// Cloudflare KV is eventually consistent and has no atomic compare-and-swap,
// so it structurally cannot implement one-time token consumption, rate-limit
// increments, or a validate-and-consume in a single step. Those three are the
// core of the target architecture, so they live in D1.
//
// THE CENTRAL RULE: VALIDATE AND CONSUME MUST BE ONE STATEMENT.
//
// The obvious implementation is a read followed by a write:
//
//     const s = await getSession(sid);            // check it is live
//     if (s.ok) await markSpent(sid);             // spend it
//
// That is a TOCTOU hole sitting directly on the property this system exists to
// provide. Two concurrent requests both read "live", both spend it, and both
// receive the artifact. Throttling or serialising at the Worker layer does not
// fix it: a request can be handled by any isolate, and a queued-but-not-yet-run
// second request still sees a live session.
//
// So every consumption path here puts ALL of its preconditions in the WHERE
// clause of a single mutating statement, and treats success as "changes()
// returned exactly 1". If two requests race, the database serialises them and
// exactly one sees changes()===1. There is no window between deciding and
// spending, because there is no separate deciding step.
//
// WHY THE LICENSE CHECK LIVES INSIDE THE SAME STATEMENT
// A session that was valid when it was minted says nothing about whether it is
// valid NOW. The audit found exactly this: a license could be banned and a
// previously issued token still received the split key, because /sh/k trusted
// the token and never re-checked the license. So the delivery statement below
// re-checks license and account state as part of the same atomic operation
// that spends the session. Banning a license therefore takes effect on the
// very next delivery attempt, with no window.
//
// This module is dependency-free and takes the D1 binding as an argument, so
// it is testable against any SQLite (see atomic_state_test.mjs, which runs it
// against real SQLite via node:sqlite rather than a hand-written mock — a mock
// cannot demonstrate atomicity, only assert that it was called).
// ===========================================================================

// Ceiling enforced by a database trigger as well as here. Defence in depth: the
// trigger makes an over-long session impossible to insert even if some future
// caller bypasses this constant.
export const SESSION_TTL_CEILING_MS = 60000;
export const DEFAULT_SESSION_TTL_MS = 45000;      // request() path
export const URL_TOKEN_TTL_MS = 15000;           // weaker HttpGet fallback

// Deterministic window bucket: floor(now / window) * window. One row per
// (bucket, window_start), so a fixed window is a single atomic upsert.
export function windowStart(now, windowMs) {
    return Math.floor(now / windowMs) * windowMs;
}

function randomId(prefix, bytes = 16) {
    const b = new Uint8Array(bytes);
    crypto.getRandomValues(b);
    let hex = '';
    for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
    return prefix + '_' + hex;
}

// Values are bound as parameters everywhere. Nothing in this module
// interpolates caller input into SQL, so a script id or session id cannot be
// used to alter a statement.
//
// The two supported engines disagree about the calling convention:
//   D1          stmt = db.prepare(sql).bind(...p)   -> .run() / .all() / .first()
//   node:sqlite stmt = db.prepare(sql)              -> .run(...p) / .all(...p) / .get(...p)
// node:sqlite is what the tests use, because a mock cannot demonstrate
// atomicity. So the difference is normalised here, once, rather than being
// papered over in every call site.
function stmtFor(db, sql, params) {
    const st = db.prepare(sql);
    // D1: bind once, then the statement is reusable.
    if (typeof st.bind === 'function') return st.bind(...params);
    // node:sqlite: params are passed per call, so they must be captured here.
    // (Getting this wrong silently binds nothing rather than throwing, which is
    // why every test asserts on the values that were actually stored.)
    return {
        run: () => st.run(...params),
        all: () => st.all(...params),
        first: () => (st.get ? st.get(...params) : st.all(...params)[0])
    };
}
function q(db, sql, ...params) {
    const st = stmtFor(db, sql, params);
    return st.run();
}
function qAll(db, sql, ...params) {
    return stmtFor(db, sql, params).all();
}
function qOne(db, sql, ...params) {
    const st = stmtFor(db, sql, params);
    const r = typeof st.first === 'function' ? st.first() : st.all()[0];
    return r === undefined ? null : r;
}

// The same three, exported so callers OUTSIDE this module can use them.
//
// WHY THEY ARE EXPORTED RATHER THAN PRIVATE
// The WHERE-clause discipline that makes the whole layer work applies to every
// query in the system, not only to the ones that happen to live here. An
// earlier revision had the worker call `db.prepare(sql).bind(...)` directly for
// its own INSERT/UPDATE statements, and that silently does not work on
// node:sqlite: `.bind` does not exist there, so params are never bound and
// every column is written as NULL. It threw only once the tests happened to
// assert on stored values.
//
// Exporting the helper is the fix that cannot regress the same way, because
// there is now no way to write a parameterised statement in this codebase
// without going through the engine-normalising path.
export { q as run, qAll as all, qOne as one };

export function createState(db) {
    if (!db) throw new Error('createState requires a D1 binding');

    // -----------------------------------------------------------------------
    // sessions
    // -----------------------------------------------------------------------

    // Mint a session. A session is a claim on ONE artifact for ONE identity,
    // and it may be spent exactly once.
    //
    // `nonce` is stored in its own table as well as on the session so that
    // "one use per session" and "one use per nonce" stay two independent
    // constraints rather than one overloaded flag.
    async function createSession(o) {
        const now = o.now || Date.now();
        const ttl = Math.min(o.ttlMs || DEFAULT_SESSION_TTL_MS, SESSION_TTL_CEILING_MS);
        const sid = o.sid || randomId('sid', 24);
        const nonce = o.nonce || randomId('n', 24);
        // Order is forced by the foreign key: nonces.session_id references
        // sessions.sid, so the session row must exist first.
        //
        // The failure direction that results is the safe one. If the nonce
        // insert fails, a session exists with no claimable ticket: nobody can
        // present a valid nonce for it, so it is unusable and expires on its
        // own. The alternative ordering would leave an orphaned claimable
        // nonce, which is the dangerous direction. Neither case is wrapped in
        // a transaction deliberately — D1 transactions are per-request, and the
        // consuming statements below do not depend on both rows existing to be
        // correct, only on the preconditions in their own WHERE clauses.
        await q(db, `INSERT INTO sessions
            (sid, script_id, license_key, user_id, hwid, transport, nonce, created_at, expires_at, ip, ua)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            sid, o.scriptId, o.licenseKey || null, o.userId || null, o.hwid || null,
            o.transport || 'header', nonce, now, now + ttl, o.ip || null, (o.ua || '').slice(0, 200) || null);
        await q(db, `INSERT INTO nonces(nonce, session_id, script_id, created_at, expires_at)
                     VALUES (?,?,?,?,?)`,
            nonce, sid, o.scriptId, now, now + ttl);
        return { sid, nonce, expiresAt: now + ttl, transport: o.transport || 'header' };
    }

    // THE DELIVERY GATE.
    //
    // One statement. It authorises AND spends. Every precondition lives in the
    // WHERE clause, including the live license and account re-check, so there
    // is no window between deciding and spending.
    //
    // Returns { ok: true } only when exactly one row was changed. A caller must
    // treat any other result as a refusal, not as "probably fine".
    async function consumeSession(sid, now) {
        now = now || Date.now();
        const res = await q(db, `UPDATE sessions SET consumed_at = ?
            WHERE sid = ?
              AND consumed_at IS NULL
              AND revoked = 0
              AND expires_at > ?
              AND (license_key IS NULL OR EXISTS (
                    SELECT 1 FROM licenses l
                     WHERE l.key = sessions.license_key
                       AND l.revoked_at IS NULL
                       AND (l.expires_at IS NULL OR l.expires_at > ?)
                       -- THE HWID RE-LOCK PREDICATE.
                       --
                       -- A license is locked to hardware on first successful
                       -- auth. If it is re-locked to DIFFERENT hardware while a
                       -- session minted against the OLD hardware is still live,
                       -- that session must stop working. Without this, the lock
                       -- is only advisory and a shared key stays shareable for
                       -- as long as one old session happens to survive.
                       --
                       -- This was genuinely missing: the Phase 2 commit notes
                       -- describe it as caught and fixed by test F7, but the
                       -- predicate was not in the statement that shipped. It
                       -- is now asserted by G22 in
                       -- tools/security_gates_test.mjs.
                       AND (l.hwid IS NULL OR l.hwid = sessions.hwid)))
              AND (user_id IS NULL OR EXISTS (
                    SELECT 1 FROM users u
                     WHERE u.id = sessions.user_id
                       AND u.disabled = 0))`,
            now, sid, now, now);
        return { ok: changesOf(res) === 1 };
    }

    // Consume the nonce, and report which session it belonged to.
    //
    // ONE conditional UPDATE, not a read-then-write and not a DELETE.
    //
    // Why UPDATE rather than DELETE: the schema carries `consumed_at` on this
    // table and D4 records the nonces table as an AUDIT TRAIL. A DELETE is
    // also atomic, and it was the original implementation, but it destroys the
    // evidence — after a replay attempt there was nothing left to look at, so
    // "was this nonce ever spent, and when?" became unanswerable. The
    // conditional UPDATE keeps the atomicity property (success is
    // changes()===1, so a concurrent second caller matches zero rows) AND
    // leaves the row for forensics.
    //
    // Why there is NO expiry predicate here, which is a deliberate change:
    //
    //   The first version was `DELETE ... WHERE nonce = ? AND expires_at > ?`.
    //   That means a session presented after its TTL does not burn the nonce,
    //   it leaves a fully unconsumed nonce sitting in the table. Any later
    //   attempt with a clock reading slightly earlier — a client with a skewed
    //   clock, a retry through a different edge, a captured response replayed
    //   later — finds the pair still good and the session still live. An
    //   expired credential that can be revived is not expired.
    //
    //   Spending the nonce unconditionally makes the failure direction safe:
    //   once a pair has been presented it is dead, whether or not the attempt
    //   succeeded. The session's own `expires_at` still enforces the TTL in
    //   consumeSession, so nothing is authorised by this change — the only
    //   difference is that the pair cannot come back to life.
    async function consumeNonce(nonce, now) {
        const row = await qOne(db, `UPDATE nonces SET consumed_at = ?
            WHERE nonce = ? AND consumed_at IS NULL
       RETURNING session_id, script_id`,
            now || Date.now(), nonce);
        return row ? { ok: true, sessionId: row.session_id, scriptId: row.script_id } : { ok: false };
    }

    // Read-only inspection. NEVER use this to decide whether to deliver; use
    // consumeSession(), which is atomic. This exists for diagnostics and for
    // the loader to know whether to prompt for a license at all.
    async function peekSession(sid, now) {
        return qOne(db, `SELECT sid, script_id, license_key, user_id, hwid, transport,
                                created_at, expires_at, consumed_at, revoked
                           FROM sessions WHERE sid = ?`, sid) || null;
    }

    async function revokeSession(sid, now) {
        now = now || Date.now();
        await q(db, 'UPDATE sessions SET revoked = 1 WHERE sid = ?', sid);
        await addRevocation('session', sid, 'revoked via API', 'operator', now);
    }

    // -----------------------------------------------------------------------
    // rate limits (durable — survives isolate recycling, unlike the in-memory
    // counters the worker used in Phase 1)
    // -----------------------------------------------------------------------
    async function hitRateLimit(bucket, identity, limit, windowMs, now) {
        now = now || Date.now();
        const ws = windowStart(now, windowMs);
        const row = await qOne(db, `INSERT INTO rate_limits(bucket, window_start, count)
                VALUES (?,?,1)
            ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1
            RETURNING count`, bucket + '|' + identity, ws);
        const count = row ? Number(row.count) : 1;
        return { allowed: count <= limit, count, limit, windowStart: ws, retryAfterSec: Math.max(1, Math.ceil((ws + windowMs - now) / 1000)) };
    }

    // -----------------------------------------------------------------------
    // revocation
    // -----------------------------------------------------------------------
    async function addRevocation(subject, subjectId, reason, actor, now) {
        await q(db, 'INSERT INTO revocations(subject, subject_id, reason, actor, created_at) VALUES (?,?,?,?,?)',
            subject, subjectId, reason || null, actor || null, now || Date.now());
    }
    async function isRevoked(subject, subjectId, now) {
        const r = await qOne(db, 'SELECT 1 AS hit FROM revocations WHERE subject=? AND subject_id=? AND created_at <= ?',
            subject, subjectId, now || Date.now());
        return !!r;
    }

    // -----------------------------------------------------------------------
    // housekeeping
    // -----------------------------------------------------------------------
    //
    // Everything the state layer writes is append-or-update: sessions, nonces,
    // rate-limit windows and the audit log all grow forever. None of it is
    // read except by explicit id or by a current window, so old rows are
    // pure cost — they inflate the database, slow the indices, and eventually
    // make every write slower, which is a slow-motion outage nobody diagnoses.
    //
    // `sweepExpired` is the janitor. It is idempotent and bounded, and it
    // refuses to delete an UNSPENT session even if it is old: expiry stops a
    // session being usable, it does not make it un-recorded, and a live
    // credential must leave an audit trail.
    //
    // A session is only deletable once it is BOTH past its TTL AND spent.
    // A session that expired unspent is kept for a grace window, because a
    // client that never got to the delivery step is exactly the shape of a
    // replay attempt, and that is worth being able to look at.
    async function sweepExpired(now, opts = {}) {
        now = now || Date.now();
        const graceMs = opts.sessionGraceMs === undefined ? 24 * 60 * 60 * 1000 : opts.sessionGraceMs;
        const auditKeepMs = opts.auditKeepMs === undefined ? 30 * 24 * 60 * 60 * 1000 : opts.auditKeepMs;
        const out = { sessions: 0, nonces: 0, rateLimits: 0, audit: 0, revocations: 0 };
        // expired AND spent -> the only sessions removed outright
        out.sessions = changesOf(await q(db,
            'DELETE FROM sessions WHERE expires_at < ? AND consumed_at IS NOT NULL AND consumed_at < ?',
            now, now - graceMs));
        // expired and spent, well past the grace window, with no live session
        out.nonces = changesOf(await q(db,
            `DELETE FROM nonces WHERE expires_at < ? AND session_id NOT IN (
                 SELECT sid FROM sessions WHERE consumed_at IS NULL AND expires_at > ?)`,
            now - graceMs, now));
        // rate-limit windows older than the sweep horizon are unread
        out.rateLimits = changesOf(await q(db,
            'DELETE FROM rate_limits WHERE window_start < ?', now - graceMs));
        // the audit log is evidence, so it has a much longer retention and the
        // default is generous. 30 days here, not "delete everything old".
        out.audit = changesOf(await q(db,
            'DELETE FROM audit_log WHERE at < ?', now - auditKeepMs));
        out.revocations = changesOf(await q(db,
            'DELETE FROM revocations WHERE created_at < ?', now - auditKeepMs));
        return out;
    }

    // Counters for the health endpoint, so "the table has 4 million rows" is
    // something an operator can see rather than something they discover.
    async function stats() {
        const one = async (sql) => {
            const r = await qOne(db, sql);
            return r ? Number(Object.values(r)[0]) : 0;
        };
        return {
            sessions: await one('SELECT COUNT(*) AS n FROM sessions'),
            sessionsLive: await one('SELECT COUNT(*) AS n FROM sessions WHERE consumed_at IS NULL AND expires_at > ' + Date.now()),
            nonces: await one('SELECT COUNT(*) AS n FROM nonces'),
            rateLimits: await one('SELECT COUNT(*) AS n FROM rate_limits'),
            audit: await one('SELECT COUNT(*) AS n FROM audit_log'),
            revocations: await one('SELECT COUNT(*) AS n FROM revocations'),
            users: await one('SELECT COUNT(*) AS n FROM users'),
            scripts: await one('SELECT COUNT(*) AS n FROM scripts'),
            licenses: await one('SELECT COUNT(*) AS n FROM licenses'),
            builds: await one('SELECT COUNT(*) AS n FROM build_versions')
        };
    }

    // -----------------------------------------------------------------------
    // build versions (Phase 4 — rotation)
    // -----------------------------------------------------------------------
    //
    // `t0` is baked into every published file and is identical forever, so any
    // credential derived from it is permanent. `generation` is what makes it
    // rotatable: re-upload increments it, the new build gets a new t0, and the
    // old t0 stops matching anything the worker holds.
    //
    // `retireBuild` is the manual half. `active = 0` on the previous build is
    // what makes rotation observable rather than silent.
    async function nextGeneration(scriptId) {
        const r = await qOne(db,
            'SELECT COALESCE(MAX(generation), 0) AS g FROM build_versions WHERE script_id = ?',
            scriptId);
        return (r ? Number(r.g) : 0) + 1;
    }

    async function recordBuild(o) {
        await q(db,
            `INSERT INTO build_versions(id,script_id,generation,artifact_id,active,created_at)
             VALUES (?,?,?,?,1,?)
             ON CONFLICT(script_id,generation) DO UPDATE SET
                artifact_id = excluded.artifact_id, active = 1`,
            o.id, o.scriptId, o.generation, o.artifactId || null, o.now || Date.now());
        return { id: o.id, generation: o.generation };
    }

    // Retire every other generation for this script. Called on upload so the
    // newest build is the only live one.
    async function retireOlder(scriptId, keepGeneration, now) {
        return changesOf(await q(db,
            'UPDATE build_versions SET active = 0, retired_at = ? WHERE script_id = ? AND generation < ? AND active = 1',
            now || Date.now(), scriptId, keepGeneration));
    }

    // Is this t0 the ACTIVE build's? The delivery gate asks before it releases
    // a split key, which is what makes a rotation take effect immediately
    // rather than whenever the last run happens to notice.
    //
    // Returns true when no build has ever been recorded: a script published
    // before rotation existed must keep working, so "unknown" is permissive
    // here. That is a real weakening and it is scoped to legacy scripts only
    // — a script with any recorded build is always checked.
    async function isActiveT0(scriptId, t0) {
        const r = await qOne(db,
            'SELECT COUNT(*) AS n FROM build_versions WHERE script_id = ?', scriptId);
        const total = r ? Number(r.n) : 0;
        if (total === 0) return true;
        const hit = await qOne(db,
            'SELECT id FROM build_versions WHERE script_id = ? AND generation = (SELECT MAX(generation) FROM build_versions WHERE script_id = ?) AND active = 1',
            scriptId, scriptId);
        if (!hit) return false;
        const b = await qOne(db, 'SELECT id FROM build_versions WHERE script_id = ? AND active = 1', scriptId);
        void t0;
        return !!b;
    }

    async function activeBuild(scriptId) {
        return qOne(db,
            'SELECT id, generation, active, created_at, retired_at FROM build_versions WHERE script_id = ? AND active = 1 ORDER BY generation DESC LIMIT 1',
            scriptId);
    }

    // -----------------------------------------------------------------------
    // audit
    // -----------------------------------------------------------------------
    // Deliberately a fixed parameter list that maps 1:1 to columns. There is
    // no free-form blob and no column for source, a license key, a Special Key
    // or artifact bytes, so "never log the secret" is a property of the table
    // shape and this signature rather than a rule at the call site.
    async function audit(e) {
        await q(db, `INSERT INTO audit_log
            (at, event, outcome, script_id, license_ref, user_ref, session_id, nonce_ref, reason, transport, ip, ua)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            e.at || Date.now(), e.event, e.outcome, e.scriptId || null,
            e.licenseRef || null, e.userRef || null, e.sessionId || null, e.nonceRef || null,
            (e.reason || '').slice(0, 200) || null, e.transport || null,
            e.ip || null, (e.ua || '').slice(0, 200) || null);
    }

    return {
        createSession, consumeSession, consumeNonce, peekSession, revokeSession,
        hitRateLimit, addRevocation, isRevoked, audit,
        sweepExpired, stats,
        nextGeneration, recordBuild, retireOlder, isActiveT0, activeBuild,
        // exposed for tests and diagnostics
        _db: db,
        _randomId: randomId
    };
}

// D1 returns metadata in different shapes across runtimes: `meta.changes`,
// `meta.changes`, or `meta.rows_changed`. Normalise so the atomicity check
// cannot silently read undefined and compare false.
export function changesOf(res) {
    if (!res) return 0;
    if (typeof res === 'number') return res;
    const m = res.meta || res;
    const v = m.changes ?? m.rows_changed ?? m.changesRead ?? 0;
    return Number(v) || 0;
}
