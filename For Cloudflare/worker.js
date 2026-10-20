// ============================================================
// ScripterHub Worker (Cloudflare) — stats + hidden loader host
//                   + server-side license auth
//                   + SESSION-GATED DELIVERY (Phase 3)
// ============================================================
//
// READ THIS BEFORE THE ROUTES. The three comments below are a map; the
// authoritative description of the delivery model is in
// `For Cloudflare/README.md`, and the reasoning behind each choice is in
// `docs/DECISIONS.md`.
//
// ---------------------------------------------------------------------------
// PART 3 (the architecture that replaced Parts 1 and 2's delivery halves)
// ---------------------------------------------------------------------------
//
//   GET  /sh/ScripterHubNNN    the PUBLIC LOADER. Contains NO script
//                              material: no ciphertext, no key, no split key,
//                              nothing derived from the artifact. Executors
//                              get a fixed protocol bootstrap; browsers get a
//                              metadata page. Identical for every script
//                              except the id and base URL, so inspecting it
//                              teaches an attacker nothing.
//
//   POST /sh/session           authenticate (license + HWID + killswitch +
//                              server-side visibility) and mint a D1 session
//                              + nonce. Returns "SHS <sid> <nonce> <exp>".
//                              PROOF, NOT PAYLOAD: a caller who can mint has
//                              proved a license and gets nothing else.
//
//   GET  /sh/a/<id>?s=&n=      THE GATE. The only route permitted to return
//                              artifact bytes. Two atomic statements stand
//                              between the request and the payload:
//                                1. spend the nonce  (conditional UPDATE)
//                                2. spend the session (conditional UPDATE
//                                   whose WHERE clause re-checks the license,
//                                   the HWID lock and the account LIVE)
//                              A license banned 30 seconds after the mint is
//                              therefore caught on the very next attempt, with
//                              no window. Small artifacts come back inline in
//                              one response; large ones open a forward-only
//                              chain (see DELIVERY RULES below, D11).
//
//   GET  /sh/v4_init_<id>.lua THE SAME GATE under a file-shaped name. The init
//                              layer (L2) fetches the artifact (L3) from
//                              here, the way a Luarmor init file fetches
//                              https://cdn.luarmor.net/v4_init_<key>.lua.
//                              Same gate, same nonce, same bytes - a shape,
//                              not a hole.
//
//   GET  /sh/c/<id>/<i>        KV chunk.   Chain-gated: a grant from the
//   GET  /sh/g/<id>/<i>        GitHub part. gate AND a forward-only cursor.
//                              Neither is reachable with a forged User-Agent,
//                              which is what they used to be.
//
//   GET  /sh/k/<id>            LEGACY split-key route, kept so loadstrings
//                              already in the wild keep working. It now
//                              requires a live, unspent session in addition to
//                              the baked t0, and spends it. It is NOT how new
//                              loaders authenticate.
//
//   GET  /sh/health            reports `stateLayer` and `delivery`.
//
//   THE GATE FAILS CLOSED. With no D1 binding (or an unapplied migration) every
//   delivery route refuses. There is deliberately no KV fallback: it would
//   restore replay, expiry, ban-at-delivery and single-use with no error
//   anywhere, while the operator believed the system was gated. See D9.
//
// ---------------------------------------------------------------------------
// PART 1 (stats)
// ---------------------------------------------------------------------------
//   POST /track             <- clients ping on every execution
//   POST /threat            <- checkpoint bypass attempts
//   POST /visitor           <- reward page visitors
//   GET  /v3/realtime_stats <- dashboard polls every 5 seconds
//
// ---------------------------------------------------------------------------
// PART 2 (the hidden loader host)
// ---------------------------------------------------------------------------
//   POST /sh/login          <- raw.html owner login (access-code check)
//   POST /sh/upload         <- the hidden raw.html page uploads the script
//                              ENCRYPTED under the owner's Special Key
//                              (encryption happens in the OWNER's browser
//                              BEFORE upload - the worker NEVER sees the key
//                              or the plaintext). Stored in KV.
//   GET  /sh/ScripterHubNNN <- the loader (see Part 3)
//
// ---------------------------------------------------------------------------
// PART 2b (cross-device USER SYNC)
// ---------------------------------------------------------------------------
//   POST /sh/user-signup    public: create a user record (plan forced to
//                              Basic, admin flags stripped)
//   POST /sh/user-login     public: verify email/username, returns a SIGNED
//                              session token (PBKDF2 passwords, not btoa)
//   POST /sh/user-get       public: fetch YOUR OWN record (password-proved)
//   POST /sh/user-sync      public: password-proved upsert of your profile.
//                              plan/admin flags are PROTECTED here
//   POST /sh/user-delete    public: password-verified self-delete
//   GET  /sh/users          owner: full users map
//   POST /sh/users          owner: upsert one user (THE plan-change path)
//   POST /sh/users-delete   owner: delete one user
//   POST /sh/users-clear    owner: delete all except creator/admin
//   POST /sh/visibility     owner: set a script's SERVER-SIDE visibility.
//                              It used to be a localStorage field only, so
//                              "Private" and "Anyone" were byte-identical
//                              loaders. See D14.
//
// KEYLESS (FREE) SCRIPTS: /sh/upload accepts { keyless: true, plainCode,
// KEYLESS (FREE) SCRIPTS: /sh/upload accepts { keyless: true, plainCode,
// cipher, keyHash }. A free script needs NO account, NO email and NO token
// (D23 reversed D1): a user runs it by pasting one loadstring line and
// setting nothing. It is still never published - the obfuscated bytes only
// leave the worker through a minted, single-use session, so pulling one costs
// a live round trip per execution rather than a URL. Bulk harvesting is what
// the rate limits stop; a single deliberate fetch is accepted, and is tracked
// as benchmark row A9 rather than papered over.
// identity.
//
// The source is NEVER in the website repo, NEVER in any visitor's
// localStorage, NEVER on the wire in plaintext, and the browser key page that
// used to decrypt it locally has been REMOVED (D15) because it required
// embedding the ciphertext. The owner keeps their own original file.
//
// ---------------------------------------------------------------------------
// HOW TO DEPLOY
// ---------------------------------------------------------------------------
//   Full checklist, including the D1 database and the webhook, is in
//   `For Cloudflare/README.md`. `wrangler.toml` is the source of truth and
//   carries the same steps inline.
//
//   1. wrangler login
//   2. wrangler d1 create scripterhub      -> paste database_id into wrangler.toml
//   3. wrangler d1 execute scripterhub --file=migrations/0001_init.sql
//   4. wrangler secret put SH_SETUP_TOKEN
//      wrangler secret put SH_SESSION_SECRET
//      wrangler secret put SH_KDF_PEPPER
//      (optional) wrangler secret put SH_DISCORD_WEBHOOK
//   5. fill in account_id / name / KV id in wrangler.toml, then wrangler deploy
//   6. curl -X POST .../sh/owner-claim -d '{"setupToken":"..."}'  (ONCE)
//   7. curl .../sh/health   -> want stateLayer:true, delivery:"session-gated"
//
// ============================================================

// ===========================================================================
// INLINED MODULES - the atomic state layer, at-rest crypto, and the delivery
// rules. These were three sibling files until now.
//
// They are inline because this worker is deployed by PASTING IT INTO THE
// CLOUDFLARE DASHBOARD, which has no filesystem. A relative import cannot
// resolve there, so a four-file worker was never deployable by the method
// actually in use. Splitting it was correct for `wrangler deploy` and wrong
// for how the worker is really shipped.
//
// Consequences, all of them good:
//
//   * no build step, and no dist/ directory that can drift from this file
//   * what the tests import IS what gets pasted - one artifact, not two
//   * no bundler to maintain, and no generated copy to keep in sync
//
// Order below is dependency order: state layer, then crypto, then the rules
// that call both, then the routing below that calls the rules.
// ===========================================================================


// ==========================================================================
// INLINED FROM server/d1_state.js
// ==========================================================================
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
const SESSION_TTL_CEILING_MS = 60000;
const DEFAULT_SESSION_TTL_MS = 45000;      // request() path
const URL_TOKEN_TTL_MS = 15000;           // weaker HttpGet fallback

// Deterministic window bucket: floor(now / window) * window. One row per
// (bucket, window_start), so a fixed window is a single atomic upsert.
function windowStart(now, windowMs) {
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
const run = q;
const all = qAll;
const one = qOne;

function createState(db) {
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
function changesOf(res) {
    if (!res) return 0;
    if (typeof res === 'number') return res;
    const m = res.meta || res;
    const v = m.changes ?? m.rows_changed ?? m.changesRead ?? 0;
    return Number(v) || 0;
}

// ==========================================================================
// INLINED FROM server/artifact_crypto.js
// ==========================================================================
// ===========================================================================
// At-rest encryption for the artifact store (Phase 4)
// ===========================================================================
//
// WHAT THIS IS FOR, PRECISELY
//
// The artifact in KV is already ciphertext: the owner's browser encrypted it
// with the per-script Special Key before upload, and the worker never sees
// that key. So this is NOT about protecting the artifact from the worker, and
// claiming otherwise would be a category error.
//
// What it IS about is a narrower and real threat: the KV namespace is one flat
// readable store that also holds sh_licenses, sh_users_db, sh_meta_ and the
// split keys. Anyone who can read the namespace — a leaked credential, a
// misconfigured binding, a backup, an insider — currently reads the artifact
// bytes directly, with no second factor. `SH_ARTIFACT_KEK` adds one: a key
// that lives only in the Worker's secret store, so the ciphertext sitting in
// KV is inert on its own.
//
// It does NOT protect against the worker itself being compromised. The KEK is
// in the same process. It narrows the blast radius of "the KV store leaked",
// which is the realistic case, and it is honest about that rather than
// overselling.
//
// ---------------------------------------------------------------------------
// WHY IT IS OPT-IN AND MARKER-PREFIXED
// ---------------------------------------------------------------------------
//
// Two reasons, and the second is the important one.
//
// 1. Cost. AES-GCM over a 30MB artifact per delivery is real CPU on a Worker.
//     An operator who does not need it should not pay for it.
//
// 2. A rollout that cannot be reversed. If the KEK is set and the namespace is
//     already full of plaintext artifacts, then un-setting the KEK makes every
//     one of them permanently unreadable. That is data loss, not a security
//     downgrade, and it would happen silently.
//
// So every value carries a marker:
//
//     SHKEK1:<base64 iv>:<base64 ciphertext+tag>
//
// A value WITHOUT the marker is plaintext and is served as-is; a value WITH it
// needs the KEK. That makes the two states unambiguous, makes a partial
// rollout safe in both directions, and means this can be switched on for new
// uploads without touching existing ones.
//
// A missing KEK on a marked value is a REFUSAL, never a pass-through. Serving
// the raw marked bytes would hand the caller a string starting "SHKEK1:" and
// they would conclude the script is corrupt rather than that the operator
// misconfigured something. Failing loudly is the only safe direction.
// ===========================================================================

const KEK_MARKER = 'SHKEK1:';

// Cached per isolate: the deriveKey call is not free and a secret does not
// change while an isolate is alive, so re-deriving on every request is waste.
//
// KEYED ON THE KEK, and that is load-bearing rather than tidiness.
//
// The first version cached a single derived key with nothing on the entry. It
// looked correct — one Worker, one env, one secret — and it was, right up
// until two different KEKs existed in one module instance. Then the cache
// handed back the PREVIOUS key and the new one silently failed to decrypt.
// tools/artifact_crypto_test.mjs caught it by encrypting with one KEK and
// decrypting with another in the same process.
//
// Not purely theoretical: `wrangler dev` reloads the module with different
// vars, a preview and a production env can share an isolate locally, and any
// future multi-tenant shape would do it in anger. The failure mode is data
// loss reported as a wrong-key error — an operator rotates a secret and every
// script breaks, which is the worst possible moment to discover it.
//
// The cache key is a SHA-256 of the secret, not the secret, so the raw KEK is
// never parked in a module-level variable for a heap dump or a stray log to
// find. Bounded so a pathological number of distinct secrets cannot grow it
// without limit; insertion order is the eviction order.
let kekCache = new Map();   // sha256(secret) -> { raw: ArrayBuffer, at: number }
const KEK_CACHE_MS = 60 * 1000;
const KEK_CACHE_MAX = 8;

function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function kekConfigured(env) {
    return !!(env && env.SH_ARTIFACT_KEK && String(env.SH_ARTIFACT_KEK).length >= 16);
}

function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(KEK_MARKER);
}

function hex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
}

async function getKek(env) {
    if (!kekConfigured(env)) return null;
    const secret = String(env.SH_ARTIFACT_KEK);
    const tag = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))));
    const now = Date.now();
    const hit = kekCache.get(tag);
    if (hit && now - hit.at < KEK_CACHE_MS) return hit.raw;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('SHKEK::' + secret));
    if (kekCache.size >= KEK_CACHE_MAX) {
        const oldest = kekCache.keys().next().value;
        if (oldest !== undefined) kekCache.delete(oldest);
    }
    kekCache.set(tag, { raw: digest, at: now });
    return digest;
}

// Test seam: the cache is module-level, so a test that flips the env var
// between cases would otherwise read the previous case's key.
function _resetKekCache() { kekCache = new Map(); }

// ---------------------------------------------------------------------------
// Encrypt / decrypt
// ---------------------------------------------------------------------------

async function encryptAtRest(env, text) {
    const kek = await getKek(env);
    if (!kek) return text;                       // opt-in: no KEK, no change
    const key = await crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, ['encrypt']);
    // 12 bytes is the GCM standard nonce length. Random per encryption, which
    // is what stops two identical artifacts producing identical ciphertext.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text)
    );
    return KEK_MARKER + b64(iv) + ':' + b64(new Uint8Array(ct));
}

// Returns the plaintext, or throws. Callers MUST NOT fall back to the raw
// value on failure — see the module header on why that direction is unsafe.
async function decryptAtRest(env, value) {
    if (!isEncrypted(value)) return value;        // legacy plaintext
    const kek = await getKek(env);
    if (!kek) {
        throw new Error('artifact is at-rest encrypted but SH_ARTIFACT_KEK is not set');
    }
    const rest = value.slice(KEK_MARKER.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) throw new Error('corrupt at-rest envelope');
    const iv = unb64(rest.slice(0, sep));
    const ct = unb64(rest.slice(sep + 1));
    const key = await crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
}

// Non-throwing probe for call sites that want to distinguish "not set up" from
// "corrupt", e.g. to answer a health check.
async function tryDecryptAtRest(env, value) {
    try { return { ok: true, text: await decryptAtRest(env, value) }; }
    catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
}

// ==========================================================================
// INLINED FROM server/delivery.js
// ==========================================================================
// ===========================================================================
// ScripterHub — session-gated delivery (Phase 3)
//
// WHAT THIS IS
// The layer between "the client proved it may run" and "here are the bytes".
// It is deliberately separate from worker.js because everything here is
// DECISIONS, not routing: the whole value of the module is that the rules are
// in one place and each one is a single statement that either fires or does
// not.
//
// THE THREE PROPERTIES, and where each one lives
//
//   1. No artifact without a session.
//      Not enforced here — enforced by the fact that nothing in worker.js
//      reads artifact bytes outside `deliver()`. See GATE 1 below.
//
//   2. One session, one delivery, ever.
//      `authorize()` in d1_state.js. A single conditional UPDATE whose WHERE
//      clause carries every precondition, success = changes()===1. The nonce
//      is spent first (DELETE ... RETURNING), then the session.
//
//   3. Old sessions die.
//      `expires_at > now` in the same WHERE clause. Server-enforced, so
//      there is no advisory timestamp a client can ignore. The 60s ceiling is
//      additionally a database trigger, so an over-long session is not
//      insertable even by a future caller that bypasses the constant.
//
// WHY THE NONCE IS SPENT BEFORE THE SESSION
// The failure direction decides the design. If the session is spent and the
// nonce check then fails, the client must restart the flow and the artifact
// was never delivered — safe. The other order could leave a session spent
// against a nonce that was never claimed, which is also safe, but the first
// order additionally guarantees that a session can never be spent twice for
// the same claim attempt. When in doubt, burn the scarce resource (the
// session) and let the client re-mint.
//
// WHY A SERVER-ISSUED OPAQUE VALUE INSTEAD OF A DERIVED TOKEN
// The Phase 1 token was HMAC(key|hwid|t0) keyed by SHA-256("SHAUTH::"+key).
// Every input to that expression is known to anyone who already holds the
// license key, so it was not proof of anything — it was a checksum. A client
// could compute a valid token offline and present it, which is gate G09.
//
// sid and nonce are now 192 bits from crypto.getRandomValues(), stored in D1,
// and never derivable from anything the client knows. Possession of a valid
// license gets you a session; it does not get you a token, because there is no
// token to compute. The client is not trusted to have authenticated; the
// server has a row saying so.
// ===========================================================================

// Every statement in this module goes through the engine-normalising helpers
// in d1_state.js rather than calling db.prepare(sql).bind(...) directly. That
// is not a style preference: D1 and node:sqlite have different calling
// conventions, `.bind` exists on only one of them, and a direct call writes
// NULL columns on the other WITHOUT THROWING. See the note beside stmtFor().


// A session is short by design. 45s is long enough for an executor to
// authenticate, fetch, decrypt and start, and short enough that a captured
// pair is worthless almost immediately.
const SESSION_TTL_MS = 45000;// The URL fallback (game:HttpGet cannot set headers) is strictly weaker: the
// credential rides in a URL that can reach access logs. It gets a shorter life
// and is counted separately, so its share of traffic stays visible instead of
// being averaged into the strong path's numbers.
const URL_SESSION_TTL_MS = 15000;

// A multi-part chain is a long crawl by construction — an executor pulling
// 10GB of parts needs minutes, not seconds. So the chain window is generous
// compared to a single delivery, and the guarantee comes from the forward-only
// cursor rather than from the clock. One-time-ness of each PART is what
// matters; the window only bounds how long a partial crawl can be resumed.
const CHAIN_GRANT_TTL_MS = 15 * 60 * 1000;

// The inline/chain split is decided by ONE number, defined with CHUNK_THRESHOLD below.
// See the note there: these two used to be independent constants and the gap between
// them was a dead zone where a script could be uploaded successfully and then never
// deliver at all.

// Refusal reasons. Returned to the loader as `SHERR <reason>` so the in-game
// UX can say something useful, and written to the audit log. Deliberately
// coarse: a client that can tell "expired" from "wrong hardware" learns
// something about the keyspace, and it gains nothing operationally either way.
const DENY = {
    NO_STATE:    'nostate',     // D1 not bound / not migrated
    NO_SCRIPT:   'gone',        // no such script
    KILLED:      'killed',      // killswitch or per-script kill
    NEEDS_KEY:   'invalid',     // no/invalid license presented
    BANNED:      'banned',
    EXPIRED:     'expired',
    HWID:        'hwid',        // locked to different hardware
    // The key is real, unexpired and unlocked, but belongs to another project.
    PROJECT:     'project',
    HIDDEN:      'hidden',      // visibility forbids this caller
    NO_SESSION:  'nosession',   // sid unknown, spent, or revoked
    BAD_NONCE:   'nonce',       // nonce unknown, spent, or wrong session
    EXPIRED_SESSION: 'stale',
    TOO_LARGE:   'toolarge',
    // The PC storage backend rejected our credential. The script EXISTS - it is
    // a secret mismatch on the operator's side, not a missing script. It needs
    // its own code because "gone" sends the operator to hunt for a deleted or
    // expired script instead of at the one secret that is wrong.
    STORAGE_AUTH: 'storageauth',
    // The artefact exists and was retrieved, but it is too big to deliver in
    // one response AND it was stored whole, so there are no parts to chain.
    // "gone" would be a lie: the script is right there, and the fix is to
    // re-upload so it gets split.
    TOO_BIG_WHOLE: 'toobig'
};
// ===========================================================================
// REWARD / AD-CHECKPOINT SYSTEM
// ===========================================================================
//
// WHY ALL OF THIS IS SERVER-SIDE, AND WHY IT HAS TO BE
//
// The previous implementation lived entirely in the visitor's browser:
// the reward config rode in the share link as base64 JSON, progress rode in
// localStorage, the anti-bypass blacklist rode in localStorage, and the key
// was a 25-character Math.random() value minted on the spot.
//
// Every one of those was under the visitor's control, which means:
//
//   * The config was editable. Rewrite `cps` to a single about:blank entry,
//     append `?done=0`, and reward.html reported 1/1 complete and minted a
//     key. No ad was ever visited. That is a reward system that pays out on
//     demand, which is the single thing it exists to prevent.
//   * The earned key was not a license. It was never reported to the worker,
//     so /sh/auth resolved nothing and answered `invalid`, the owner never saw
//     it, and clearing site data destroyed it.
//   * The blacklist was a localStorage key, so clearing site data cleared the
//     ban. /threat was posted with an empty body, so the owner was told
//     nothing and could enforce nothing.
//   * Provider settings (API tokens, anti-bypass flags) were typed by the
//     owner into a form and then DISCARDED by encodeRewardCfg, which emitted
//     only { u, p }. Nothing verified anything.
//
// A verification step that the visitor's own browser performs verifies
// nothing. So the config, the progress, the ban and the key mint all move here.
//
// A DELIBERATE NON-DECISION: the provider API tokens do NOT go in the share
// link. The link is handed to every visitor, so an API token in it would be
// readable by anyone who opened the page - who could then forge a postback
// and spend the owner's ad balance. The public link carries an opaque id and
// a signature, and nothing else.
//
// FAIL CLOSED, ALWAYS
//
// verifyProvider() returns { ok: false } for any provider whose API
// credentials are absent or whose confirmation API did not corroborate the
// click. A checkpoint whose provider cannot be verified therefore cannot be
// completed. The alternative - carry on as if the wait had been long enough -
// is the behaviour being replaced, and it is why the flow paid out on demand.
// --------------------------------------------------------------------------

const REWARD_PREFIX = 'sh_rw_';        // reward config
const RSES_PREFIX   = 'sh_rs_';        // visitor session
const RBLK_PREFIX   = 'sh_rbl_';       // blacklist entry
// A provider click that has been handed back, waiting for the visitor's reward
// page to collect it. See /sh/cp static postback below.
const RCLICK_PREFIX = 'sh_rclk_';      // one row per provider click id

const REWARD_SESSION_TTL_MS = 8 * 24 * 3600 * 1000;  // 8 days idle (Luarmor: 7-10)
const REWARD_STEP_TTL_MS     = 70 * 60 * 1000;       // 70 min per checkpoint
// ONE MINUTE, not two hours.
//
// The owner set this after being banned for two hours for clicking Verify on a
// checkpoint he had already completed. Two hours is a very long time to lose
// for a mistake that is usually a misclick, a slow provider postback, or an ad
// blocker - and it is enforced on the IP, so it is not even lost by the person
// who triggered it.
//
// The point of this penalty is to stop a motivated bypasser hammering the
// callback route. A minute is long enough to make hammering pointless and short
// enough that an honest visitor who trips it loses nothing. Strikes still
// double (1m, 2m, 4m, 8m), so a persistent offender still ends up somewhere
// they cannot sit out.
const REWARD_BLACKLIST_MS    = 60 * 1000;           // 1 minute
const REWARD_BLACKLIST_MAX_STRIKES = 4;              // cap doubling at 16h

// Providers this build can verify, and the credential each one needs before it
// is allowed to pass a checkpoint. A provider absent from this table can still
// be CONFIGURED - it is handed a signed callback URL - but it cannot be
// completed, which is the fail-closed behaviour rather than an oversight.
const REWARD_PROVIDERS = {
    test:        { needs: 'none' },
    linkvertise: { needs: 'authToken' },
    lootlabs:    { needs: 'apiKey' },
    workink:     { needs: 'apiKey' }
};

// ---------------------------------------------------------------------------
// storage helpers
// ---------------------------------------------------------------------------

async function loadReward(env, rid) {
    if (!env.LOADERS_KV || !rid) return null;
    try {
        const raw = await env.LOADERS_KV.get(REWARD_PREFIX + rid);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

async function saveReward(env, r) {
    r.updatedAt = Date.now();
    await env.LOADERS_KV.put(REWARD_PREFIX + r.rid, JSON.stringify(r));
    return r;
}

async function deleteReward(env, rid) {
    try { await env.LOADERS_KV.delete(REWARD_PREFIX + rid); } catch (e) {}
}

// The ONLY shape a visitor is ever shown.
//
// Notably absent: shortUrl and settings. A visitor can see WHICH provider a
// checkpoint belongs to and what it is called, and nothing else - not the URL
// it redirects to, and certainly not the API token used to verify it.
function rewardPublicView(r) {
    return {
        rid: r.rid,
        name: r.name,
        keyDurationH: r.keyDurationH || 1,
        maxKeys: r.maxKeys || 1,
        cooldownH: r.cooldownH || 0,
        maxHours: r.maxHours || 0,
        allowExtending: !!r.allowExtending,
        extHours: r.extHours || 6,
        total: (r.checkpoints || []).length,
        // THE LIVE COUNTERS COME BACK NOW.
        //
        // This view used to carry only {i, name, provider}. The panel's
        // "Completed" column therefore had nothing to read, so it displayed
        // whatever the browser's localStorage happened to hold - which is
        // reported as "checkpoints would not count as passed", because the
        // number in the panel never moved even while the server was counting
        // completions perfectly.
        //
        // They are also returned per-step rather than as one aggregate, so the
        // panel can show which checkpoint is failing rather than only a total.
        //
        // This is the OWNER-facing view (it already exposes config and, via
        // /sh/reward/get, the provider links), not the visitor view, so no
        // provider secret is exposed by adding three numeric fields.
        steps: (r.checkpoints || []).map(function (c, i) {
            return {
                i: i,
                // The stable id, so the panel can match a step back to its own
                // checkpoint when it adopts the counters. Matching on array
                // index instead would move a checkpoint's history onto its
                // neighbour the moment the owner reorders the list.
                id: c.id || '',
                name: c.name || ('Checkpoint ' + (i + 1)),
                provider: c.provider,
                completed: Number(c.completed) || 0,
                cancelled: Number(c.cancelled) || 0,
                avgTimeSec: Number(c.avgTimeSec) || 0
            };
        })
    };
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

function sesKvKey(rid, sid) { return RSES_PREFIX + rid + '_' + sid; }

function sesTtlOpts() {
    return { expirationTtl: Math.ceil(REWARD_SESSION_TTL_MS / 1000) };
}

async function loadSes(env, rid, sid) {
    if (!env.LOADERS_KV || !rid || !sid) return null;
    try {
        const raw = await env.LOADERS_KV.get(sesKvKey(rid, sid));
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

async function saveSes(env, s) {
    s.lastAt = Date.now();
    await env.LOADERS_KV.put(sesKvKey(s.rid, s.sid), JSON.stringify(s), sesTtlOpts());
    return s;
}

function newId(prefix) {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    let s = '';
    for (let i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return prefix + s;
}

// The visitor's session id is DERIVED, not stored.
//
// The client sends only its fingerprint; the worker combines that with the
// reward id and signs it into a stable id. Two consequences, both wanted:
//
//   * Clearing localStorage does not hand out a fresh session. A visitor who is
//     mid-way through a reward, or who has been banned, cannot reset their way
//     out by clearing site data - which is exactly the move the ban exists to
//     stop, and exactly what the old localStorage session id allowed.
//   * Closing the tab and coming back later resumes the same session, so a
//     visitor who finished an ad on their phone and reopened the link on a
//     desktop on the same network keeps their progress.
//
// It is a capability for THIS reward only: the reward id is inside the signed
// material, so a session id cannot be lifted onto a different reward.
//
// THE IP IS NOT IN THE ID, and that is a fix, not an oversight.
//
// It used to be: material = rid | fp | ip. A phone that changed network (or a
// browser that got a new IPv6 address, or a VPN that dropped) produced a
// DIFFERENT session id, so the worker's lookup missed and the visitor's
// progress - and their earned keys - vanished. That is the "refreshing the
// page makes my progress disappear" report, and it hits exactly the people
// most likely to be on a mobile network.
//
// The IP is still RECORDED on the session, and it is still the thing the
// provider's click is checked against. Binding the CLICK to the IP is what
// makes a click verifiable; binding the SESSION to the IP only broke people.
//
// The cooldown is unaffected: it hangs off the session, so it follows the
// fingerprint rather than the address, which is strictly harder to dodge.
async function deriveSesId(secret, rid, fp) {
    const material = rid + '|' + String(fp || '');
    return 's' + (await hmacHex(secret, material)).slice(0, 24);
}

// ---------------------------------------------------------------------------
// A LOCK PER SESSION.
//
// The reward session is one JSON blob in KV, and two requests that both write
// it are a lost update waiting to happen. The concrete case:
//
//   1. the provider callback completes checkpoint 0        -> writes done=[0]
//   2. the page's own /sh/reward/start (it fires on every load and after
//      every completion) had already read the session with done=[] and now
//      writes it back -> done=[] again
//
// The completion is silently gone and the visitor is back at 0/1, forever.
// This is the "the checkpoint progression sometimes does not advance" bug, and
// "sometimes" is the whole of it: it depends on which of the two writes lands
// last.
//
// So the writes are SERIALISED per session. Cloudflare KV has no compare-and-
// set, so the lock is a write-then-read-back: put a random token, read it,
// and only proceed if the token that comes back is ours. KV guarantees
// read-after-write on the same key, so two writers cannot both believe they
// hold it.
//
// It is a best-effort mutex, not a distributed lock, and it is documented as
// one. If the lock cannot be taken within the window the request proceeds
// anyway: refusing a legitimate visitor because a lock was busy is worse than
// the race it prevents, and the completion path re-reads and retries as well.
// ---------------------------------------------------------------------------
const RLOCK_PREFIX = 'sh_rlock_';

async function withSesLock(env, rid, sid, fn, waitMs) {
    if (!env.LOADERS_KV || !rid || !sid) return await fn();
    const key = RLOCK_PREFIX + rid + '_' + sid;
    const token = newId('lk');
    const deadline = Date.now() + (waitMs || 2500);
    for (;;) {
        let held = false;
        try {
            const cur = await env.LOADERS_KV.get(key);
            if (!cur) {
                await env.LOADERS_KV.put(key, JSON.stringify({ t: token, at: Date.now() }),
                    { expirationTtl: 15 });
                const back = await env.LOADERS_KV.get(key);
                held = !!(back && JSON.parse(back).t === token);
            }
        } catch (e) { held = true; /* a KV hiccup must not block the visitor */ }
        if (held) {
            try { return await fn(); }
            finally {
                try { await env.LOADERS_KV.delete(key); } catch (e) { /* expires anyway */ }
            }
        }
        if (Date.now() > deadline) return await fn();
        await new Promise(function (r) { setTimeout(r, 40 + Math.floor(Math.random() * 60)); });
    }
}

// THE SESSION FOR THIS FINGERPRINT.
//
// The id is derived, so finding the session is a derivation and a read.
//
// If the derived id has no session, the LEGACY id is tried: until this change
// the id included the IP, so every visitor in progress has a session under
// the old id. Adopting it means deploying this does not reset every
// unfinished reward in the country once. A visitor whose IP has changed
// since they started is not adopted - that is the case that was broken
// anyway, and their progress is unrecoverable by definition.
async function resolveSes(env, rid, fp, ip, secret) {
    const sid = await deriveSesId(secret, rid, fp);
    const ses = await loadSes(env, rid, sid);
    if (ses) return { sid: sid, ses: ses };
    if (ip) {
        const legacySid = 's' + (await hmacHex(secret, rid + '|' + String(fp || '') + '|' + String(ip))).slice(0, 24);
        if (legacySid !== sid) {
            const old = await loadSes(env, rid, legacySid);
            if (old) {
                old.sid = sid;
                await saveSes(env, old);
                return { sid: sid, ses: old };
            }
        }
    }
    return { sid: sid, ses: null };
}

// ---------------------------------------------------------------------------
// blacklist: fingerprint + IP, held server-side so clearing site data does
// not clear the ban.
//
// The primary key is the fingerprint; the IP is written as a second entry so a
// visitor who rotates their browser profile but keeps their connection is still
// caught. Shared household NAT is the cost of that, and it is why the reason
// string is kept - the owner can see why somebody was banned.
// ---------------------------------------------------------------------------

async function blacklistReadKey(env, k) {
    if (!env.LOADERS_KV || !k) return null;
    try {
        const raw = await env.LOADERS_KV.get(RBLK_PREFIX + k);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

async function blacklistGet(env, fp, ip) {
    // FINGERPRINT ONLY. NOT THE IP.
    //
    // This used to fall back to sh_rbl_ip_<ip>. Those entries still exist -
    // written by the old code, with a 2-hour TTL - so honouring them would keep
    // locking out entire households for up to two more hours after this
    // deploys, which is the exact failure being fixed. A block keyed on an
    // address shared by a whole home, an office or a carrier is not a block on
    // a person.
    //
    // They simply expire; nothing needs deleting them.
    const hit = await blacklistReadKey(env, fp);
    if (!hit) return null;
    if (hit.until && hit.until > Date.now()) return hit;
    return null;
}

async function blacklistAdd(env, fp, ip, reason, rid) {
    if (!env.LOADERS_KV) return null;
    // Doubling penalty: 2h -> 4h -> 8h -> 16h, then flat.
    const prev = await blacklistGet(env, fp, ip);
    const strikes = Math.min(REWARD_BLACKLIST_MAX_STRIKES,
        (prev && prev.strikes ? prev.strikes : 0) + 1);
    const ttlSec = Math.ceil(REWARD_BLACKLIST_MS * Math.pow(2, REWARD_BLACKLIST_MAX_STRIKES) / 1000);
    // pow(2, strikes - 1), NOT pow(2, strikes). The first strike must be the
    // promised 2 hours: strikes starts at 0 and is incremented above, so
    // pow(2, 1) made a first offence 4 hours, and the doubling was one step
    // ahead of the 2h -> 4h -> 8h the panel text and the visitor screen show.
    const until = Date.now() + Math.pow(2, Math.max(0, strikes - 1)) * REWARD_BLACKLIST_MS;
    const entry = {
        until: until, strikes: strikes, reason: String(reason || '').slice(0, 200),
        rid: rid || '', fp: fp || '', ip: ip || '', at: Date.now()
    };
    try {
        if (fp) await env.LOADERS_KV.put(RBLK_PREFIX + fp, JSON.stringify(entry), { expirationTtl: ttlSec });
        // NO IP ENTRY. NOT ANY MORE.
        //
        // This also wrote sh_rbl_ip_<ip>, which is why one person tripping the
        // penalty locked out every device behind the same router: the owner
        // reported exactly this - banned on his browser, and "i cant go to my
        // phone and redo it or in any other browser".
        //
        // On residential NAT that is not a security measure, it is collateral.
        // An IP is shared by a whole household, a campus, an office and a
        // mobile carrier's entire subscriber base, so one misclick anywhere
        // behind that address blocks every honest person behind it, with no way
        // for any of them to find out why or appeal it.
        //
        // The fingerprint is the identity that matters here, and evasion is
        // already hard without an IP ban: the step token is HMAC-signed per
        // reward/session/step, the nonce is single-use server-side, and the
        // session id is derived from the fingerprint. Someone who wants to
        // retry simply retries.
        //
        // If an IP-level block is ever genuinely needed, it belongs on a
        // deliberate-abuse signal with a short window and an operator override -
        // not on every verification failure.
    } catch (e) { return null; }
    S.threatsBlocked++;
    return entry;
}

// ---------------------------------------------------------------------------
// provider verification
// ---------------------------------------------------------------------------
//
// verifyProvider() is the whole point of the anti-bypass feature. It must be
// able to return ok:false, and every caller must treat that as a refusal.
//
//   cp      the owner's checkpoint, including its settings
//   signal  whatever the provider echoed back:
//              { clickId, ip, elapsedMs, confirmed, postback, hash }
//   origin  this worker's own public base URL
//
// Returns { ok:true, detail } or { ok:false, reason }.
//
// THE PROVIDER IS THE AUTHORITY, AND THE ANSWER IS READ, NOT ASSUMED.
//
// The old Linkvertise check was `if (!res.ok) fail; await res.text(); return
// {ok:true}`. The body was fetched and thrown away, so ANY 200 was a pass -
// including the 200 an API returns for a click id it has never heard of. An
// attacker who could produce a click id from any campaign anywhere would
// pass. The body is now parsed and the answer is read out of it.
//
// Every failure is classified, because the two kinds must be treated
// differently:
//
//   transient  the provider has not reported back yet, or is unreachable, or
//              the click id is unknown TO THE PROVIDER. The visitor is told
//              to wait and NOTHING is penalised. This is the common honest
//              case and it must never cost anybody a lockout.
//   refused   the provider answered, and the answer is "this click is not
//              what you say it is". That is a real bypass signal.
// ---------------------------------------------------------------------------

// How long a click plausibly takes. A return faster than this is a client that
// never rendered an ad, and it is refused rather than counted.
const REWARD_MIN_DWELL_MS = 4000;

// The reasons that mean "not yet", as opposed to "no".
//
// They are checked with indexOf === 0 because some of them carry a status
// code (lv-api-403) and the prefix is what matters.
const REWARD_TRANSIENT_REASONS = [
    'no-click-id', 'too-fast', 'lv-unreachable', 'wi-unreachable',
    'll-unreachable', 'lv-api-', 'wi-not-confirmed', 'll-api-',
    'click-unknown', 'postback-unauthenticated'
];

function isTransientReason(reason) {
    const r = String(reason || '');
    return REWARD_TRANSIENT_REASONS.some(function (x) { return r === x || r.indexOf(x) === 0; });
}

function providerNeeds(cp) {
    const spec = REWARD_PROVIDERS[cp && cp.provider];
    if (!spec) return { ok: false, reason: 'unknown-provider' };
    if (spec.needs === 'none') return { ok: true };
    const st = (cp.settings || {});
    if (spec.needs === 'authToken' && !st.authToken) return { ok: false, reason: 'no-auth-token' };
    if (spec.needs === 'apiKey' && !st.apiKey) return { ok: false, reason: 'no-api-key' };
    return { ok: true };
}

// READ A PROVIDER'S ANSWER.
//
// The providers do not agree on a schema, and inventing one is how a check
// ends up passing everything. So this looks for an EXPLICIT negative and
// otherwise requires the body to actually contain something. A response that
// is empty, unparseable, or an object with no data in it is a refusal, not a
// pass.
//
//   body       the raw text the provider returned
//   clickId    the id we asked about, so a body that echoes it is a positive
function readProviderAnswer(body, clickId) {
    const txt = String(body || '').trim();
    if (!txt) return { ok: false, reason: 'empty-response' };
    // A plain-text confirmation, which is what work.ink's confirm endpoint
    // returns.
    if (/^"?confirmed"?$/i.test(txt) || /^1$/.test(txt) || /^true$/i.test(txt)) {
        return { ok: true, detail: 'confirmed-text' };
    }
    if (/^(invalid|not\s*found|unknown|error|no\s*click)/i.test(txt)) {
        return { ok: false, reason: 'click-unknown' };
    }
    let obj = null;
    try { obj = JSON.parse(txt); } catch (e) { obj = null; }
    if (obj && typeof obj === 'object') {
        // An explicit negative wins over everything else.
        const neg = ['error', 'errors', 'message', 'status', 'success', 'valid', 'confirmed', 'found'];
        for (const k of neg) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                const v = obj[k];
                if (v === false || v === 0 || v === 'false' || v === 'error' || v === 'invalid'
                    || v === 'not_found' || v === 'not found' || v === 'failed' || v === 'expired') {
                    return { ok: false, reason: 'click-unknown' };
                }
            }
        }
        // A body that echoes the click id we asked about is a positive: the
        // provider knows this click.
        if (clickId && txt.indexOf(clickId) !== -1) return { ok: true, detail: 'click-echoed' };
        // Otherwise: a non-empty object with data in it is a positive, and an
        // empty one is not.
        const keys = Object.keys(obj);
        if (keys.length === 0) return { ok: false, reason: 'empty-response' };
        if (keys.length === 1 && Array.isArray(obj[keys[0]]) && obj[keys[0]].length === 0) {
            return { ok: false, reason: 'empty-response' };
        }
        return { ok: true, detail: 'provider-body' };
    }
    // Not JSON and not a known confirmation. If it mentions the click id it
    // is a positive; otherwise it is not.
    if (clickId && txt.indexOf(clickId) !== -1) return { ok: true, detail: 'click-echoed' };
    return { ok: false, reason: 'unreadable-response' };
}

async function verifyProvider(cp, signal) {
    const ready = providerNeeds(cp);
    if (!ready.ok) return ready;
    const st = (cp && cp.settings) || {};

    if (cp.provider === 'test') {
        // The only provider corroborable with no third party. It still goes
        // through the same gate, so it exercises the flow a real provider uses.
        if (!signal || !signal.confirmed) return { ok: false, reason: 'not-confirmed' };
        return { ok: true, detail: 'test' };
    }

    if (signal && signal.elapsedMs != null && signal.elapsedMs < REWARD_MIN_DWELL_MS) {
        return { ok: false, reason: 'too-fast' };
    }

    if (cp.provider === 'linkvertise') {
        if (!signal || !signal.clickId) return { ok: false, reason: 'no-click-id' };
        try {
            // Linkvertise's publisher API, with the token from the dashboard's
            // Anti Bypassing setting. The answer is READ, not assumed.
            const u = 'https://api.linkvertise.com/api/v1/statistics'
                + '?token=' + encodeURIComponent(st.authToken)
                + '&click_id=' + encodeURIComponent(signal.clickId);
            const res = await fetch(u, { headers: { Accept: 'application/json' } });
            if (!res.ok) return { ok: false, reason: 'lv-api-' + res.status };
            const body = await res.text();
            const answer = readProviderAnswer(body, signal.clickId);
            if (!answer.ok) return answer;
            // The owner may pin the Linkvertise link (zone) the click must
            // belong to. When they have, a click from any other campaign is
            // refused: otherwise a click id from somebody else's campaign
            // would pass, because it is a real click.
            const wantLink = String(st.linkId || '').trim();
            if (wantLink && String(body).indexOf(wantLink) === -1) {
                return { ok: false, reason: 'lv-wrong-link' };
            }
            return { ok: true, detail: 'linkvertise:' + answer.detail };
        } catch (e) { return { ok: false, reason: 'lv-unreachable' }; }
    }

    if (cp.provider === 'workink') {
        if (!signal || !signal.clickId) return { ok: false, reason: 'no-click-id' };
        try {
            // Work.Ink's confirm endpoint. It answers with plain text, and
            // the IP of the clicker can be included so the answer can be
            // bound to the visitor.
            const u = 'https://api.work.ink/confirm/v2'
                + '?token=' + encodeURIComponent(st.apiKey)
                + '&click_id=' + encodeURIComponent(signal.clickId)
                + '&ip=' + encodeURIComponent(signal.ip || '');
            const res = await fetch(u);
            const txt = (await res.text()).trim();
            if (!res.ok) return { ok: false, reason: 'wi-api-' + res.status };
            const answer = readProviderAnswer(txt, signal.clickId);
            if (!answer.ok) return answer;
            return { ok: true, detail: 'workink:' + answer.detail };
        } catch (e) { return { ok: false, reason: 'wi-unreachable' }; }
    }

    if (cp.provider === 'lootlabs') {
        // LootLabs' documented mechanism is a SERVER-TO-SERVER POSTBACK: the
        // provider calls OUR url with click_id, ip and unique_id when a user
        // completes a task. There is no documented "ask LootLabs about this
        // click" endpoint, so the postback IS the proof, and it is
        // authenticated with the shared secret the owner put in the postback
        // url.
        //
        // The old implementation called lootlabs.com/api/lootlabs_postback
        // with the API key in a `status` parameter. That endpoint is not in
        // LootLabs' documentation, and an unverifiable call is worse than no
        // call: it either fails for honest visitors or passes for everyone.
        if (!signal || !signal.clickId) return { ok: false, reason: 'no-click-id' };
        if (!signal.postback) return { ok: false, reason: 'postback-unauthenticated' };
        return { ok: true, detail: 'lootlabs:postback' };
    }

    return { ok: false, reason: 'unverifiable-provider' };
}

// ---------------------------------------------------------------------------
// step tokens: the signed capability the provider callback carries.
//
// It binds reward + session + step index + expiry + a per-step nonce, so a
// callback cannot be replayed onto a different step or a different visitor.
// The nonce is consumed on use, so a provider that double-fires a postback
// cannot advance two steps with one click.
// ---------------------------------------------------------------------------

async function signStep(secret, o) {
    const body = { r: o.rid, s: o.sid, i: o.i, n: o.nonce, e: o.exp };
    const payload = b64u(new TextEncoder().encode(JSON.stringify(body)));
    const sig = (await hmacHex(secret, payload)).slice(0, 32);
    return payload + '.' + sig;
}

async function verifyStep(secret, token, now) {
    const t = String(token || '');
    const dot = t.lastIndexOf('.');
    if (dot <= 0) return { ok: false, reason: 'malformed' };
    const payload = t.slice(0, dot);
    const sig = t.slice(dot + 1);
    const want = (await hmacHex(secret, payload)).slice(0, 32);
    if (sig.length !== want.length) return { ok: false, reason: 'bad-signature' };
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= sig.charCodeAt(i) ^ want.charCodeAt(i);
    if (diff !== 0) return { ok: false, reason: 'bad-signature' };
    let body;
    try { body = JSON.parse(new TextDecoder().decode(unb64u(payload))); }
    catch (e) { return { ok: false, reason: 'bad-payload' }; }
    if (!body || !body.r || !body.s || typeof body.i !== 'number' || !body.n) {
        return { ok: false, reason: 'bad-payload' };
    }
    if (!body.e || body.e < now) return { ok: false, reason: 'expired' };
    return { ok: true, body: body };
}

// ---------------------------------------------------------------------------
// server-minted license keys
// ---------------------------------------------------------------------------
//
// The previous build minted a 25-char Math.random() string in the visitor's
// browser. It was not a license: /sh/auth resolves keys out of sh_licenses, so
// it answered `invalid`, the owner never saw it, and clearing site data
// destroyed it. Minting moves here, uses the same alphabet and length as a
// panel-generated key, and writes into sh_licenses so the executor accepts it
// on the very next run.
// ---------------------------------------------------------------------------

const REWARD_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function mintLicenseKey(len) {
    const n = len || 192;
    // Rejection-free modulo: 58 does not divide 256, so a plain `%` would
    // favour the first 4 characters of the alphabet by ~6%. Drawing one byte at
    // a time and discarding the tail region keeps the distribution flat.
    const out = [];
    const b = new Uint8Array(n * 2);
    crypto.getRandomValues(b);
    let i = 0;
    while (out.length < n) {
        const v = b[i % b.length];
        if (v < 248) out.push(REWARD_KEY_ALPHABET.charAt(v % REWARD_KEY_ALPHABET.length));
        i++;
    }
    return out.join('');
}

async function issueRewardKey(env, reward, ses) {
    const now = Date.now();
    const hours = reward.keyDurationH || 1;
    const key = mintLicenseKey(192);
    // An extendable key is minted with the cap as its ceiling and the earned
    // duration as its starting point, so "+6h" in the visitor's table cannot
    // walk past maxHours.
    const capMs = reward.allowExtending && reward.maxHours
        ? reward.maxHours * 3600000 : 0;

    const map = await loadLicenses(env);
    map[key] = {
        hwid: '',
        expiresAt: now + hours * 3600000,
        banned: false,
        banReason: '',
        discordId: '',
        note: 'Ad Reward: ' + String(reward.name || '').slice(0, 120),
        hwidResets: 0,
        executions: 0,
        lastAuthAt: 0,
        scriptId: '',
        // Provenance, so the owner can tell an ad-earned key from one they typed,
        // and so a reward key can be revoked by reward.
        source: 'reward',
        rewardId: reward.rid,
        capMs: capMs
    };
    await saveLicenses(env, map);

    // expires is carried on the entry as well as in the license record, because
    // the visitor's table renders it and re-reading sh_licenses for one row would
    // be a second round trip on the one request that must feel instant.
    ses.issued = (ses.issued || []).concat([{ key: key, at: now, expires: now + hours * 3600000 }]);
    await saveSes(env, ses);
    return key;
}

// ---------------------------------------------------------------------------
// route helpers
// ---------------------------------------------------------------------------

function reqIp(request) {
    return (request.headers.get('CF-Connecting-IP') || '').slice(0, 64) || '';
}

function reqUa(request) {
    return (request.headers.get('User-Agent') || '').slice(0, 200) || '';
}

// The reward routes are rate limited per bucket. A visitor starting a session
// is cheap and legitimate; a visitor hammering claim() to farm keys is not.
//
// An unknown bucket is NOT waved through. rateLimit() lets unknown buckets
// pass, which is right for its other callers but would make a typo here an
// unmetered route - so this refuses the programmer error loudly instead.
function rewardRate(request, url, bucket) {
    if (!RATE_BUCKETS[bucket]) {
        return new Response(JSON.stringify({ ok: false, error: 'internal: unknown rate bucket' }),
            { status: 500, headers: CORS_HEADERS });
    }
    const rl = rateLimit(bucket, rateIdentity(request, url));
    return rl.allowed ? null : rateLimitedResponse(rl.retryAfterSec);
}

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------

// Which checkpoint is this visitor on, and may they still be working on it?
//
// The 70-minute ceiling is Luarmor's: once a checkpoint is begun the visitor
// has that long to finish it. Letting it sit open forever is how one ad link
// gets milked repeatedly, and after it lapses the step has to restart.
// ---------------------------------------------------------------------------
// provider signal extraction
// ---------------------------------------------------------------------------

// Every provider names its click id differently. These are the names the
// supported ones actually use; accepting a fixed set beats accepting whatever
// arrives, because a wildcard would let a caller nominate their own "click id"
// and satisfy the check with a value the provider never issued.
const REWARD_CLICK_ID_PARAMS = ['click_id', 'clickid', 'clickId', 'unique_id', 'c'];

function pickClickId(url) {
    for (const k of REWARD_CLICK_ID_PARAMS) {
        const v = url.searchParams.get(k);
        if (v) return String(v).slice(0, 120);
    }
    return '';
}

function pickClickIdFrom(obj) {
    for (const k of REWARD_CLICK_ID_PARAMS) {
        if (obj && obj[k]) return String(obj[k]).slice(0, 120);
    }
    return '';
}

// PARK A CLICK, ONCE.
//
// The row is the proof that a specific provider click exists, and it is
// created ONLY after the provider has confirmed that click. One row per click
// id, so the same click cannot be spent twice - by a replayed callback, by a
// second visitor, or by the same visitor pressing the button again.
//
// The row is written before the visitor is sent back, and spent (deleted)
// only after the completion has been recorded, so a provider that is briefly
// unreachable costs the visitor nothing.
//
// There is also an INDEX, keyed by reward and step, holding the most recent
// verified click for that step. It exists for the providers whose documented
// mechanism is a SERVER-TO-SERVER postback (LootLabs): the provider calls us
// with the click id, and the visitor's browser never sees that click id, so
// there is nothing for the page to submit. The index is how the visitor's own
// next poll finds the click that the provider left for them.
//
// A newer click replaces the index entry, because watching the ad twice is
// normal and the second attempt is the one that should count.
const RCLKI_PREFIX = 'sh_rclki_';

function clickIndexKey(rid, idx) { return RCLKI_PREFIX + rid + '_' + idx; }

async function parkClick(env, clickId, rec) {
    if (!env.LOADERS_KV || !clickId) return { ok: false, reason: 'no-click-id' };
    const key = RCLICK_PREFIX + clickId;
    try {
        const existing = await env.LOADERS_KV.get(key);
        if (existing) return { ok: false, reason: 'click-replayed' };
        await env.LOADERS_KV.put(key, JSON.stringify(rec), { expirationTtl: 7200 });
        // The index is a pointer, not the proof. It points at the click row.
        await env.LOADERS_KV.put(clickIndexKey(rec.r, rec.i),
            JSON.stringify({ clickId: clickId, ip: rec.ip || '', at: rec.at || Date.now() }),
            { expirationTtl: 7200 });
    } catch (e) {
        // A KV failure must not turn into a pass. If the click cannot be
        // parked it cannot be spent, so the completion cannot happen.
        return { ok: false, reason: 'park-failed' };
    }
    return { ok: true };
}

async function readParkedClick(env, clickId) {
    if (!env.LOADERS_KV || !clickId) return null;
    try {
        const raw = await env.LOADERS_KV.get(RCLICK_PREFIX + clickId);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

// The click the provider most recently left for THIS step, if any.
async function readIndexedClick(env, rid, idx) {
    if (!env.LOADERS_KV) return null;
    try {
        const raw = await env.LOADERS_KV.get(clickIndexKey(rid, idx));
        if (!raw) return null;
        const ptr = JSON.parse(raw);
        if (!ptr || !ptr.clickId) return null;
        const row = await readParkedClick(env, ptr.clickId);
        if (!row) return null;
        if (row.spent) return null;
        row.indexedIp = ptr.ip || '';
        return row;
    } catch (e) { return null; }
}

async function spendParkedClick(env, clickId) {
    if (!env.LOADERS_KV || !clickId) return;
    // THE ROW IS NOT DELETED, IT IS SPENT.
    //
    // It used to be deleted, and that reopened the replay: once the row was
    // gone, the same click id could be parked again by hitting the postback
    // url a second time, and the second visit to the same checkpoint would
    // find a fresh "verified" row. The row now says spent, and parking a
    // click that has a row - parked OR spent - is refused.
    try {
        const raw = await env.LOADERS_KV.get(RCLICK_PREFIX + clickId);
        if (raw) {
            const row = JSON.parse(raw);
            row.spent = true;
            row.spentAt = Date.now();
            await env.LOADERS_KV.put(RCLICK_PREFIX + clickId, JSON.stringify(row), { expirationTtl: 7200 });
        }
    } catch (e) { /* expires anyway */ }
}

// THE PROVIDER LEFT A CLICK FOR THIS STEP, AND IT WAS MADE FROM THIS
// NETWORK. COUNT IT.
//
// This is the other half of the server-to-server postback. LootLabs' own
// documentation describes a GET to the publisher's postback url carrying
// click_id, ip and unique_id - the provider calls the server, the browser
// never sees the click id, and the visitor's page has nothing to submit.
//
// So the worker's poll looks for a verified click the provider left for the
// step that is open, and counts it when the click was made from the same
// network the visitor is now on. The IP is the binding: the click happened
// where the visitor is.
//
// Without the IP there is no binding, and nothing is counted - a click that
// cannot be tied to a machine cannot be tied to a visitor.
async function completeStepFromProviderClick(env, rid, ip, ses) {
    if (!ses || !ip) return false;
    const i = Number(ses.stepIndex);
    if (!Number.isInteger(i) || i < 0) return false;
    if ((ses.done || []).indexOf(i) !== -1) return false;
    const pj = await readIndexedClick(env, rid, i);
    if (!pj || !pj.verified) return false;
    if (pj.r !== rid || pj.i !== i) return false;
    const clickIp = pj.ip || pj.indexedIp || '';
    if (!clickIp || clickIp !== ip) return false;

    let recorded = false;
    let clickId = '';
    await withSesLock(env, rid, ses.sid, async function () {
        const cur = await loadSes(env, rid, ses.sid);
        if (!cur) return;
        if ((cur.done || []).indexOf(i) === -1) {
            cur.done = (cur.done || []).concat([i]);
            cur.stepIndex = -1;
            cur.stepAt = 0;
            await saveSes(env, cur);
        }
        const back = await loadSes(env, rid, ses.sid);
        recorded = !!(back && (back.done || []).indexOf(i) !== -1);
    });
    if (recorded) {
        const idx = await readIndexedClick(env, rid, i);
        clickId = (idx && idx.clickId) || '';
        await spendParkedClick(env, clickId);
    }
    return recorded;
}

// Which query parameters the provider actually sent, NAMES ONLY. A checkpoint
// that arrives with no click id is otherwise a mystery - the owner cannot see
// what the provider's redirect contained. Values are never echoed, because a
// value here is a token and this page gets pasted into support threads.
function heardParams(url) {
    const names = [];
    for (const k of url.searchParams.keys()) {
        if (k === 'r' || k === 'i' || k === 'site' || k === 't') continue;
        const clean = String(k).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
        if (clean && names.indexOf(clean) === -1) names.push(clean);
        if (names.length >= 12) break;
    }
    return names.length ? ' (received: ' + names.join(', ') + ')' : ' (received: no parameters)';
}

// The page the provider sends the visitor back to. It is a real HTML document
// rather than a bare 200 so that a person staring at a failed checkpoint is
// told what happened instead of seeing a blank tab.
//
// The failure reason is echoed because it is diagnostic for the VISITOR's owner
// too, but it never contains the API token or the short URL - a callback URL
// gets shared around in support channels.
// The Special-Key payload cipher, mirrored from sh-crypto.js so the worker can
// produce a body the loader's DEC() can actually open.
//
// WHY IT IS HERE NOW
//
// SHK means "ciphertext follows". The bootstrap reads it as
//
//     local K = getgenv().ScripterHubKey     -- the LICENSE key
//     src = DEC(K)
//
// but the worker was serving the PLAIN artifact there. So every keyed script
// decrypted plaintext with a key that was never applied to it, failed the SHOK
// magic, and died with:
//
//     Wrong Special Key, or the delivery was tampered with.
//
// which reads like a supply-chain attack and is really a mismatch between what
// SHK promises and what it carried. The owner hit it the moment he generated a
// license from the Users tab and ran the script.
//
// The cipher is symmetric - the same routine encrypts and decrypts - so the
// worker encrypts the artifact with the SESSION'S LICENSE KEY, and the visitor
// decrypts it with the key they already typed. That is also the only version
// of this contract that can work: the key has to be one both sides hold.
//
// XOR-keystream with a djb2 seed, exactly as sh-crypto.js and the Lua DEC.
// Every operation is a 32-bit unsigned value held in a double, so JS and Lua
// agree bit for bit.
function shSeed(key, idx) {
    const bytes = new TextEncoder().encode(key);
    let h = (5381 + idx * 7) >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h = (h * 33 + bytes[i]) % 4294967296;
    }
    return h >>> 0;
}
function xs128Next(s) {
    let x = s[0] >>> 0;
    x = (x ^ ((x * 8192) % 4294967296)) >>> 0;
    x = (x ^ Math.floor(x / 131072)) >>> 0;
    x = (x ^ ((x * 32) % 4294967296)) >>> 0;
    s[0] = s[1]; s[1] = s[2]; s[2] = s[3]; s[3] = x;
    return x >>> 0;
}
function shEncryptForLoader(text, key) {
    const st = [shSeed(key, 0), shSeed(key, 1), shSeed(key, 2), shSeed(key, 3)];
    if (st[0] === 0) st[0] = 1;
    if (st[1] === 0) st[1] = 2;
    if (st[2] === 0) st[2] = 3;
    if (st[3] === 0) st[3] = 4;
    const bytes = new TextEncoder().encode('SHOK' + text);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ (xs128Next(st) & 0xFF);
    }
    let bin = '';
    for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    return btoa(bin);
}

function rewardCallbackPage(origin, verdict, reason, until, remaining) {
    const ok = verdict === 'ok';
    // "UNVERIFIED YET" IS ITS OWN OUTCOME, AND IT IS NOT AN ACCUSATION.
    //
    // This page used to have two states: passed, or failed-and-you-are-banned.
    // The provider not having reported back yet was rendered as the second one,
    // with the words "This checkpoint was not accepted" and a strike against
    // the visitor.
    //
    // The single most common honest situation - a real provider postback that
    // has not landed yet - was therefore indistinguishable from cheating, and
    // it cost the visitor a lockout. The middle state says what is actually
    // true: nothing is wrong, the check simply has not completed, and here is
    // what to do about it.
    const pending = verdict === 'unverified';
    // A THIRD STATE, AND IT IS THE OWNER'S PROBLEM TO FIX.
    //
    // "Unverifiable" means the provider did not report a click at all, so
    // there is nothing to verify. The visitor did nothing wrong and cannot
    // do anything about it either - the checkpoint as configured cannot be
    // completed by anybody. The page has to say that, because the alternative
    // is the visitor bouncing between the provider and this site forever.
    const unverifiable = verdict === 'unverifiable';
    const left = until ? fmtMins(until - Date.now()) : '';
    const title = ok
        ? (remaining > 0 ? ('Checkpoint done - ' + remaining + ' to go') : 'All checkpoints complete')
        : (pending ? 'Not verified yet' : (unverifiable ? 'This checkpoint cannot be verified' : 'Checkpoint could not be verified'));
    const body = ok
        ? '<p class="s">Verified. You can close this tab and return to the reward page.</p>'
        : (pending
            ? '<p class="s">Nothing is wrong - this just has not been confirmed yet, and you have NOT been penalised.</p>'
            // The reason is shown here too. It is the worker's own verdict, not
            // an accusation, and it is the difference between "too fast, wait"
            // and "the provider never called back" - which the visitor can
            // actually act on.
            + '<p class="r">' + String(reason || 'not-confirmed').replace(/[<>&]/g, '') + '</p>'
            + '<p class="s">The provider reports a completed visit a few seconds after the ad closes. Go back, give it a moment, and press Verify again. You can do that as many times as you need, on any device.</p>'
            + '<p class="s">If you are running an ad blocker or a privacy extension, it can stop the provider from reporting back at all. Turning it off for this site is usually all it takes.</p>'
            : (unverifiable
                ? '<p class="s">The provider did not report a click for this visit, so there is nothing that can be verified. '
                + 'This is a configuration problem on the reward, not something you did.</p>'
                + '<p class="r">' + String(reason || 'no-click-id').replace(/[<>&]/g, '') + '</p>'
                + '<p class="s">The owner needs to set this checkpoint up so the provider sends a click id back to the reward page. '
                + 'Until then this checkpoint cannot be completed by anybody, and you have NOT been penalised.</p>'
                : '<p class="s">This checkpoint was not accepted.</p>'
                + '<p class="r">' + String(reason || 'unknown').replace(/[<>&]/g, '') + '</p>'
                + (left ? '<p class="s">If this was an attempt to bypass, your browser is paused for ' + left + '.</p>' : '')
                + '<p class="s">Ad blockers and privacy extensions can stop the provider from reporting back. Retrying will not help if one is active.</p>'));
    return new Response(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
        + '<meta name="robots" content="noindex,nofollow">'
        + '<title>' + title + '</title><style>'
        + '*{margin:0;padding:0;box-sizing:border-box}'
        + 'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0a0a0f;color:#fff;'
        + 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}'
        + '.c{background:rgba(20,20,35,.85);border:1px solid rgba(255,255,255,.08);border-radius:18px;'
        + 'padding:34px;max-width:440px;width:100%;text-align:center}'
        + '.i{font-size:52px;line-height:1}'
        + 'h1{font-size:19px;margin:12px 0 8px}'
        + '.s{color:#8888aa;font-size:13px;line-height:1.6;margin-top:10px}'
        + '.r{color:#ff6b6b;font-family:ui-monospace,monospace;font-size:12px;margin-top:12px;word-break:break-all}'
        + '</style></head><body><div class="c">'
        + '<div class="i">' + (ok ? '✅' : (pending ? '⏳' : '⚠️')) + '</div>'
        + '<h1>' + title + '</h1>' + body
        + '</div></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
}

function fmtMins(ms) {
    const m = Math.max(1, Math.ceil(ms / 60000));
    if (m >= 60) return (Math.round(m / 6) / 10) + ' hours';
    return m + ' minutes';
}

function rewardNextStep(r, ses, now) {
    const cps = r.checkpoints || [];
    const done = (ses && ses.done) || [];
    for (let i = 0; i < cps.length; i++) {
        if (done.indexOf(i) !== -1) continue;
        if (ses && ses.stepIndex === i && ses.stepAt && now - ses.stepAt > REWARD_STEP_TTL_MS) {
            return { index: i, expired: true };
        }
        return { index: i, expired: false };
    }
    return { index: -1, expired: false };
}


// ---------------------------------------------------------------------------
// Grant tokens: a small capability that says "a chain was legitimately opened
// for THIS script and THIS session" without being the session itself.
//
// Why this is not just the sid: the sid is a bearer that the gate already
// spent. Handing the raw sid to the part route would let a part request
// re-present it, and the route would have no way to tell an authorised
// mid-chain fetch from a replay of the mint. A separate, short, HMAC-bound
// value keeps the two concerns separate: `sid` is the session (server state),
// `grant` is the capability to walk the cursor (stateless, expiring).
//
// The HMAC key is the worker's session secret, so a grant is unforgeable
// without a server-only value — the same property that makes the owner and
// user session tokens trustworthy.
// ---------------------------------------------------------------------------

function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
    let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function hmacHex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// grant = base64url({sid, scriptId, exp}) + "." + hmac
async function signGrant(secret, sid, scriptId, expiresAt) {
    const body = { s: sid, i: scriptId, e: expiresAt };
    const payload = b64u(new TextEncoder().encode(JSON.stringify(body)));
    const sig = (await hmacHex(secret, payload)).slice(0, 32);
    return payload + '.' + sig;
}

// Returns { ok, sid, scriptId, exp } or { ok: false, reason }.
//
// The signature covers the payload, so every field inside it is authenticated:
// a caller cannot rewrite the sid, retarget the script, or extend the expiry,
// because any change alters the bytes the HMAC was computed over.
async function verifyGrant(secret, token, now) {
    const t = String(token || '');
    const dot = t.lastIndexOf('.');
    if (dot <= 0) return { ok: false, reason: 'malformed' };
    const payload = t.slice(0, dot);
    const sig = t.slice(dot + 1);
    const want = (await hmacHex(secret, payload)).slice(0, 32);
    // length-independent compare; both are fixed 32-hex
    if (sig.length !== want.length) return { ok: false, reason: 'bad-signature' };
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return { ok: false, reason: 'bad-signature' };
    let body;
    try { body = JSON.parse(new TextDecoder().decode(unb64u(payload))); } catch (e) {
        return { ok: false, reason: 'malformed' };
    }
    if (!body || typeof body.s !== 'string' || typeof body.i !== 'string' || !Number(body.e)) {
        return { ok: false, reason: 'malformed' };
    }
    if (!(Number(body.e) > (now || Date.now()))) return { ok: false, reason: 'expired' };
    return { ok: true, sid: body.s, scriptId: body.i, exp: Number(body.e) };
}

// ---------------------------------------------------------------------------
// classifyAuthorization
//
// The PRE-delivery decision: may this caller open a session at all?
//
// Split from `deliver()` on purpose, because these are two different questions
// asked at two different times, and conflating them is how a ban ends up being
// enforced at mint time but not at delivery time:
//
//   may I open a session?   -> classifyAuthorization, here
//   may I have the bytes?   -> authorize(), which re-checks live state
//
// The re-check at delivery is not redundant. A session that was valid when it
// was minted says nothing about whether it is valid 30 seconds later, and the
// whole point of the audit's G06 finding was that the old code trusted the
// token and never looked at the license again.
// ---------------------------------------------------------------------------
function classifyAuthorization(o) {
    if (o.noState) return DENY.NO_STATE;
    if (!o.scriptExists) return DENY.NO_SCRIPT;
    if (o.killswitch || o.scriptKilled) return DENY.KILLED;

    // Server-side visibility (migrations/0001_init.sql, scripts.visibility).
    // This used to exist only as a localStorage flag in the browser, so
    // "private" meant "hidden in the UI" while /sh/<id> still served anyone
    // who asked. That is gate G10.
    if (o.visibility === 'private' && !o.isOwner) return DENY.HIDDEN;
    if (o.visibility === 'account' && !o.userId) return DENY.HIDDEN;

    if (o.authRequired) {
        if (!o.key) return DENY.NEEDS_KEY;
        // re-uses the worker's classifyLicense contract: { code }
        const v = o.classify(o.key, o.hwid, o.now, o.scriptProjectId);
        if (v.code === 'banned') return DENY.BANNED;
        if (v.code === 'expired') return DENY.EXPIRED;
        if (v.code === 'hwid') return DENY.HWID;
        // Its OWN code, not NEEDS_KEY.
        //
        // Reporting "invalid" for a key that exists and is simply bound
        // elsewhere sends the owner looking for a typo in a key that is
        // perfectly fine. The visitor gets a different message for a different
        // problem, and the owner gets one that names the cause.
        if (v.code === 'project') return DENY.PROJECT;
        if (v.code !== 'ok') return DENY.NEEDS_KEY;
    }
    return null;   // null == authorised
}

// ---------------------------------------------------------------------------
// The delivery decision result, in one place.
//
// `deliver()` is the ONLY function in the codebase permitted to return
// artifact bytes. Everything else refuses. That is what makes gate G01
// ("no artifact without a credential") a structural property rather than a
// promise: there is exactly one exit, and it is behind two atomic statements.
// ---------------------------------------------------------------------------
async function deliver(state, o) {
    // A delivery MUST NOT be attempted without a live state layer. This is the
    // one place that fails closed rather than degrading, and it is deliberate:
    //
    // The obvious alternative is "if D1 is missing, fall back to the KV check",
    // which is what the Phase 2 notes called for so the code could ship before
    // the database existed. Shipping is no longer a constraint — the database
    // is created in step 2 of the wrangler.toml checklist — and a KV fallback
    // here would silently restore every hole Phase 3 exists to close, with no
    // error anywhere. An operator gets a loud 503 and a log line instead.
    if (!state) return { ok: false, reason: DENY.NO_STATE };

    const now = o.now || Date.now();

    // GATE 1 — the nonce. DELETE ... RETURNING is atomic, so if two requests
    // race with the same nonce exactly one receives the row. A caller that
    // gets nothing must refuse; there is no "probably fine" branch here.
    const n = await state.consumeNonce(o.nonce, now);
    if (!n.ok) return { ok: false, reason: DENY.BAD_NONCE };
    if (n.sessionId !== o.sid) return { ok: false, reason: DENY.BAD_NONCE };
    if (n.scriptId !== o.scriptId) return { ok: false, reason: DENY.BAD_NONCE };

    // GATE 2 — the session. One UPDATE, every precondition in the WHERE
    // clause, including the live license and account re-check as subqueries.
    // changes()===1 is the only success.
    //
    // This is the statement that closes G05 (expired), G06 (banned), G07
    // (replay) and G08 (stale) at the same time, and it is also the one that
    // makes a ban effective on the very next attempt with no window.
    const s = await state.consumeSession(o.sid, now);
    if (!s.ok) return { ok: false, reason: DENY.NO_SESSION };

    return { ok: true, sid: o.sid, nonce: o.nonce, at: now };
}

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------

// Open a forward-only chain on a session that has ALREADY been consumed by
// deliver(). The consumed_at check is what stops this being used to obtain
// bytes without spending a session: the chain is a continuation of a delivery,
// never an alternative to one.
async function openChain(state, sid, total, expiresAt, now) {
    const r = await run(state._db,
        `UPDATE sessions SET parts_total = ?, parts_served = 0, grant_expires_at = ?
          WHERE sid = ? AND consumed_at IS NOT NULL AND revoked = 0
            AND grant_expires_at IS NULL`,
        total, expiresAt, sid);
    return changesOf(r) === 1;
}

// One step of the chain. See the schema comment in 0001_init.sql for why
// `parts_served = ?` must equal the requested index.
async function advancePart(state, sid, index, total, now) {
    now = now || Date.now();
    const row = await one(state._db,
        `UPDATE sessions SET parts_served = parts_served + 1
          WHERE sid = ? AND parts_served = ? AND parts_total = ?
            AND consumed_at IS NOT NULL AND revoked = 0
            AND grant_expires_at IS NOT NULL AND grant_expires_at > ?
       RETURNING parts_served`,
        sid, index, total, now);
    return { ok: !!row, next: row ? Number(row.parts_served) : -1 };
}

// Read the chain cursor without advancing it. Diagnostics only — never gate a
// delivery on this, exactly like peekSession().
async function peekChain(state, sid) {
    return one(state._db,
        'SELECT parts_total, parts_served, grant_expires_at, consumed_at FROM sessions WHERE sid = ?',
        sid);
}

// Aliases this file used to receive as imports. `run` is the query
// function defined in the atomic state layer above; `d1run` is the name
// the routing below uses for it, kept so those call sites read the same.
const d1run = run;


// ===========================================================================
// THE SPLIT-KEY HANDOFF — a contract with the obfuscator
// ===========================================================================
//
// The baked chunk inside an obfuscated file used to fetch its own split key
// from /sh/k over HTTP. That was a SECOND, weaker, replayable round trip
// performed after the gate had already paid for one, and it is the reason the
// /sh/k compatibility window exists at all.
//
// Now the bootstrap injects the key line into this genv slot and the baked
// chunk prefers it, falling back to HTTP only when the global is absent (an
// older bootstrap, or a file published before Phase 3).
//
// The name is duplicated in custom-obfuscator.js as SPLITKEY_GENV. That is
// deliberate duplication rather than a shared import: the obfuscator runs in
// the BROWSER (via main.js) and the worker runs on Cloudflare's edge, so they
// are two separately-bundled programs with no module graph in common. The
// alternative — a generated file — is a build step nobody would remember to
// run. So it is a name in two places, and tools/splitkey_handoff_test.mjs
// asserts the two agree, which is better than a comment asking people to be
// careful.
const SPLITKEY_GENV = '__SH_SPLITKEY';

// CORS, and why X-SH-Token is in Allow-Headers.
//
// This line was `'Content-Type'` alone, and the dashboard sends X-SH-Token on
// every owner call. That combination makes the browser's PREFLIGHT fail, so the
// request is blocked before it leaves the page:
//
//     Access to fetch at 'https://<worker>/sh/health' from origin
//     'https://<site>' has been blocked by CORS policy: Request header field
//     x-sh-token is not allowed by Access-Control-Allow-Headers in preflight
//     response.
//
// The symptom from inside the app is `TypeError: Failed to fetch` - which is NOT a
// 401, NOT a wrong password, and NOT an auth problem. Nothing reached the worker,
// so the worker could not answer, and the client turned a network failure into
// "Owner sign-in required".
//
// That is what actually broke owner actions from the browser, and it was invisible
// to every server-side test: the routes were correct, the tokens were correct, and
// a direct curl of the same URL returned 200. Only a browser enforces preflight.
//
// The header must be listed here or the browser deletes the request. There is no
// way to work around it from the client other than not sending the header.
//
// X-SH-Ticket is here for the same reason and is just as load-bearing. The
// browser presents it to the host when compiling directly, and a preflight that
// does not allow it means every single host compile is blocked before it is
// sent - which would look exactly like the host being down.
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // Accept is sent by the download fetch.
    'Access-Control-Allow-Headers': 'Content-Type, X-SH-Token, X-SH-User-Token, X-SH-Ticket, Accept',
    // Lets the diagnostics panel and the owner panel read the status off a
    // cross-origin response. Without it the status is invisible in the browser,
    // which is the other half of why this took so long to find.
    // Content-Disposition and X-Download-Expires are how the dashboard learns
    // what the file is called and how long its link lives. Without exposing
    // them a cross-origin response hides them, and every download lands as
    // "script.lua" with no expiry shown.
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, X-SH-Token, Content-Disposition, X-Download-Expires',
    'Content-Type': 'application/json'
};

// sliding window of execution events (kept 10 minutes in memory)
const WINDOW_MS = 10 * 60 * 1000;

// persistent-ish state on globalThis (survives between requests in the same isolate)
const S = globalThis.__shStats || (globalThis.__shStats = {
    events: [],        // { t, executor, scriptId }
    totalExecutions: 0,
    threatsBlocked: 0,
    totalVisitors: 0,
    perScript: {},     // scriptId -> count
    startedAt: Date.now()
});

// ---- stats persistence (counters survive worker deploys/restarts) ----
// In-memory counters used to reset on every deploy, so the dashboard
// chart read 0 forever. Counters are now loaded from KV once per isolate
// and saved back (throttled) after each execution.
let shStatsLoaded = false;
async function loadStatsOnce(env) {
    if (shStatsLoaded || !env.LOADERS_KV) return;
    shStatsLoaded = true;
    try {
        const raw = await env.LOADERS_KV.get('sh_stats_counters');
        if (raw) {
            const c = JSON.parse(raw);
            if (typeof c.totalExecutions === 'number' && c.totalExecutions > S.totalExecutions) S.totalExecutions = c.totalExecutions;
            if (typeof c.threatsBlocked === 'number' && c.threatsBlocked > S.threatsBlocked) S.threatsBlocked = c.threatsBlocked;
            if (typeof c.totalVisitors === 'number' && c.totalVisitors > S.totalVisitors) S.totalVisitors = c.totalVisitors;
            if (typeof c.perScript === 'object' && c.perScript) {
                for (const k in c.perScript) {
                    S.perScript[k] = Math.max(S.perScript[k] || 0, c.perScript[k]);
                }
            }
        }
    } catch (e) { /* counters stay in-memory */ }
}
let shStatsSaveAt = 0;
function saveStatsSoon(env) {
    const now = Date.now();
    if (!env.LOADERS_KV || now - shStatsSaveAt < 30000) return;
    shStatsSaveAt = now;
    env.LOADERS_KV.put('sh_stats_counters', JSON.stringify({
        totalExecutions: S.totalExecutions,
        threatsBlocked: S.threatsBlocked,
        totalVisitors: S.totalVisitors,
        perScript: S.perScript,
        updatedAt: now
    })).catch(function() {});
}

// ============ HIDDEN LOADER HOST CONFIG ============
// The owner access code. The built-in default is "ScripterHub" — it works
// out of the box with zero setup. Optionally you can set an EXTRA code
// via /sh/setcode (any length, emojis OK); it lives in KV and login
// accepts EITHER code. Only SHA-256 hashes are compared; the codes
// themselves are never stored anywhere.
//
// REMOVED (Phase 1): const DEFAULT_CODE = 'ScripterHub';
// The default owner code was the product name and appeared in the page title,
// so it was never a secret. See getCodeHashes() for the replacement: a
// generated 192-bit code, stored only as a hash, minted once on first use.
const CODE_KV_KEY = 'sh_access_code';     // stores { hash } after setup
const CODE_SET_KEY = 'sh_code_set_at';    // stores setup timestamp
// ---- PER-SCRIPT SPECIAL KEYS (client-side encryption) ----
// Each script is encrypted IN THE OWNER'S BROWSER with their Special Key
// before upload (sh-crypto.js: FNV-1a seeded xorshift128 stream cipher).
// The worker stores ONLY ciphertext + a SHA-256 hash of the key (so the
// browser key page can verify without the server seeing anything). The
// loadstring contains NO key. At runtime a bootstrap asks for the key
// and decrypts locally. The key hash lets the key page give a "wrong
// key" message instead of showing garbage.
const KV_PREFIX = 'sh_loader_';        // sh_loader_<10 digits> -> executor blob (keyless: plain obf code; keyed: cipher)
const KV_META_PREFIX = 'sh_meta_';     // sh_meta_<10 digits>   -> { name, user, at, keyHash, keyless, webKey }
const KV_WEB_PREFIX = 'sh_web_';       // sh_web_<10 digits>    -> keyless browser view (Special-Key encrypted)
const KV_SKEY_PREFIX = 'sh_skey_';     // sh_skey_<10 digits>   -> split-key record (padded last-layer key)
// ---- REAL SERVER-SIDE LICENSES (Luarmor model, Tier 2) ----
// /sh/upload accepts authRequired: true. Such scripts NEVER serve their
// blob or split key to anyone without a valid LICENSE key + HWID auth.
// KV layout:
//   sh_licenses          -> { "KEYSTRING": { hwid, expiresAt, banned,
//                                banReason, discordId, note, hwidResets,
//                                executions, lastAuthAt, lastIp } }
//   sh_killswitch        -> { on: true }  (flip once, every auth fails)
// Auth flow (executor):
//   GET /sh/auth/<loaderId>?k=<license>&h=<hwid>&t=<t0>
//     -> "SHA <token> <expires> <t0>"  (token = HMAC of key+hwid+t0)
//   GET /sh/k/<id>?t=<t0>&a=<token>   (split key, now token-gated for
//      auth-required scripts; t0 must match the one baked into the file)
// The token lives ~90 seconds (short-lived), is bound to key+hwid, and
// is verified with a constant-time compare before any key bytes move.
const KV_LICENSES_KEY = 'sh_licenses';
const KV_KILLSWITCH_KEY = 'sh_killswitch';
const AUTH_TOKEN_TTL_MS = 90 * 1000;        // 90-second short-lived auth token
const HWID_RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 HWID reset per day
const LOADER_TTL = 60 * 60 * 24 * 365; // scripts live 1 year (then auto-delete)
const TOKEN_TTL = 12 * 60 * 60 * 1000; // login session: 12 hours
// ---- CROSS-DEVICE USER SYNC (KV-backed user database) ----
//
// WHY ONE KEY PER USER, NOT ONE BLOB FOR EVERYONE
//
// Every user record used to live inside a single KV entry, sh_users_db. That
// shape has three failures, and all three bit this deployment for real:
//
//   1. THE READ CEILING. Workers KV get() returns null (rather than throwing)
//      once a value passes roughly 1MB. loadUsersMap() could not tell that
//      apart from "there are no users", so it returned {}. Every login then
//      answered 401 "Invalid email/username or password." for EVERY account
//      including ones with a provably correct password, and every signup
//      "succeeded" because the duplicate check was looking at an empty table.
//      The data was intact the entire time; the read was failing and the
//      catch block was hiding it.
//
//   2. LOST WRITES. Signup is a read-modify-write of the whole table. Two
//      signups inside the ~60s KV read cache both read the same snapshot and
//      the second put erased the first. This is the "Refresh from Cloud shows
//      16 not 17" report.
//
//   3. NO SCALING. Avatars are base64 and ride along in the record, so the
//      table grows toward the ceiling with normal use.
//
// One key per record fixes all three: a login reads one small value instead of
// the whole table, and a signup writes one key, so two concurrent signups
// cannot collide.
//
// The 13 call sites keep their existing shape - loadUsersMap() still returns a
// whole map and saveUsersMap() still takes one - because both are now
// implemented on top of per-user keys. That is deliberate: it keeps the diff to
// this one module instead of touching every route that reads users.
const USERS_KV_KEY = 'sh_users_db';    // LEGACY single-entry table. Read-only now, kept so an
                                        // un-migrated deployment still finds its accounts.
const USER_PREFIX = 'sh_user_';        // sh_user_<lowercased email> -> one user record
const UNAME_PREFIX = 'sh_uname_';      // sh_uname_<lowercased username> -> the email that owns it
const USERS_LIST_MAX = 1000;           // KV list() caps a page at 1000 keys.

// The key a user record lives under. Emails are case-insensitive in practice
// and the old blob was keyed by exactly what the client typed, so both sides
// are lowercased here and the login path looks up the same way. Without this,
// "User@x.com" and "user@x.com" became two accounts with two passwords.
function userKvKey(email) {
    return USER_PREFIX + d1UserId(email);
}
function unameKvKey(username) {
    return UNAME_PREFIX + String(username || '').trim().toLowerCase().slice(0, MAX_USERNAME_LEN + 4);
}

// Read ONE account. This is the path login uses, and it is the reason the
// 1MB ceiling above can never lock anybody out again: the largest thing it can
// read is a single record.
//
// The legacy blob is consulted ONLY when the per-user key is absent, which is
// the state of a deployment that predates this change. The first successful
// login promotes the record and every later read is a single key.
// OWNER FIX: a record may name its owner with `id` instead of `email`.
//
// The symptom was the owner being unable to change a plan: a signed-in owner,
// holding a valid token, got 401 from /sh/users and the dashboard said "sign in
// as the owner account on THIS tab". The token was never the problem.
//
// verifyUserToken() returned the record fine, and the gate then compared
// `u.email` against OWNER_EMAIL. A record stored with `id` and no `email` has
// no such field, so the comparison was "" === "dubovikstanislav51@gmail.com",
// i.e. false, and a legitimately signed-in owner was refused.
//
// This is the pre-migration shape, and /sh/kv-repair exists precisely because it
// is in the wild. It was invisible because the same wrong assumption is repeated
// at three sites (the gate, plus the two role derivations), so patching any one
// of them would have left the owner half-recognised elsewhere.
//
// Normalised HERE instead, at the single point every caller reads through:
// loadUserRecord is what verifyUserToken returns, so one fix covers all three
// comparisons, and any future caller. `email` is filled from `id` when missing;
// an existing `email` is never overwritten, so this cannot re-point a record
// that already resolves correctly.
//
// This grants nothing. The identity is still proven by the token signature and
// the password/fingerprint re-check in verifyUserToken, and this only stops the
// record's own field name from hiding an identity that was already proven.
function normalizeUserIdentity(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    if (rec.email) return rec;
    const id = String(rec.id || '').trim();
    if (!id) return rec;
    return { ...rec, email: id };
}

async function loadUserRecord(env, emailOrUsername) {
    if (!env.LOADERS_KV) return null;
    const want = String(emailOrUsername || '').trim();
    if (!want) return null;
    try {
        const byEmail = await env.LOADERS_KV.get(userKvKey(want));
        if (byEmail) return normalizeUserIdentity(JSON.parse(byEmail));
        // Username sign-in. The index maps a lowercased username to its email.
        const un = await env.LOADERS_KV.get(unameKvKey(want));
        if (un) {
            const viaName = await env.LOADERS_KV.get(userKvKey(un));
            if (viaName) return normalizeUserIdentity(JSON.parse(viaName));
        }
    } catch (e) {
        console.error('[ScripterHub] loadUserRecord failed: ' + (e && e.message));
        return null;
    }
    // LEGACY FALLBACK: still the whole table, still one big read. This is the
    // pre-migration shape and it is what makes the rollout safe - a deployment
    // that has never written a per-user key keeps working, and the first
    // successful login moves the account across.
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        if (raw) {
            const m = JSON.parse(raw) || {};
            const hit = m[want] || m[want.toLowerCase()] || null;
            if (hit) return normalizeUserIdentity(hit);
        }
    } catch (e) {
        console.error('[ScripterHub] legacy users blob unreadable: ' + (e && e.message));
    }
    return null;
}

// Write ONE account and keep the username index in step.
//
// The index is what makes username sign-in a single get instead of a scan of
// every user. It is written on every save, and it is derived data - losing it
// costs username login, never an account.
async function putUserRecord(env, rec) {
    const email = d1UserId(rec && (rec.email || rec.id));
    if (!email) return;
    const key = userKvKey(email);
    const stored = JSON.stringify(storageSafeUser({ ...rec, email }));
    await env.LOADERS_KV.put(key, stored);
    const un = String((rec && rec.username) || '').trim();
    if (un) {
        try { await env.LOADERS_KV.put(unameKvKey(un), email); } catch (e) { /* derived */ }
    }
}
const OWNER_EMAIL = 'dubovikstanislav51@gmail.com'; // the owner (Scripter) account - used for ownerProof auth
// ---- SIGNUP ABUSE GUARDS (the KV got flooded with 1200+ junk bot
// accounts, which burned the ENTIRE daily KV write quota and broke every
// signup/login for real users) ----
const VALID_PLANS = ['Basic', 'Premium', 'Advanced', 'Pro', 'God', 'Ultimate', 'Enterprise', 'Custom'];
// MUST stay in sync with PLAN_CONFIGS in main.js. An unknown plan is coerced
// to Basic by sanitizeUserRecord, so a name missing here silently downgrades
// that user the next time their client creates or migrates a record. // anything else = junk -> Basic
const MAX_USERNAME_LEN = 20;    // usernames were 60+ chars of keyboard mash
const MAX_EMAIL_LEN = 100;
const MAX_DESC_LEN = 500;       // description/plan fields were weaponized to store 15KB of junk
const SIGNUP_FLOOD_LIMIT = 10;  // >10 signups/minute from one IP = bot flood
const SIGNUP_FLOOD_WINDOW_MS = 60 * 1000;
// executor User-Agents -> get the Lua bootstrap (getgenv key only).
// Everything else -> the HTML key page (decrypts locally in-browser).
const EXECUTOR_UA = /Roblox|RBX|Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta|Solara|Hydrogen|Abracadabra/i;
// max encrypted payload the worker will store. Cloudflare platform caps:
//   - KV values: 25 MB each -> we CHUNK large blobs (20 x 25MB = ~50MB max)
//   - Worker request bodies: ~100 MB (JSON-escaped base64 ~1.37x) so the
//     practical client-side cap is ~70 MB of cipher text
// A single KV put is used for small scripts; chunking kicks in above
// CHUNK_THRESHOLD. Browsers get the key page only (chunks never sent
// whole to browsers); executors receive a bootstrap that fetches the
// chunks and stitches them in memory.
const MAX_CIPHER_LEN = 72_000_000;  // ~70 MB of cipher text (was 4.5 MB)
const KV_MAX_VALUE = 25_000_000;    // Cloudflare KV hard per-value limit
const CHUNK_THRESHOLD = KV_MAX_VALUE - 1000; // chunk when bigger than one safe KV value
const MAX_CHUNKS = 20;              // 20 chunks x 6MB (CHUNK_DELIVERY_MAX) = ~120MB

// ---------------------------------------------------------------------------
// WHICH BACKEND HOLDS A SCRIPT
// ---------------------------------------------------------------------------
//
// KV FIRST, KEEPER ONLY WHEN KV CANNOT HOLD IT.
//
// This inverts what the backend was introduced to do. The Keeper was chosen so
// that script BYTES would not sit on Cloudflare - the reasoning was that a
// private GitHub repo was still "Cloudflare-adjacent hosting". But the choice
// had a consequence nobody weighed: with the Keeper bound, the worker's
// delivery path asked the PC first and the fallback could never be reached,
// because nothing ever wrote the KV copy. Binding SH_STORE_URL therefore made
// EVERY script depend on a PC being awake, and the site went dark whenever the
// owner slept, rebooted or restarted a tunnel.
//
// The KV path was already complete - putBlob chunks, /sh/c/<id>/<i> serves the
// chunks, the chain head points at /sh/c/ - and it was simply never used
// alongside the Keeper.
//
// So: whatever KV can hold goes to KV and works with the PC off. The Keeper is
// reserved for what KV genuinely cannot take, and for owners who want an
// off-Cloudflare copy of those.
//
// THIS IS A REAL TRADEOFF, NOT A FREE WIN. After this change the bytes of a
// script up to this ceiling live in the worker's KV namespace. An owner who
// wants them on their own disk must disable the Keeper binding AND accept the
// size ceiling below.
// R2 bound? One binding decides where an artifact lives.
//
// Absent (a deployment that never created the bucket) every path below
// falls back to KV exactly as before, so this is additive rather than a
// migration: nothing is read back out of anywhere.
function r2Configured(env) {
    return !!(env && env.ARTIFACTS && typeof env.ARTIFACTS.put === 'function');
}

function kvCanHold(len) {
    // CHUNK_DELIVERY_MAX is what putBlob actually splits on, so this is the
    // real ceiling - not KV's 25MB per-value limit, which putBlob never
    // approaches because it chunks far below it.
    return Number(len) <= MAX_CHUNKS * CHUNK_DELIVERY_MAX;
}

// The Keeper is used ONLY for a blob KV cannot take.
function keeperNeededFor(env, len) {
    // With R2 bound the Keeper has no job at all: R2 has no size ceiling the
    // browser cares about, so nothing overflows into it. The owner asked for
    // the Keeper to be out of the loop for scripts entirely.
    if (r2Configured(env)) return false;
    return storeConfigured(env) && !kvCanHold(len);
}

// Artifacts at or below this are returned INLINE by the single delivery gate: one atomic
// consume, one response, nothing left to fetch. That is the strong case and the common
// one.
//
// IT MUST EQUAL CHUNK_THRESHOLD. That is the whole point of writing it this way.
//
// These were two independent numbers - 2 MiB here, ~25 MB there - and the space between
// them was a dead zone. putBlob only starts chunking ABOVE CHUNK_THRESHOLD, so a 3 MB
// script is stored as ONE KV value; delivery only inlines BELOW 2 MiB, so that same 3 MB
// value matched neither the inline path nor the chain path, fell past both, and was
// refused with SHERR gone. The upload reported success. The loader reported the script
// did not exist. Nothing in between was wrong-looking, which is why it survived every
// test in this repo: every one of them published and read back a script small enough to
// stay under the limit.
//
// Real scripts land there constantly - a 3000-line Lua file obfuscates to ~3 MB, which is
// what a user actually publishes. So the boundary is derived, not chosen twice: anything
// that fits in one value can be delivered in one response, and anything larger is chunked
// at upload and arrives as a chain. There is no third case to fall into.
// RETAINED as the no-dead-zone floor: putBlob only starts chunking ABOVE
// CHUNK_THRESHOLD, so delivery must inline at least up to here or a 3 MB
// artifact would match neither path. Delivery now inlines up to
// INLINE_DELIVERY_MAX below, which is SMALLER - see there for why.
const INLINE_DELIVERY_LIMIT = CHUNK_THRESHOLD;

// ---- INLINE DELIVERY IS CAPPED HARDER THAN STORAGE -----------------------
//
// INLINE_DELIVERY_LIMIT used to equal CHUNK_THRESHOLD (~25 MB), on the
// reasoning that anything fitting in one KV value can be delivered in one
// response. Storage reasoning, not delivery reasoning - and it was wrong in a
// way only a large script exposes.
//
// A real script from this site came back at 18,607,247 bytes, delivered as a
// single inline SHL response. That took 13.9 s to fetch from a workstation
// with a fast connection. On an executor it does not survive:
//
//   * Cloudflare returns 524 (timeout) or 502 for a response that large,
//     and the body arrives as an HTML error page;
//   * the bootstrap's envelope check sees HTML and prints exactly:
//
//         [ScripterHub] Unrecognised delivery format.
//
//   * which names neither the size nor the timeout, so it reads as a corrupt
//     script rather than an oversized response.
//
// That is the reported error, reproduced and explained. It is not a corrupted
// artifact and not a bad loadstring - the artifact is fine, the CHANNEL is not.
//
// The chain path already exists and already works for this: SHG returns a
// small header naming a grant, and the bootstrap fetches the parts separately.
// It was simply never reached, because a sub-25 MB artifact took the inline
// path instead.
//
// So the inline cap is now a DELIVERY limit, chosen from what a single HTTP
// response can reliably carry, and deliberately far below the storage limit.
//
// 6 MB, not a round-looking number picked for looks: it keeps a normal inline
// response to a few seconds on a mobile connection while leaving a 5x margin
// under the size that was observed failing. Anything larger chains, and the
// chain path is already tested end-to-end (chunked.test.mjs drives a 26 MB
// keyed artifact through it).
//
// This is deliberately NOT CHUNK_THRESHOLD any more. Making the two equal was
// correct for "never fall between the two paths" and wrong for "never send one
// response too big to arrive" - and only the second one is a user-visible bug.
const INLINE_DELIVERY_MAX = 6_000_000;

// ---- user sync helpers ----
//
// Both functions keep their original signature and return shape, because
// thirteen call sites depend on them and rewriting every route in the same
// change as the storage fix is how a storage fix turns into an outage.
//
// WHAT CHANGED
//
// loadUsersMap() walks the sh_user_ prefix with KV list() instead of reading
// one enormous blob. Each record is a separate small get(), so no single read
// can trip the value ceiling, and one unreadable record no longer hides the
// other seventy.
//
// saveUsersMap() no longer PUTs the whole table. It writes the keys that
// differ and deletes the ones that are gone. A signup therefore touches ONE
// key, so two concurrent signups cannot overwrite each other - the lost update
// behind "Refresh from Cloud shows 16 not 17".
//
// THE LEGACY BLOB IS STILL READ
//
// A deployment that has never written a per-user key keeps working: the read
// path falls back to sh_users_db, and the first write migrates. Nothing is
// deleted on the way, so rolling this out cannot lose an account.
async function loadUsersMap(env) {
    if (!env.LOADERS_KV) return {};
    let map = {};

    // 1. The per-user keys are the store now.
    try {
        let cursor = null;
        let guard = 0;
        do {
            const page = await env.LOADERS_KV.list({ prefix: USER_PREFIX, cursor: cursor || undefined, limit: USERS_LIST_MAX });
            for (const k of (page.keys || [])) {
                let rec = null;
                try {
                    const raw = await env.LOADERS_KV.get(k.name);
                    if (!raw) continue;
                    rec = JSON.parse(raw);
                } catch (e) {
                    // ONE bad record must not cost the other accounts. Log it
                    // and move on - the previous implementation turned exactly
                    // this into a total outage for every user.
                    console.error('[ScripterHub] unreadable user record ' + k.name + ': ' + (e && e.message));
                    continue;
                }
                const email = String((rec && (rec.email || rec.id)) || k.name.slice(USER_PREFIX.length));
                if (email) map[email] = rec;
            }
            cursor = page.list_complete ? null : page.cursor;
            if (++guard > 20) { cursor = null; break; }   // never loop forever
        } while (cursor);
    } catch (e) {
        console.error('[ScripterHub] user list failed: ' + (e && e.message));
    }

    // 2. Legacy blob, merged under the per-user keys so an un-migrated account
    //    is still found. Per-user wins: it is the newer copy.
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        if (raw) {
            const legacy = JSON.parse(raw) || {};
            for (const email of Object.keys(legacy)) {
                if (!map[email] && legacy[email]) map[email] = legacy[email];
            }
        }
    } catch (e) {
        console.error('[ScripterHub] legacy users blob unreadable: ' + (e && e.message));
    }

    // Reconcile into D1 so the gate's live account check has rows to read.
    // Best-effort, but NOT silent: a failure here shows up as account-bound
    // deliveries being refused with no other explanation.
    if (stateFor(env)) {
        try { await syncUsersToD1(env, map); }
        catch (e) { console.error('[ScripterHub] user reconcile to D1 failed: ' + (e && e.message)); }
    }
    return map;
}

// ONE ACCOUNT, NOT THE WHOLE TABLE.
//
// This is the difference between a route that works and a route that 503s.
//
// The user table is one KV key per account now, so reading the WHOLE table
// costs ONE SUBREQUEST PER USER. A Worker on the free plan is allowed 50
// subrequests per request, so from the 51st account onwards every route that
// read the table stopped working - and it stopped SILENTLY, because the
// platform kills the request before the worker can answer, so the user got
// an empty 503 and no message at all.
//
// The live site has 120 accounts. /sh/user-get, /sh/user-sync, /sh/user-delete
// and /sh/user-password were each reading all 120 of them to use ONE.
//
// So this reads the one key. The legacy blob is still consulted, because an
// account that predates the per-account keys lives only there - and THAT read
// is one subrequest, not one per user.
//
// It returns the record, or null. It does NOT touch D1: the caller mirrors
// the record it actually changed, because mirroring the whole table on every
// read is the other half of the same cost.
async function loadUserByEmail(env, email) {
    const key = userKvKey(email);
    if (!env.LOADERS_KV) return null;
    try {
        const raw = await env.LOADERS_KV.get(key);
        if (raw) {
            try { return JSON.parse(raw); } catch (e) {
                console.error('[ScripterHub] unreadable user record ' + key + ': ' + (e && e.message));
            }
        }
    } catch (e) { /* fall through to the legacy blob */ }
    // The legacy blob: ONE read, and only when the per-account key is absent.
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        if (raw) {
            const legacy = JSON.parse(raw) || {};
            const rec = legacy[email] || legacy[String(email || '').toLowerCase()];
            if (rec) return rec;
        }
    } catch (e) { /* no legacy blob, or unreadable */ }
    return null;
}

// Release ONE account's username, if the index entry still points at it.
//
// THE USERNAME INDEX OUTLIVED EVERY DELETE
//
// putUserRecord() writes sh_uname_<lowercased username> -> email on every
// save, and that is what makes username sign-in one get instead of a scan.
// Nothing removed it.
//
// So a deleted account kept its username RESERVED, permanently: signing up
// again with it answered
//
//     This username is already taken.
//
// for an account that no longer exists. And because the entry still named the
// old address, username login for the new person resolved to the DELETED
// account's record.
//
// Deleting an account is supposed to make its username available again. The
// index says otherwise.
//
// The entry is only removed if it still points at THIS account. If somebody
// has since taken the username, their entry is not theirs to lose, and
// deleting it would lock THEM out instead - trading one wrong answer for
// another.
async function releaseUsernameIndex(env, email, username) {
    const un = String(username || '').trim();
    if (!env.LOADERS_KV || !un) return;
    const key = unameKvKey(un);
    try {
        const holder = await env.LOADERS_KV.get(key);
        if (!holder) return;
        if (String(holder).toLowerCase() !== String(email || '').toLowerCase()) return;
        await env.LOADERS_KV.delete(key);
    } catch (e) {
        console.error('[ScripterHub] username index release failed: ' + (e && e.message));
    }
}

// Delete ONE account: its record, its D1 row, its legacy entry and its
// username. All four, because leaving any one behind is a row that says the
// account still exists.
async function deleteUserRecord(env, email, record) {
    const id = d1UserId(email);
    if (!id) return;
    try { await env.LOADERS_KV.delete(userKvKey(id)); } catch (e) { /* already gone */ }
    // The username comes from the record the caller already read. A delete with
    // no record in hand (the owner's route) leaves the index entry alone
    // rather than scanning the table for it - the cost of a scan is the whole
    // thing this change exists to avoid, and a stale reservation is a smaller
    // fault than a 503.
    await releaseUsernameIndex(env, id, record && record.username);
    await removeUserFromLegacyBlob(env, id);
    await deleteUserFromD1(env, id);
}

// Remove ONE account from the legacy blob, if it is there.
//
// The blob is one value, so removing an entry is a read-modify-write of that
// value - but it is only done when the blob exists AND holds the account, so
// the common case (a per-account key) costs nothing at all.
async function removeUserFromLegacyBlob(env, email) {
    if (!env.LOADERS_KV) return;
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        if (!raw) return;
        const legacy = JSON.parse(raw) || {};
        const key = Object.keys(legacy).find(k => k.toLowerCase() === String(email || '').toLowerCase());
        if (!key) return;
        delete legacy[key];
        await env.LOADERS_KV.put(USERS_KV_KEY, JSON.stringify(legacy));
    } catch (e) {
        console.error('[ScripterHub] legacy blob cleanup failed: ' + (e && e.message));
    }
}

// THE NAMES OF EVERY ACCOUNT, AND NOTHING ELSE.
//
// One KV list() call per 1000 accounts, and a list returns KEY NAMES - not
// records. So the whole account list costs ONE subrequest, however many
// accounts there are, and the records are fetched only for the page that is
// actually being served.
//
// This is the difference between the admin panel working and not. Reading the
// RECORDS for every account costs one subrequest each, so at 51 accounts
// (Workers on the free plan allow 50 subrequests per request) the platform
// killed the request with an empty 503 and no message.
async function listUserKeys(env) {
    const names = [];
    if (!env.LOADERS_KV) return names;
    let cursor = null;
    let guard = 0;
    do {
        const page = await env.LOADERS_KV.list({ prefix: USER_PREFIX, cursor: cursor || undefined, limit: USERS_LIST_MAX });
        for (const k of (page.keys || [])) names.push(k.name);
        cursor = page.list_complete ? null : page.cursor;
        if (++guard > 20) { cursor = null; break; }   // never loop forever
    } while (cursor);
    return names;
}

// A PAGE OF ACCOUNT RECORDS.
//
// The names come from one list call; the records for the page come from one
// get each. The page size is what keeps the subrequest count under the
// platform's limit, so it is CLAMPED rather than trusted.
//
// This does NOT mirror to D1. A read that rewrites the whole table is the
// other half of the same cost, and mirroring belongs on the paths that
// actually changed something.
async function loadUsersPage(env, offset, limit) {
    const names = await listUserKeys(env);
    const off = Math.max(0, offset | 0);
    const lim = Math.max(1, Math.min(limit | 0 || 25, 25));
    const users = {};
    for (const name of names.slice(off, off + lim)) {
        try {
            const raw = await env.LOADERS_KV.get(name);
            if (!raw) continue;
            const rec = JSON.parse(raw);
            const email = String((rec && (rec.email || rec.id)) || name.slice(USER_PREFIX.length));
            if (email) users[email] = rec;
        } catch (e) {
            // ONE bad record must not cost the page.
            console.error('[ScripterHub] unreadable user record ' + name + ': ' + (e && e.message));
        }
    }
    return { users, total: names.length, offset: off, limit: lim, hasMore: off + lim < names.length };
}
// kill an OLD loader (key rotation / re-upload on edit); returns true if replaced
async function maybeReplaceOld(env, replaces) {
    const rep = String(replaces || '');
    if (!/^ScripterHub[0-9]{6,16}$/.test(rep)) return false;
    const oldCode = await env.LOADERS_KV.get(KV_PREFIX + rep);
    const oldMeta = await env.LOADERS_KV.get(KV_META_PREFIX + rep);
    const oldCmeta = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + rep);
    if (oldCode === null && oldMeta === null && oldCmeta === null) return false;
    // chunked blob: delete every chunk + its manifest (unordered, safe)
    if (oldCmeta !== null) {
        try {
            const m = JSON.parse(oldCmeta);
            for (let i = 0; i < m.n; i++) await env.LOADERS_KV.delete(KV_CHUNK_PREFIX + KV_PREFIX + rep + '_' + i).catch(() => {});
        } catch (e) {}
        await env.LOADERS_KV.delete(KV_CMETA_PREFIX + KV_PREFIX + rep).catch(() => {});
        // the web view may be chunked too
        const webCmeta = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_WEB_PREFIX + rep);
        if (webCmeta !== null) {
            try {
                const w = JSON.parse(webCmeta);
                for (let i = 0; i < w.n; i++) await env.LOADERS_KV.delete(KV_CHUNK_PREFIX + KV_WEB_PREFIX + rep + '_' + i).catch(() => {});
            } catch (e) {}
            await env.LOADERS_KV.delete(KV_CMETA_PREFIX + KV_WEB_PREFIX + rep).catch(() => {});
        }
    }
    await env.LOADERS_KV.delete(KV_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_META_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_WEB_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_SKEY_PREFIX + rep).catch(() => {});
    return true;
}
// strip fields a client must never set/leak (password removed on read).
// ALSO trims giant base64 images: profile/banner photos used to ride
// inside the single sh_users_db KV value. A few 2-5MB images blew past
// Cloudflare's 25MB per-value cap -> saveUsersMap() threw -> every
// signup/login returned a BLANK 500 (no CORS headers) -> browsers saw
// "fetch failed" and users could not create accounts or claim
// loadstrings. Images are trimmed server-side to a safe cap; anything
// bigger is dropped from CLOUD SYNC (it stays in the user's own
// browser localStorage where the UI reads it anyway).
const SH_IMAGE_CAP = 2_000_000; // ~2MB of base64 per image field (increased from 200KB to accommodate normal images)
// EVERY base64 image field a user record can carry.
//
// This was spelled out field-by-field at each of the three places that enforce the
// cap, and they had already drifted. sanitizeUserRecord capped profileImage,
// bannerImage AND customBackground; publicUser and storageSafeUser capped only the
// first two. So a record that reached the map by any route other than the sanitiser
// - and the owner POST /sh/users upsert is a bare spread with no sanitiser at all -
// kept an unbounded customBackground.
//
// customBackground is a FULL-PAGE BACKDROP. One of those is several MB of base64,
// every user record lives in ONE KV entry, and GET /sh/users ships the whole map to
// every admin device. So one uncapped field is enough to make "Refresh from Cloud"
// a multi-minute download that never appears to finish.
//
// One list, read by all three, is the only way a field can be added to the
// sanitiser and forgotten everywhere else. This is the same lesson as the worker's
// two user-field allowlists (W18) and the client's four merge loops.
const SH_IMAGE_FIELDS = ['profileImage', 'bannerImage', 'customBackground'];
function capImageFields(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    for (const k of SH_IMAGE_FIELDS) {
        if (typeof rec[k] === 'string' && rec[k].length > SH_IMAGE_CAP) rec[k] = '';
    }
    return rec;
}
function publicUser(u) {
    const c = { ...u };
    delete c.password;
    return capImageFields(c);
}
// full record for STORAGE: trim oversized images too (they would kill
// the next KV put), keep everything else intact
//
// The drop is LOGGED, because it is the user's picture silently disappearing.
// capImageFields itself is called on read paths too, where the image was
// already trimmed, so it must stay quiet; saying it here means the log line
// lands exactly on the write that lost the field.
//
// It still delegates to capImageFields rather than repeating the field list.
// An inline loop here looked equivalent and was not: it is the second
// hand-written copy of SH_IMAGE_FIELDS, and tools/cloud_refresh_test.mjs
// fails on exactly that - it is the whole reason the single list exists.
function storageSafeUser(u) {
    if (!u || typeof u !== 'object') return u;
    const before = {};
    for (const k of SH_IMAGE_FIELDS) before[k] = u[k];
    const out = capImageFields({ ...u });
    for (const k of SH_IMAGE_FIELDS) {
        if (before[k] && !out[k]) {
            console.warn('[ScripterHub] dropped an oversized ' + k + ' (' + String(before[k]).length + ' bytes > ' + SH_IMAGE_CAP + ') when storing ' + (u.email || u.id || 'a user'));
        }
    }
    return out;
}
// save the users map WITHOUT ever throwing a blank 500: oversized maps
// are repaired by dropping image payloads (in size order) until the
// serialized value fits the KV cap
// Mirror the KV users map into the D1 `users` table.
//
// WHY THIS EXISTS NOW (it did not before)
// consumeSession() re-checks the account live as part of the atomic delivery
// statement: `EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.disabled = 0)`.
// Before this, the `users` table was a stub nothing ever wrote to except a
// placeholder row, so that subquery could never be satisfied and every
// account-bound session would have been refused. The column existed; the data
// did not. A table that looks authoritative and is empty is worse than no
// table, because the SQL reads as though the check is happening.
//
// The KV map stays the store the DASHBOARD reads — that is a migration
// convenience (D3), not a security decision. D1 is what the GATE reads,
// because a disabled user must stop the very next delivery, not up to 45s
// later.
//
// Only the fields the gate actually consults are mirrored: id, email,
// username, role, disabled, created_at, updated_at, last_login_at. NOT the
// password hash — the gate never needs it, and duplicating a credential into
// a second store doubles the blast radius of a dump for no benefit.
async function syncUsersToD1(env, map) {
    const state = stateFor(env);
    if (!state) return;
    const now = Date.now();
    for (const email of Object.keys(map || {})) {
        const u = map[email] || {};
        const id = d1UserId(u.email || email);
        if (!id) continue;
        // A legacy KV record may hold btoa(password) rather than a PBKDF2
        // record. It is mirrored as a clearly-fake hash so the row is NEVER
        // mistaken for a real credential: the value is not a valid KDF record
        // and no login path reads it. Mirroring the btoa value instead would
        // copy a recoverable credential into a second store.
        const stored = String(u.password || '');
        const hash = /^pbkdf2\$\d+\$/.test(stored)
            ? stored
            : 'pbkdf2$0$legacy$unmigrated';
        await d1run(state._db,
            `INSERT INTO users(id,email,username,password_hash,role,disabled,created_at,updated_at,last_login_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                role = excluded.role,
                disabled = excluded.disabled,
                updated_at = excluded.updated_at,
                last_login_at = excluded.last_login_at`,
            id, id, String(u.username || id).slice(0, 40), hash,
            (u.isAdmin || u.isScripter || String(u.email || '').toLowerCase() === OWNER_EMAIL) ? 'owner' : 'user',
            u.disabled ? 1 : 0,
            Date.parse(u.createdAt) || now, now,
            u.lastLoginAt || null
        );
    }
}

// Remove ONE account from the D1 mirror.
//
// syncUsersToD1 only ever adds or updates rows, so a deleted account kept
// its row - and the gate's live account check is
//
//     EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.disabled = 0)
//
// which would still find it. The account is gone from KV, so it can no longer
// sign in and its sessions do not verify, but a row that says the account
// exists when it does not is exactly the kind of thing that makes a later
// question ("is this account really deleted?") answer wrongly.
//
// The OWNER's row is never removed: the owner is not deletable, and a missing
// owner row would take the whole gate with it.
async function deleteUserFromD1(env, email) {
    const state = stateFor(env);
    if (!state) return;
    const id = d1UserId(email);
    if (!id) return;
    if (id === d1UserId(OWNER_EMAIL)) return;
    try {
        await d1run(state._db, 'DELETE FROM users WHERE id = ?', id);
    } catch (e) {
        console.error('[ScripterHub] D1 user delete failed for ' + id + ': ' + (e && e.message));
    }
}

// save the users map WITHOUT ever throwing a blank 500.
//
// THE WHOLE-TABLE PUT IS GONE, and that is the point of this change.
//
// It used to be: serialise every account, and if that passed the cap strip
// image payloads until it fitted, then PUT the entire thing. Two consequences,
// both observed in production:
//
//   * LOST UPDATES. Two signups inside the ~60s KV read cache both read the
//     same snapshot and the second PUT erased the first. Signup reported
//     success either way, so accounts silently vanished.
//
//   * A CEILING SOMEWHERE ELSE. Workers KV get() answers null past roughly
//     1MB. loadUsersMap() could not tell that apart from "there are no users
//     exist" and returned {}, so every login 401'd and every signup
//     "succeeded" against an empty table. The records were never lost - the
//     READ was failing.
//
// Now: each account is its own key, and this writes only what actually
// changed. A signup touches exactly one key, so concurrent signups cannot
// collide, and the largest read anywhere in the system is one record.
//
// The delete pass is what keeps /sh/users-delete and /sh/users-clear working.
// Without it a removed account would keep logging in forever from its own key.
//
// Cost: this is O(changed) rather than O(1), because it lists first to find
// what disappeared. Listing is cheap and paginated; the alternative is
// O(all users) written on every signup, which is what caused the bug.
async function saveUsersMap(env, map) {
    if (!env.LOADERS_KV) return;

    const before = await env.LOADERS_KV.list({ prefix: USER_PREFIX, limit: USERS_LIST_MAX });
    const existing = new Set((before.keys || []).map(k => k.name));

    for (const email of Object.keys(map || {})) {
        const rec = map[email];
        if (!rec || typeof rec !== 'object') continue;
        const key = userKvKey(email);
        const next = JSON.stringify(storageSafeUser({ ...rec, email }));
        let prev = null;
        try { prev = await env.LOADERS_KV.get(key); } catch (e) { prev = null; }
        // Skip the write when nothing changed. Most call sites re-save an
        // untouched record (a profile merge, a plan change) and writing those
        // back spends a write operation for nothing.
        if (prev === next) { existing.delete(key); continue; }
        await putUserRecord(env, rec);
        existing.delete(key);
    }

    // Anything still in `existing` was removed from the map by the caller.
    for (const key of existing) {
        await env.LOADERS_KV.delete(key).catch(() => {});
    }

    // Authoritative write for the gate's live account check. Wrapped so a D1
    // problem surfaces as refused account-bound deliveries rather than a blank
    // 500 in the panel — but never swallowed silently.
    if (stateFor(env)) {
        try { await syncUsersToD1(env, map); }
        catch (e) { console.error('[ScripterHub] user sync to D1 failed: ' + (e && e.message)); }
    }
}
// ===========================================================================
// PASSWORD HASHING (Phase 1, item 15)
// ===========================================================================
// Passwords used to be stored as btoa(password). That is ENCODING, not
// hashing: anyone able to read the users map recovers every password in
// cleartext with one base64 decode. The audit flagged this as the most
// damaging credential issue in the system.
//
// New format:  pbkdf2$<iterations>$<b64 salt>$<b64 derived key>
//
// PBKDF2-HMAC-SHA256 via WebCrypto (crypto.subtle.deriveBits) is used rather
// than Argon2/scrypt because Workers has no native Argon2id and no scrypt;
// adding a WASM KDF for this is possible but is a larger supply-chain
// decision than this phase should make unilaterally. PBKDF2 at a high
// iteration count is the defensible choice on this runtime and is a
// one-function swap if Argon2id is added later.
//
// WHY A SINGLE GLOBAL SALT IS NOT ENOUGH, and what is done instead:
// one salt per user (stored with the hash) is mandatory so that two users
// with the same password do not produce the same record. A server-side pepper
// (SH_KDF_PEPPER) is ALSO supported and is applied as additional keyed
// material, so a stolen KV dump alone does not allow offline cracking. The
// pepper lives in a Worker secret, never in KV, so it is not recoverable from
// the database.
//
// MIGRATION: a stored value that is not "pbkdf2$..." is LEGACY (plain btoa).
// On a successful login it is accepted once and immediately re-hashed. That
// keeps existing users working while the weak records disappear over time.
// This is opportunistic migration, not a silent one: it happens only after
// the correct password is proven, so it cannot lock anyone out.
// 100000, not 210000.
//
// The Web Crypto spec allows iterations in 1..100000 and the implementation MUST
// throw OperationError above that. 210000 is the OWASP *recommendation* for
// PBKDF2-HMAC-SHA256, but it is not reachable through crypto.subtle - so
// hashPassword() threw on EVERY call in production:
//
//     Pbkdf2 failed: iteration counts above 100000 are not supported
//     (requested 210000)
//
// That is why the password reset failed, and it was not only the reset: signup
// hashes, the opportunistic rehash on login, and the rehash on /sh/user-get all
// call this. Login kept working only because existing records are legacy btoa
// and take the migration path, which never reaches PBKDF2.
//
// WHY 33 TEST FILES MISSED IT: worker.test.mjs runs on Node, and Node's
// crypto.webcrypto does NOT enforce the cap - it happily derives at 210000.
// The harness was more permissive than the runtime it stands in for, so every
// "signup + login work" assertion passed for a reason that does not hold in
// production. tools/pbkdf2_limit_test.mjs now asserts the cap directly.
//
// 100000 is the maximum the platform actually permits, so this is as strong as
// this API can be. Getting past it needs a different KDF (Argon2/scrypt), not a
// bigger number.
const PBKDF2_ITERATIONS = 100000;   // Web Crypto hard maximum; see above
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;

function b64bytes(buf) {
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
}
function unb64bytes(s) {
    const raw = atob(String(s || ''));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

async function pbkdf2(password, salt, iterations) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
    }, baseKey, PBKDF2_KEY_BYTES * 8);
    return new Uint8Array(bits);
}

// Optional server-side pepper. Absent is tolerated (with a warning path) so
// the code is testable without secrets, but production should set it.
async function kdfPepper(env) {
    return (env && env.SH_KDF_PEPPER) ? String(env.SH_KDF_PEPPER) : '';
}

async function hashPassword(env, password) {
    const salt = new Uint8Array(PBKDF2_SALT_BYTES);
    crypto.getRandomValues(salt);
    const pepper = await kdfPepper(env);
    const dk = await pbkdf2(pepper ? pepper + '\0' + password : password, salt, PBKDF2_ITERATIONS);
    return 'pbkdf2$' + PBKDF2_ITERATIONS + '$' + b64bytes(salt) + '$' + b64bytes(dk);
}

function isLegacyPasswordHash(stored) {
    return !/^pbkdf2\$\d+\$/.test(String(stored || ''));
}

// Constant-time-ish comparison. Lengths are compared first (unavoidable) but
// the byte loop accumulates differences rather than returning early, so the
// comparison time does not reveal the matching prefix.
function timingSafeEqualStr(a, b) {
    const x = String(a == null ? '' : a);
    const y = String(b == null ? '' : b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
}

// Verify a supplied password against a stored record, accepting BOTH the new
// PBKDF2 format and the legacy btoa format.
//
// Returns { ok, needsRehash } so the caller can transparently upgrade a
// legacy record after a successful login.
async function verifyPassword(env, stored, supplied) {
    const s = String(supplied || '');
    if (!s) return { ok: false, needsRehash: false };

    if (!isLegacyPasswordHash(stored)) {
        const parts = String(stored).split('$');
        const iterations = parseInt(parts[1], 10);
        const salt = unb64bytes(parts[2]);
        const want = parts[3];
        if (!Number.isFinite(iterations) || !parts[2] || !want) return { ok: false, needsRehash: false };
        const pepper = await kdfPepper(env);
        const dk = b64bytes(await pbkdf2(pepper ? pepper + '\0' + s : s, salt, iterations));
        // Re-hash if the iteration count no longer matches the current policy.
        return { ok: timingSafeEqualStr(dk, want), needsRehash: iterations !== PBKDF2_ITERATIONS };
    }

    // LEGACY: btoa(password). Accepted so existing accounts keep working, and
    // the caller re-hashes immediately after a correct password.
    const legacyOk = (s === String(stored || '')) || (btoa(s) === String(stored || ''));
    return { ok: legacyOk, needsRehash: legacyOk };
}

// ===========================================================================
// SESSION TOKENS (Phase 1, item 16)
// ===========================================================================
// Tokens used to be base64(JSON) with a checksum that was DERIVED FROM THE
// DATA INSIDE THE TOKEN ITSELF:
//
//   token = btoa({ t, e, ch: <the stored password hash>, k: sha256(ch + t) })
//
// That is not a signature. The "key" proving the token is valid travels inside
// the token, so anyone who can read one token can mint an unlimited number of
// valid ones for any future timestamp. It also meant the token CONTAINED the
// password hash, so every base64-decodable session token in a log or a browser
// handed over the credential itself.
//
// Now: HMAC-SHA256 over the payload, keyed by a server-only secret
// (SH_SESSION_SECRET). The secret is in a Worker secret and never in KV, so
// forging a token requires the secret, not just a sample token.
//
// The payload additionally carries `pwd`, a fingerprint of the current
// password-hash generation, so a password change invalidates live tokens.
async function sessionSecret(env) {
    const s = env && env.SH_SESSION_SECRET;
    if (s) return String(s);
    // No secret configured. Derive a stable fallback so the system still
    // functions, but it is derived from public-ish values, so tokens are not
    // cryptographically unforgeable. This is logged once per cold start so
    // the misconfiguration is visible instead of silent.
    if (!globalThis.__sh_session_secret_warned) {
        globalThis.__sh_session_secret_warned = true;
        console.warn('[ScripterHub] SH_SESSION_SECRET is NOT set. Session tokens are signed with a derived fallback and are therefore forgeable. Run: wrangler secret put SH_SESSION_SECRET');
    }
    return 'SH_FALLBACK::' + (env && env.SH_SETUP_TOKEN ? String(env.SH_SETUP_TOKEN) : 'no-setup-token');
}

async function credentialFingerprint(env, storedHash) {
    // Fingerprint of the stored hash, NOT the password. Lets a token be
    // invalidated by a password change without the token carrying anything
    // that could be replayed against the KDF.
    return (await sha256Hex('SHSESS::' + await sessionSecret(env) + '::' + String(storedHash || ''))).slice(0, 32);
}

async function signSessionToken(env, payload) {
    const body = JSON.stringify(payload);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(await sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
    let hex = '';
    for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, '0');
    // body . sig, both base64url-ish
    return b64url(enc.encode(body)) + '.' + hex;
}

async function verifySessionSignature(env, bodyB64, sigHex) {
    try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(await sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, unb64url(bodyB64)));
        let hex = '';
        for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, '0');
        return hashEqual(hex, String(sigHex || ''));
    } catch (e) {
        return false;
    }
}

function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const raw = atob(t);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

// The old synchronous base64 comparison is REMOVED.
//
// It had no callers left after the PBKDF2 migration. It is kept out of the
// file deliberately rather than left as an unused helper: a function that
// compares passwords with === and btoa() is exactly the thing a future edit
// would reach for, and it is the reason this hole existed in the first place.
// Legacy records are still READ by verifyPassword(), which is the only path
// that should touch them.

// ===========================================================================
// RATE LIMITING (Phase 1, item 17)
// ===========================================================================
// The audit found rate limiting on ONE route: signup. /sh/login,
// /sh/user-login, /sh/auth, /sh/k, /sh/upload and the password routes were
// all unthrottled, so license keys, access codes and passwords could be
// brute-forced at whatever rate the network allows.
//
// WHERE THE COUNTERS LIVE, AND WHY IT MATTERS
// The old signup limiter kept its counters in a module-level Map. Cloudflare
// recycles isolates continuously, so that counter was reset by garbage
// collection rather than by the clock: the limit was advisory at best, and a
// bot that spread its requests across isolates got no limit at all.
//
// The counters here are still in-memory, which is a deliberate, documented
// limitation rather than an oversight:
//   * it needs no new binding, so it can ship before the D1 migration, and
//   * it is a large improvement over no limit for the brute-force case.
// It is NOT sufficient for a determined distributed attacker, and it is NOT
// durable. Phase 2 moves these buckets to the D1 `rate_limits` table, where
// the increment is a single atomic upsert and survives isolate recycling. The
// gate for that is G14, which stays open until it happens.
//
// The bucket key deliberately mixes the caller identity AND the route, so
// attempts against two different routes cannot be used to exhaust one
// route's budget, and vice versa.
const RATE_BUCKETS = {
    // [limit, windowMs]
    'login':          { limit: 10,  window: 60 * 1000 },        // /sh/login access code
    'user-login':     { limit: 10,  window: 60 * 1000 },        // /sh/user-login password
    'signup':         { limit: SIGNUP_FLOOD_LIMIT, window: SIGNUP_FLOOD_WINDOW_MS },
    'auth':           { limit: 30,  window: 60 * 1000 },        // /sh/auth license key guesses
    'key':            { limit: 30,  window: 60 * 1000 },        // /sh/k split-key requests
    'upload':         { limit: 20,  window: 60 * 1000 },
    // Phase 3. `session` is the mint route: a license-key guess costs one
    // mint attempt, so it needs the same bound `/sh/auth` already had.
    // `deliver` is the gate: a session is worth exactly one artifact, so a
    // flood against it is either a replay attempt or an attempt to burn other
    // people's sessions, and both must fail fast.
    'session':        { limit: 30,  window: 60 * 1000 },
    'deliver':        { limit: 60,  window: 60 * 1000 },
    'part':           { limit: 240, window: 60 * 1000 },        // 4/s: a chain crawl
    'password':       { limit: 5,   window: 15 * 60 * 1000 },   // change/recovery: tight
    'setcode':        { limit: 5,   window: 15 * 60 * 1000 },
    'admin':          { limit: 60,  window: 60 * 1000 },
    // Reward flow. `reward-start` is a visitor opening their own link, so it is
    // generous; `reward-claim` is where a key is MINTED, so it is tight - a key
    // per call means a flood there is a key-farming attempt, and the cap on
    // maxKeys is only worth having if the route in front of it is metered.
    // `reward-cb` is the provider callback: several can legitimately land in
    // quick succession for one visitor, but a flood is a forged postback storm.
    'reward-start':   { limit: 20,  window: 60 * 1000 },
    // The progress POLL gets its own bucket.
    //
    // It used to share 'reward-start' with /sh/reward/pub and /sh/reward/start.
    // reward.html refreshes every 4s, which is 15 requests a minute on its own,
    // so a page open for two minutes exhausted the whole 20/min budget. After
    // that /sh/reward/state answered 429, refresh() bailed out without updating
    // state, and the progress bar froze mid-count.
    //
    // The symptom was exactly "the checkpoint finished but it would not count
    // as passed" - the completion HAD been recorded server-side, and the page
    // simply never displayed it. stopPolling() is only called on completion or
    // ban, so the frozen tab kept hammering the dead endpoint too.
    //
    // Reads are cheap and idempotent. Writes stay on the tight budget.
    'reward-state':   { limit: 120, window: 60 * 1000 },
    'reward-claim':   { limit: 6,   window: 60 * 1000 },
    'reward-cb':      { limit: 40,  window: 60 * 1000 },
// Once per checkpoint, so this only has to cover a retry or two.
'reward-submit':  { limit: 12,  window: 60 * 1000 },
// A bypass REPORT. It writes a blacklist entry, so it must not be a way
// to lock somebody else out: a handful a minute, per identity.
'reward-block':   { limit: 5,   window: 60 * 1000 },
    'reward-save':    { limit: 30,  window: 60 * 1000 },
    // A download link is a bearer token for the whole artifact, so a flood
    // against one is either scraping or a shared link running away. Tight
    // enough to stop a scraper walking every published id.
    'download':      { limit: 20,  window: 60 * 1000 }
};

const rateState = new Map();
const RATE_STATE_MAX = 20000;   // memory cap; cleared wholesale when exceeded

// Consume one unit from a bucket. Returns { allowed, retryAfterSec }.
function rateLimit(bucket, identity) {
    const cfg = RATE_BUCKETS[bucket];
    if (!cfg) return { allowed: true, retryAfterSec: 0 };
    if (rateState.size > RATE_STATE_MAX) rateState.clear();
    const now = Date.now();
    const key = bucket + '|' + String(identity || 'anon');
    let arr = rateState.get(key);
    if (!arr) { arr = []; rateState.set(key, arr); }
    // drop timestamps that have aged out of the window
    while (arr.length && now - arr[0] > cfg.window) arr.shift();
    if (arr.length >= cfg.limit) {
        const retryAfterSec = Math.max(1, Math.ceil((cfg.window - (now - arr[0])) / 1000));
        return { allowed: false, retryAfterSec };
    }
    arr.push(now);
    return { allowed: true, retryAfterSec: 0 };
}

// The identity a rate limit is keyed on.
//
// Using a client-supplied header as the key would let an attacker rotate it
// to get a fresh budget, so only two things are trusted here: the
// Cloudflare-provided connecting IP, and — for authenticated routes — the
// identity the credential actually proves. Never a query parameter.
function rateIdentity(request, url, provenIdentity) {
    if (provenIdentity) return 'id:' + String(provenIdentity);
    const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
    return ip ? 'ip:' + ip : 'anon';
}

function rateLimitedResponse(retryAfterSec) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Try again shortly.' }), {
        status: 429,
        headers: Object.assign({}, CORS_HEADERS, { 'Retry-After': String(retryAfterSec || 60) })
    });
}

// Phase 3: the same contract as rateLimit(), but backed by the D1
// `rate_limits` table when it is available.
//
// WHY THIS MATTERS AND WHY THE OLD ONE WAS NOT ENOUGH
// The in-memory Map above is honest about its limits: Cloudflare recycles
// isolates continuously, so the counter is reset by garbage collection rather
// than by the clock, and an attacker who spreads requests across isolates gets
// a fresh budget each time. That is a real weakness, not a tuning choice, and
// it is why the in-memory version was only ever a stopgap.
//
// D1 fixes it because the increment is a single atomic upsert on one row per
// (bucket, window), so the counter is shared by every isolate serving the
// route. See migrations/0001_init.sql, `rate_limits`.
//
// The in-memory path is kept as the fallback for a deployment without D1, and
// it is deliberately the SLOWER-looking of the two only in durability, not in
// behaviour: same buckets, same limits, same response. That keeps G14
// meaningful either way.
async function guardRate(env, bucket, identity) {
    const state = stateFor(env);
    const cfg = RATE_BUCKETS[bucket];
    if (state && cfg) {
        try {
            const r = await state.hitRateLimit(bucket, identity, cfg.limit, cfg.window);
            if (!r.allowed) return rateLimitedResponse(r.retryAfterSec);
            return null;
        } catch (e) {
            // A D1 hiccup must not become an open door, so fall back to the
            // in-memory bucket rather than allowing the request through.
            console.error('[ScripterHub] D1 rate limit failed, using in-memory: ' + (e && e.message));
        }
    }
    const rl = rateLimit(bucket, identity);
    return rl.allowed ? null : rateLimitedResponse(rl.retryAfterSec);
}

// ---- signup flood guard (kept: the dedicated per-IP + global caps) ----
// KV daily writes are a shared quota - 1000 signups/day of bot junk
// starved every REAL signup/login. This caps the damage: a flood gets
// 429s long before the quota dies.
const signupHits = new Map();
function signupFloodBlocked(ip) {
    const now = Date.now();
    if (signupHits.size > 5000) signupHits.clear(); // memory cap
    let arr = signupHits.get(ip);
    if (!arr) { arr = []; signupHits.set(ip, arr); }
    while (arr.length && now - arr[0] > SIGNUP_FLOOD_WINDOW_MS) arr.shift();
    if (arr.length >= SIGNUP_FLOOD_LIMIT) return true;
    arr.push(now);
    return false;
}

// global per-isolate hourly cap: bots rotate IPs/proxies, so the per-IP
// limit alone still let hundreds of junk accounts through. This caps the
// TOTAL signups per isolate per hour no matter where they come from.
const SIGNUP_GLOBAL_LIMIT = 120;      // max signups per hour per isolate
const SIGNUP_GLOBAL_WINDOW_MS = 60 * 60 * 1000;
let signupGlobalHits = [];
function signupGlobalBlocked() {
    const now = Date.now();
    while (signupGlobalHits.length && now - signupGlobalHits[0] > SIGNUP_GLOBAL_WINDOW_MS) signupGlobalHits.shift();
    if (signupGlobalHits.length >= SIGNUP_GLOBAL_LIMIT) return true;
    signupGlobalHits.push(now);
    return false;
}

// what a signup/self-edit may control (plan is kept for existing records,
// but a NEW record always starts as Basic; admin flags are never settable)
function sanitizeUserRecord(u) {
    const allowed = ['id', 'email', 'username', 'password', 'plan', 'description', 'createdAt', 'isAdmin', 'isScripter', 'profileImage', 'bannerImage', 'theme', 'stats', 'disabled', 'twoStepEnabled', 'twoStepCode', 'twoStepExpires', 'moderatedUntil', 'moderationReason', 'moderationStrikes', 'moderationLastStrike', 'customBackground'];
    const out = {};
    for (const k of allowed) if (u[k] !== undefined) out[k] = u[k];
    out.isAdmin = false;
    out.isScripter = false;
    // plan whitelist: junk plans (15KB keyboard mash) rendered the whole
    // dashboard unreadable. Unknown plan -> Basic.
    if (!VALID_PLANS.includes(String(out.plan || ''))) out.plan = 'Basic';
    // hard caps on free-text fields (they were abused to store garbage)
    if (typeof out.username === 'string' && out.username.length > MAX_USERNAME_LEN) out.username = out.username.slice(0, MAX_USERNAME_LEN);
    if (typeof out.email === 'string' && out.email.length > MAX_EMAIL_LEN) out.email = out.email.slice(0, MAX_EMAIL_LEN);
    if (typeof out.description === 'string' && out.description.length > MAX_DESC_LEN) out.description = out.description.slice(0, MAX_DESC_LEN);
    if (typeof out.theme === 'string' && out.theme.length > 30) out.theme = 'default';
    // The three image fields must be STRINGS.
    //
    // The allowlist alone is not enough: it decides which KEYS survive, not what
    // they may contain, so `customBackground: {evil: true}` was being stored
    // verbatim. That is a shape the client cannot render, it bloats the single
    // users KV entry, and it is a hole in the field being free-form. Anything
    // that is not a string becomes '' - a missing background, which is a
    // recoverable state, rather than a corrupt one.
    for (const k of ['profileImage', 'bannerImage', 'customBackground']) {
        if (out[k] !== undefined && typeof out[k] !== 'string') out[k] = '';
        if (typeof out[k] === 'string' && out[k].length > SH_IMAGE_CAP) out[k] = '';
    }
    // moderation fields are server-written and expire on their own; a stale one
    // must not keep blocking someone after the penalty window has passed
    if (out.moderatedUntil && Number(out.moderatedUntil) <= Date.now()) {
        delete out.moderatedUntil;
        delete out.moderationReason;
    }
    return storageSafeUser(out);
}

// ============ RULES ENFORCEMENT ============
// The Settings tab used to say "Coming Soon". The rules are now written down AND
// enforced, because a rule nobody checks is a suggestion.
//
// NOTHING HERE DELETES ANYTHING. That is deliberate and absolute: the standing
// instruction on this project is that users and their data are never removed, so
// every penalty below is a BLOCK with an expiry. The account, the projects, the
// scripts and the keys all stay exactly where they are, and the block lifts on
// its own. The worst penalty available here is a long one.
//
// Penalties, matching what the rules page says:
//   bot account (automated/bulk)     -> 1 year, and flagged for the owner
//   swearing, first offence           -> 1 hour
//   swearing, repeat within 30 days   -> 1 day
//   rate-limit / bot-spam complaint   -> 1 hour
//
// The swear list is deliberately small and ordinary. A long list of substrings
// produces false positives on real words ("Scunthorpe problem"), and a moderation
// system that blocks honest users is worse than none - it is indistinguishable
// from an attack. Whole-word matching only, so "class" and "pass" are safe.
const RULE_SWEAR = [
    'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'whore', 'slut',
    'nigger', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'coon'
];

const RULE_PENALTY = {
    bot: 365 * 24 * 60 * 60 * 1000,
    first: 60 * 60 * 1000,
    repeat: 24 * 60 * 60 * 1000,
    spam: 60 * 60 * 1000
};

// Patterns that only appear in machine-generated names. These are the same
// signals the client's looksBotUser uses, kept deliberately narrow: a numeric
// username, keyboard-mash punctuation, or a wall of one repeated character.
function ruleLooksAutomated(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (/^\d{1,3}$/.test(t)) return true;                     // "7"
    if (/[{}<>|~`^\\]/.test(t)) return true;                  // never typed by hand
    if (/^(.)\1{7,}$/.test(t)) return true;                  // "aaaaaaaa"
    if (/\b(user|admin|test|bot)[-_]?\d{2,}\b/i.test(t)) return true;
    return false;
}

// Returns null when clean, or { code, penalty, reason } when not.
function ruleCheck(kind, text, priorStrikes) {
    const t = String(text || '').toLowerCase();
    if (!t) return null;
    if (ruleLooksAutomated(text)) {
        return { code: 'bot', penalty: RULE_PENALTY.bot, reason: 'automated or bulk account name (' + kind + ')' };
    }
    for (const w of RULE_SWEAR) {
        // A light leetspeak fold, so "f*ck" and "fvck" are caught too.
        const folded = t.replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/[3]/g, 'e').replace(/[5$]/g, 's').replace(/[7]/g, 't');
        // Whole word ANYWHERE, or a PREFIX of the whole string.
        //
        // Whole-word-only was tried first and it misses the most common case:
        // "fucklord" has "fuck" followed by an 'l', so it is not a whole word and
        // slipped straight through. A prefix match catches fucklord, shitlord,
        // slutty and the rest, which is what someone typing those actually means.
        //
        // A prefix match is still safe for honest words, because none of the
        // entries above begins an ordinary English word: class, pass, assassin,
        // analysis, bass, grass and Scunthorpe all survive, and the test asserts
        // exactly that list so the tradeoff cannot be widened by accident later.
        const whole = new RegExp('(?:^|[^a-z])' + w + '(?:[^a-z]|$)', 'i');
        if (whole.test(folded) || folded.indexOf(w) === 0) {
            const repeat = Number(priorStrikes) > 0;
            return {
                code: repeat ? 'swear-repeat' : 'swear',
                penalty: repeat ? RULE_PENALTY.repeat : RULE_PENALTY.first,
                reason: 'swearing in ' + kind
            };
        }
    }
    return null;
}

// Records a strike count and sets the block window. Returns the record.
function ruleApplyModeration(user, viol) {
    const now = Date.now();
    user.moderationStrikes = (Number(user.moderationStrikes) || 0) + 1;
    user.moderationLastStrike = now;
    user.moderatedUntil = now + viol.penalty;
    user.moderationReason = viol.reason;
    return user;
}

// True while a block is in force. Deliberately does not touch the data.
function ruleIsBlocked(user) {
    if (!user) return null;
    const until = Number(user.moderatedUntil) || 0;
    if (!until || until <= Date.now()) return null;
    return { until, reason: String(user.moderationReason || 'rules violation'), leftMs: until - Date.now() };
}

// fetch ALL valid owner access-code hashes.
//
// SECURITY (Phase 1): there is NO hard-coded default any more.
//
// The previous implementation seeded this list with sha256("ScripterHub"), and
// the literal "ScripterHub" was the product name, in the page title, and in
// every loadstring. It was therefore not a secret at all: anyone who had read
// the source, seen a screenshot, or guessed the obvious could authenticate as
// owner and receive a 12-hour owner session token, which unlocks /sh/upload,
// /sh/users, /sh/users-delete and /sh/users-clear.
//
// The owner code is now generated once, at high entropy, and only its SHA-256
// is stored. It is never a constant in this file.
//
// THE CODE IS NEVER WRITTEN TO A LOG. An earlier version of this printed it
// with console.log on bootstrap, which is not acceptable: Cloudflare retains
// worker logs, they are visible to anyone with dashboard access, they can be
// shipped to log aggregation, and `wrangler tail` replays them. Printing a
// credential once is still putting a credential in a place designed to keep
// it. The flow is now strictly:
//
//   1. run the claim once from your own machine (see the endpoint below)
//   2. the plaintext is returned in that HTTP response and nowhere else
//   3. it is never written to KV, a log, or a Worker secret
//   4. only its SHA-256 is persisted
//
// The endpoint is protected by SH_SETUP_TOKEN, which the operator sets as a
// Worker secret, so an attacker who reaches the worker still cannot claim it.
// The claim is single-use: the stored record is deleted as it is read, so a
// second attempt returns nothing even with the setup token.
const OWNER_CODE_BOOTSTRAPPED_KEY = 'sh_owner_bootstrapped';

async function getCodeHashes(env) {
    const hashes = [];
    if (env.SH_OWNER_CODE_HASH) {
        // operator-supplied hash wins and needs no KV at all
        hashes.push(String(env.SH_OWNER_CODE_HASH).trim().toLowerCase());
    }
    if (env.LOADERS_KV) {
        try {
            const rec = await env.LOADERS_KV.get(CODE_KV_KEY);
            if (rec) {
                const h = JSON.parse(rec).hash;
                if (h && !hashes.includes(h)) hashes.push(h);
            }
        } catch (e) {}
    }
    if (hashes.length === 0) {
        // Pre-Phase-1 deployment with no code ever set. Mint one now rather
        // than fall back to a guessable default.
        //
        // The minted plaintext is hashed and immediately discarded here. The
        // ONLY way for the operator to obtain it is the single-use
        // /sh/owner-claim endpoint, which calls bootstrapOwnerCode() itself.
        const code = await bootstrapOwnerCode(env);
        if (code) {
            hashes.push(await sha256Hex(code));
        }
    }
    return hashes;
}

// 192 bits of entropy from crypto.getRandomValues, grouped for transcription
// and stripped of look-alike characters (no I/O/0/1).
function generateOwnerCode() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += alphabet[bytes[i] % alphabet.length];
        if ((i + 1) % 6 === 0 && i + 1 < bytes.length) out += '-';
    }
    return out;
}

// Mint the owner code if this deployment has none.
//
// SECURITY: the plaintext is returned to the CALLER ONLY. It is never logged,
// never written to KV, and never placed in an env binding. Only its SHA-256
// is persisted, which is what getCodeHashes() compares against.
//
// The caller is claimOwnerCode(), which serves it once over an endpoint
// gated on SH_SETUP_TOKEN and then deletes the record. The plaintext exists
// in exactly two places at any moment: the response body being returned, and
// the operator's terminal.
//
// Returns the code to the caller, or null if one already exists / no KV.
async function bootstrapOwnerCode(env) {
    if (!env.LOADERS_KV) return null;
    try {
        const done = await env.LOADERS_KV.get(OWNER_CODE_BOOTSTRAPPED_KEY);
        if (done) return null;   // already bootstrapped once; do not re-mint
        const code = generateOwnerCode();
        await env.LOADERS_KV.put(CODE_KV_KEY, JSON.stringify({
            hash: await sha256Hex(code),
            setAt: Date.now(),
            generated: true
        }), { expirationTtl: LOADER_TTL });
        await env.LOADERS_KV.put(OWNER_CODE_BOOTSTRAPPED_KEY, String(Date.now()), { expirationTtl: LOADER_TTL });
        // Returned to claimOwnerCode() and then dropped on the floor. There is
        // deliberately no console.log here: a credential in retained logs is
        // still a credential in retained logs, however briefly it was printed.
        return code;
    } catch (e) {
        return null;
    }
}

// ===========================================================================
// ATOMIC STATE LAYER (Phase 3)
//
// THE SEAM
//
// `stateFor(env)` returns the state layer or null. Null means "D1 is not
// bound, or the migration has not been applied", and the delivery gate treats
// that as a REFUSAL, not as a reason to fall back.
//
// This is the one place where the design deliberately does NOT have a
// graceful degradation path, and it is worth saying why out loud. The Phase 2
// notes specified a fallback to the KV check so the code could ship before the
// database existed. That constraint is gone: wrangler.toml step 2 creates the
// database and step 3 applies the schema, both before the first deploy.
//
// With the constraint gone, a KV fallback here would be strictly worse than
// failing: it would restore every property Phase 3 exists to remove (replay,
// expiry, ban-at-delivery, single-use) with no error anywhere, and the
// operator would believe the system was gated when it was not. A loud 503 plus
// a log line is strictly more useful than a silent hole.
// ===========================================================================
function stateFor(env) {
    if (!env) return null;
    if (!env.SH_DB) return null;
    if (!env.__shState) {
        try { env.__shState = createState(env.SH_DB); }
        catch (e) {
            console.error('[ScripterHub] D1 state layer unavailable: ' + (e && e.message));
            return null;
        }
    }
    return env.__shState;
}

// The user's D1 id. The KV users map is keyed by lowercased email, so reusing
// that as the primary key means the two stores join without a mapping table
// and without inventing a second identity for a person who already has one.
function d1UserId(email) {
    return String(email || '').trim().toLowerCase().slice(0, 100);
}

async function ensureUserRow(state, email, username, now) {
    if (!state || !email) return d1UserId(email);
    const id = d1UserId(email);
    await d1run(state._db,
        `INSERT INTO users(id,email,username,password_hash,role,created_at,updated_at)
         VALUES (?,?,?,'pbkdf2$migrated$migrated','user',?,?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        id, id, String(username || id).slice(0, 40), now, now);
    return id;
}

async function ensureScriptRow(state, id, opts, now) {
    if (!state || !id) return;
    // scripts.owner_id is a NOT NULL FK to users(id), and that FK is what
    // enforces "you may not delete a user who still owns scripts"
    // (migrations/0001_init.sql). So the owner row is materialised FIRST,
    // unconditionally, from the same identity the KV meta already records.
    //
    // It has to be unconditional. An earlier version only created the user in
    // the "no owner given" fallback branch, so every script with a real owner
    // skipped it and the script INSERT failed on the foreign key — while the
    // fallback path, which nobody uses, was the only one that worked. The
    // symptom was an empty licenses table and a gate refusing every delivery,
    // and it was only visible because the reconcile logs its failures.
    const owner = d1UserId(opts.user) || 'unknown-owner';
    const ownerId = await ensureUserRow(state, owner, owner, now);
    await d1run(state._db,
        `INSERT INTO scripts(id,owner_id,name,visibility,auth_required,killed,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            visibility = excluded.visibility,
            auth_required = excluded.auth_required,
            updated_at = excluded.updated_at`,
        id, ownerId, String(opts.name || 'script').slice(0, 100),
        String(opts.visibility || 'anyone'),
        opts.authRequired ? 1 : 0,
        opts.killed ? 1 : 0,
        now, now);
}

// KV license map -> D1 `licenses`.
//
// The column mapping is the whole point of this function, because
// consumeSession()'s WHERE clause reads D1 columns and gets them wrong
// silently if the shapes differ:
//
//   KV rec.banned      -> licenses.revoked_at IS NOT NULL
//   KV rec.expiresAt   -> licenses.expires_at       (0 means "never")
//   KV rec.hwid        -> licenses.hwid            ('' means "not yet locked")
//
// The two zero/empty conventions are the trap: KV uses 0 and '' for "unset"
// because JSON has no null in the panel's data model, while SQL uses NULL and
// conflates them with a real value. A license with expiresAt:0 must become
// NULL, or every never-expiring license would read as expired since 1970.
//
// WHY script_id IS INFORMATIONAL AND NOT FILTERED ON
// An earlier version skipped any record whose scriptId was not a
// `ScripterHub##########` loader id, on the assumption that was what licenses
// carry. It is not: the dashboard creates licenses against internal ids like
// "script_1737000000000", or the literal "all". So the filter matched nothing,
// every real license was dropped, D1 stayed empty, and the gate refused every
// licensed delivery in production while the test suite passed.
//
// Nothing is filtered now. `licenses.script_id` is nullable, carries no
// foreign key and is not consulted by consumeSession() — a license is a
// credential, not a property of one script. The license -> loader binding the
// gate needs lives on `sessions.script_id`, recorded at mint time.
async function syncLicensesToD1(env, map) {
    const state = stateFor(env);
    if (!state) return;
    const now = Date.now();
    for (const key of Object.keys(map || {})) {
        const r = map[key] || {};
        const owner = d1UserId(r.user || r.owner || '') || 'unknown-owner';
        await ensureUserRow(state, owner, owner, now);
        const expiresAt = Number(r.expiresAt) || 0;
        const hwid = String(r.hwid || '').slice(0, 300);
        const scriptId = String(r.scriptId || '').slice(0, 60) || null;
        await d1run(state._db,
            `INSERT INTO licenses(key,script_id,owner_id,hwid,expires_at,revoked_at,revoke_reason,executions,last_auth_at,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(key) DO UPDATE SET
                script_id = excluded.script_id,
                owner_id = excluded.owner_id,
                hwid = excluded.hwid,
                expires_at = excluded.expires_at,
                revoked_at = excluded.revoked_at,
                revoke_reason = excluded.revoke_reason,
                executions = excluded.executions,
                last_auth_at = excluded.last_auth_at`,
            String(key).slice(0, 200), scriptId, owner,
            hwid || null,
            expiresAt > 0 ? expiresAt : null,
            r.banned ? now : null,
            r.banned ? String(r.banReason || 'banned').slice(0, 300) : null,
            Number(r.executions) || 0,
            Number(r.lastAuthAt) || 0 || null,
            Number(r.createdAt) || now
        );
    }
}

// A script's authorization-relevant facts, read for a delivery decision.
// Returns null when the script does not exist, which is deliberately
// indistinguishable from "gone" to the caller.
async function scriptAuthz(env, id) {
    let meta = null;
    try { meta = JSON.parse((await env.LOADERS_KV.get(KV_META_PREFIX + id)) || 'null'); } catch (e) { meta = null; }
    const exists = meta !== null
        || (await env.LOADERS_KV.get(KV_PREFIX + id)) !== null
        || (await env.LOADERS_KV.get(KV_GH_PREFIX + id)) !== null
        || (await env.LOADERS_KV.get(KV_KB_PREFIX + id)) !== null
        || (await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id)) !== null;
    if (!exists) return null;
    return {
        exists: true,
        name: String((meta && meta.name) || ''),
        user: String((meta && meta.user) || ''),
        keyless: !!(meta && meta.keyless === true),
        authRequired: !!(meta && meta.authRequired === true),
        // The owning project, recorded at upload time.
        //
        // It was absent because nothing ever wrote it: the worker's model of a
        // script was flat - exists, name, user, keyless, authRequired,
        // visibility - and there was nowhere to hang "which project is this".
        // That is also why a license could not be bound to one project, and why
        // the key panel's scriptId field was never read by anything.
        projectId: String((meta && meta.projectId) || ''),
        projectName: String((meta && meta.projectName) || ''),
        visibility: String((meta && meta.visibility) || 'anyone'),
        raw: meta || {}
    };
}

// The gate for a single part of a multi-part delivery.
//
// Shared by /sh/c/<id>/<i> (KV chunks) and /sh/g/<id>/<i> (GitHub Storage
// Keeper) because the two differ only in where the bytes come from. Keeping
// one implementation means the checks cannot drift apart between the KV path
// and the GitHub path, which is exactly how a route ends up ungated by
// accident.
//
// FOUR THINGS ARE PROVED, IN THIS ORDER:
//
//   1. a valid grant exists           (HMAC over {sid, script, exp})
//   2. the grant names THIS session   (a grant for script A cannot buy
//                                     parts of script B)
//   3. the session already spent      (the chain is a CONTINUATION of a
//                                     delivery, never an alternative to one)
//   4. this is the NEXT part          (forward-only; no skip, no replay)
//
// Step 4 is the one that does the real work, and it is a single conditional
// UPDATE. There is no read-then-write between "which part is next" and "this
// part is served", so a captured part-7 request is worth exactly one part-7
// response and then nothing.
async function guardPartRequest(env, request, url, id, idx) {
    const state = stateFor(env);
    if (!state) {
        console.error('[ScripterHub] part request refused: D1 (SH_DB) is not bound or not migrated.');
        return methodNotAllowed();
    }
    const now = Date.now();
    const grant = String(url.searchParams.get('g') || '');
    const sid = String(url.searchParams.get('s') || '').slice(0, 80);

    const g = await verifyGrant(await grantSecret(env), grant, now);
    if (!g.ok) { S.threatsBlocked++; return methodNotAllowed(); }
    if (g.scriptId !== id || g.sid !== sid) { S.threatsBlocked++; return methodNotAllowed(); }

    const chain = await peekChain(state, sid);
    if (!chain) { S.threatsBlocked++; return methodNotAllowed(); }
    if (!chain.consumed_at) { S.threatsBlocked++; return methodNotAllowed(); }
    if (!chain.grant_expires_at || !(chain.grant_expires_at > now)) { S.threatsBlocked++; return methodNotAllowed(); }
    const total = Number(chain.parts_total) || 0;
    if (!total || idx < 0 || idx >= total) { S.threatsBlocked++; return methodNotAllowed(); }

    const step = await advancePart(state, sid, idx, total, now);
    if (!step.ok) { S.threatsBlocked++; return methodNotAllowed(); }
    return null;   // null == authorised
}

// `visibility` used to be a browser-only localStorage field, which meant
// "private" hid a script in the UI while the worker still served anyone who
// asked for the URL. It is now server-side state in two places: the KV meta
// (what the panel reads) and D1 `scripts.visibility` (what the delivery gate
// consults). Anything unrecognised falls back to 'anyone', so a malformed
// request cannot accidentally make a script MORE private than intended and
// lock its own owner out.
function readVisibility(body) {
    const v = String((body && body.visibility) || 'anyone');
    return ['anyone', 'account', 'private'].includes(v) ? v : 'anyone';
}

// Best-effort mirror of a script's authorization facts into D1.
//
// Best-effort is correct here and NOT at the gate. This is the publish path,
// so a failed mirror should not reject an upload the owner has every right to
// make. The gate does not consult this function — it reads D1, and if the
// mirror never happened the gate sees the PREVIOUS state. For a visibility or
// auth change that is the conservative direction, and the log line makes it
// diagnosable. Swallowing it silently would not be.
function mirrorScript(env, id, o) {
    const state = stateFor(env);
    if (!state || !id) return;
    ensureScriptRow(state, id, o, Date.now())
        .catch(e => console.error('[ScripterHub] script mirror to D1 failed: ' + (e && e.message)));
}

// The migration switch for the /sh/k compatibility window.
//
// DEFAULT OFF, and that default is the secure one: with the var absent, every
// require-key script published before Phase 3 stops working. That is a
// deliberate hard cutover, and the operator opts INTO continuity rather than
// out of security — the reverse default would silently re-open G07/G08/G09 on
// every deployment.
//
// Only the literal "1" and "true" enable it, so a typo like "yes" or
// "enabled" leaves the secure behaviour in place. A misspelt security switch
// should fail closed; that is the whole lesson of the owner access code, which
// shipped as a hard-coded default and had to be removed in Phase 1b.
function legacySplitKeyEnabled(env) {
    const v = env && env.SH_LEGACY_SPLIT_KEY;
    return v === '1' || v === 'true';
}

// ---- REAL LICENSE helpers (Luarmor-model server auth) ----
// WHY TWO STORES
//
// Licenses live in KV because that is where the dashboard has always read and
// written them, and rewriting every panel is a much larger change than the
// delivery gate is. But KV cannot be trusted for an authorization decision:
// it is eventually consistent with no atomic CAS, so a ban written to it can
// take tens of seconds to be visible on another edge, and "the ban is on its
// way" is not a security property.
//
// So KV remains the store the PANEL reads, and D1 is the store the DELIVERY
// GATE reads. Every mutation flows through saveLicenses() below, which writes
// both; loadLicenses() reconciles on read, so any drift heals on the next
// owner action rather than persisting.
//
// The split is deliberate and worth being explicit about: a license is
// mutable control-plane state with a lifecycle, which is exactly the category
// D3 assigns to D1. The panel keeping its KV copy is a migration convenience,
// not a security decision.
async function loadLicenses(env) {
    if (!env.LOADERS_KV) return {};
    let map = {};
    try {
        const raw = await env.LOADERS_KV.get(KV_LICENSES_KEY);
        map = raw ? JSON.parse(raw) : {};
    } catch (e) { map = {}; }
    // Reconcile into D1. Cheap (one write per changed row) and it means the
    // gate is never reading a license it has not just confirmed.
    //
    // The catch LOGS. A reconcile that fails silently is indistinguishable
    // from one that worked, and the symptom it produces is a gate refusing
    // every delivery with `nosession` because the license subquery in
    // consumeSession() finds no row. That is a miserable thing to debug, so
    // the failure is reported rather than absorbed.
    if (stateFor(env)) {
        try { await syncLicensesToD1(env, map); }
        catch (e) { console.error('[ScripterHub] license reconcile to D1 failed: ' + (e && e.message)); }
    }
    return map;
}
async function saveLicenses(env, map) {
    await env.LOADERS_KV.put(KV_LICENSES_KEY, JSON.stringify(map));
    // The authoritative write for the delivery gate. Wrapped so a D1 problem
    // surfaces as a gate refusal rather than a blank 500 in the owner panel —
    // but NOT swallowed silently: console.error so it is visible in the logs.
    if (stateFor(env)) {
        try { await syncLicensesToD1(env, map); }
        catch (e) { console.error('[ScripterHub] license sync to D1 failed: ' + (e && e.message)); }
    }
}
// ---- LEGACY GITHUB big-script storage: READ PATH ONLY ----
// This used to be where the bytes of a large script lived: a PRIVATE GitHub repository
// written through the Git Data API, one commit per part, with the repo token held here.
//   GET  /sh/g/<id>/<i>  <- EXECUTOR-ONLY part download, proxied from GitHub
//
// The WRITE half (/sh/gh-put, /sh/gh-finalize) is RETIRED and answers 410. Large
// scripts now store on the owner's own disk through the Storage Keeper service, which is
// the entire point of that change: a private repo was still Cloudflare-adjacent hosting
// with a 100MB-per-file cap, not the owner's drive.
//
// The read path stays because scripts published before the retirement are still running.
// Deleting it would orphan loadstrings that people are executing today. Nothing new can
// get in, so the repo only ever shrinks from here.
// Requirements, for the legacy read path only:
//   SH_GH_TOKEN / SH_GH_REPO  (can be removed once no pre-retirement script is live)
const GH_PART_MAX = 40_000_000;      // 40MB raw -> ~53MB base64 (API cap 100MB)
const KV_GH_PREFIX = 'sh_gh_';      // sh_gh_<id> = { repo, path, n, len, sha, at, name, user, keyless, webKey, keyHash, authRequired }
// Parts live on the owner's PC via the Storage Keeper service. This record is only the
// INDEX - "this script is n parts long" - never the bytes.
const KV_KB_PREFIX = 'sh_kb_';      // sh_kb_<id> = { n, len, at, name, user, keyless, webKey, keyHash, authRequired }
const GH_API = 'https://api.github.com';
// minimal GitHub REST client (workers fetch, no deps)
async function ghFetch(env, path, opts) {
    if (!env.SH_GH_TOKEN || !env.SH_GH_REPO) throw new Error('Storage Keeper not configured (SH_GH_TOKEN / SH_GH_REPO missing)');
    const res = await fetch(GH_API + path, {
        method: (opts && opts.method) || 'GET',
        headers: {
            'Authorization': 'Bearer ' + env.SH_GH_TOKEN,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'scripterhub-storage-keeper',
            ...(opts && opts.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) throw new Error('github ' + res.status + ': ' + (data && data.message ? data.message : String(text).slice(0, 200)));
    return { status: res.status, data: data };
}
// read one blob part from the storage repo (base64 -> raw string)
async function ghGetPart(env, repo, path, ref) {
    const r = await ghFetch(env, '/repos/' + repo + '/contents/' + path + '?ref=' + encodeURIComponent(ref || 'main'));
    const b64 = r.data && r.data.content ? r.data.content.replace(/\s/g, '') : '';
    if (!b64) throw new Error('part missing');
    return atob(b64);
}
// write one blob + async task to also append it to the ref via a commit
// (simplest reliable path on Workers: contents API single-file commit)
async function ghPutPart(env, repo, path, contentB64, ref) {
    const r = await ghFetch(env, '/repos/' + repo + '/contents/' + path, {
        method: 'PUT',
        body: { message: 'storage: ' + path, content: contentB64, branch: ref || 'main' }
    });
    return r.data; // { commit, content: { sha } }
}
// head (latest sha) of the storage branch
async function ghHead(env, repo, ref) {
    const r = await ghFetch(env, '/repos/' + repo + '/git/ref/' + (ref || 'heads/main'));
    return r.data.object && r.data.object.sha ? r.data.object.sha : null;
}
// ---- CHUNKED BLOB STORAGE (big scripts, KV 25MB/value workaround) ----
// Small blobs: one KV put (unchanged legacy format). Big blobs: stored as
//   sh_chunk_<id>_0 .. sh_chunk_<id>_N  + sh_cmeta_<id> = { n, len }
// getBlob reassembles them in order. Chunk writes are sequential (KV
// is eventually consistent; the meta record with the count is written
// LAST so a half-finished upload can never be served as a valid script).
const KV_CHUNK_PREFIX = 'sh_chunk_';
const KV_CMETA_PREFIX = 'sh_cmeta_';
// The artifact blob store, with optional at-rest encryption.
//
// ENCRYPTION BOUNDARY, and it is a deliberate one: each CHUNK is encrypted
// independently, not the joined artifact. That costs one GCM nonce+tag per
// chunk (~28 bytes) but means a 10GB artifact never has to exist in memory as
// one plaintext buffer, and a partially-uploaded blob is never briefly
// plaintext. For a 25MB chunk the overhead is ~0.0001%.
//
// `len` in the manifest stays the PLAINTEXT length, because that is what the
// integrity check compares against after decryption.
// ---------------------------------------------------------------------------
// LOCAL STORAGE KEEPER BACKEND (opt-in).
//
// When SH_STORE_URL and SH_STORE_TOKEN are bound, script BYTES go to the owner's
// Windows PC through the Storage Keeper service and Cloudflare KV keeps only
// metadata. When they are not bound, every function below reports "not configured"
// and the caller falls through to the existing KV path unchanged.
//
// That conditional is the whole design. This is opt-in rather than a replacement
// because KV still holds sh_meta_<id>, which is the record the delivery gate
// authorizes against - moving bytes must not mean moving identity. It also means
// the existing worker tests, which bind no such variables, keep testing exactly
// what they tested before.
// ---------------------------------------------------------------------------

function storeConfigured(env) {
    return !!(env && env.SH_STORE_URL && env.SH_STORE_TOKEN);
}

// The only thing a caller ever names is an id. There is deliberately no path-shaped
// parameter anywhere in this interface, and no way for a client to supply one.
const STORE_ID_RE = /^ScripterHub[0-9]{6,16}$/;

function storeUrl(env, suffix) {
    return String(env.SH_STORE_URL).replace(/\/+$/, '') + suffix;
}

async function storeFetch(env, suffix, init) {
    const t0 = Date.now();
    let res;
    try {
        res = await fetch(storeUrl(env, suffix), {
            ...init,
            headers: {
                'Authorization': 'Bearer ' + String(env.SH_STORE_TOKEN),
                ...(init && init.headers ? init.headers : {}),
            },
        });
    } catch (e) {
        // A storage outage is never allowed to look like "the script does not exist":
        // that would tell a user their script is gone when it is merely unreachable.
        console.error('[ScripterHub] storage keeper unreachable (' + (Date.now() - t0) + 'ms): ' + (e && e.message));
        return { ok: false, unreachable: true, status: 0 };
    }
    return { ok: res.ok, status: res.status, unreachable: false, res };
}

// Returns true on success, false on a definite refusal, null when unreachable.
async function storePut(env, id, kind, text, expiresAt) {
    if (!STORE_ID_RE.test(String(id))) return null;
    if (typeof text !== 'string' || !text.length) return null;
    let suffix = '/v1/objects/' + id + '?kind=' + encodeURIComponent(kind);
    if (expiresAt) suffix += '&expires_at=' + encodeURIComponent(String(expiresAt));
    const out = await storeFetch(env, suffix, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new TextEncoder().encode(text),
    });
    if (out.unreachable) return null;
    if (!out.ok) {
        console.error('[ScripterHub] storage keeper refused a put: HTTP ' + out.status);
        return false;
    }
    return true;
}

// null means "not there" (missing OR expired - the service does not distinguish, and
// neither may we). unreachable means the service could not be asked.
async function storeGet(env, id, kind) {
    if (!STORE_ID_RE.test(String(id))) return { value: null, unreachable: false };
    const out = await storeFetch(env, '/v1/objects/' + id + '?kind=' + encodeURIComponent(kind), { method: 'GET' });
    if (out.unreachable) return { value: null, unreachable: true };
    // AN AUTH FAILURE IS NOT "THE SCRIPT IS ABSENT".
    //
    // This used to collapse every non-OK response into {value:null,
    // unreachable:false}, and `unreachable:false` is read downstream as "the
    // backend authoritatively says there is nothing here". So a 401 from the
    // Storage Keeper - a wrong or stale SH_STORE_TOKEN - was reported to the
    // user as:
    //
    //     [ScripterHub] Script cannot be loaded, doesnt exist or expired.
    //
    // which is a lie in a direction that costs hours: the script exists, the
    // operator goes looking for a deleted or expired script instead of at the
    // one secret that is wrong. Measured on a real deployment: the keeper held
    // 18,592,590 bytes for the script and served them in 16.1 s, while the
    // worker refused the same fetch as "gone" because its token did not match.
    //
    // So 401/403 now reports `authFailed`, which the delivery site treats as an
    // outage (same fallback path as unreachable) AND logs loudly. The script is
    // not lost, and the operator is pointed at the credential.
    if (out.status === 401 || out.status === 403) {
        console.error('[ScripterHub] storage keeper REJECTED our credential (HTTP ' + out.status
            + ') for ' + kind + ' ' + id + ' - SH_STORE_TOKEN does not match the keeper. '
            + 'The script still exists; this is a secret mismatch, not a missing script.');
        return { value: null, unreachable: true, authFailed: true, status: out.status };
    }
    if (!out.ok) {
        console.error('[ScripterHub] storage keeper answered HTTP ' + out.status
            + ' for ' + kind + ' ' + id);
        return { value: null, unreachable: false, status: out.status };
    }
    try {
        return { value: new TextDecoder().decode(await out.res.arrayBuffer()), unreachable: false };
    } catch (e) {
        console.error('[ScripterHub] storage keeper returned an unreadable body');
        return { value: null, unreachable: true };
    }
}

async function storeMeta(env, id, kind) {
    if (!STORE_ID_RE.test(String(id))) return null;
    const out = await storeFetch(env, '/v1/objects/' + id + '/meta?kind=' + encodeURIComponent(kind), { method: 'GET' });
    if (out.unreachable || !out.ok) return null;
    try { return JSON.parse(await out.res.text()); } catch (e) { return null; }
}

// The expiry an upload should be stored with.
//
// UNIT: unix SECONDS on the wire. The service compares against time.time(), and a
// milliseconds value is larger than any sane second-count, so it gets clamped to the
// one-year cap - which makes a 30-second timer silently become a one-year one. The
// conversion happens here, once, rather than being left to each caller to remember.
//
// Absent means NO TIMER, which is the deliberate default: creating a script does not
// impose a lifetime the owner did not ask for. The service still applies the one-year
// hard cap on its own, so "no timer" means "up to a year", not "forever".
//
// A requested timer is clamped to one year from the script's ORIGINAL creation, not from
// this upload - otherwise a month-by-month re-publish would walk a script past the cap.
const STORE_HARD_CAP_MS = 365 * 24 * 60 * 60 * 1000;

async function expiresAtForUpload(env, body, id) {
    const requested = Number(body && body.expiresAt);
    if (!Number.isFinite(requested) || requested <= 0) return null;

    let anchor = Date.now();
    try {
        // sh_meta_<id>.at is written once and, like the service's created_at, is the
        // script's true age. Falling back to now() is the weaker but safe answer: it
        // can only shorten a requested lifetime, never lengthen it past the cap.
        const metaRaw = await env.LOADERS_KV.get(KV_META_PREFIX + id);
        if (metaRaw) {
            const at = Number(JSON.parse(metaRaw).at);
            if (Number.isFinite(at) && at > 0 && at < anchor) anchor = at;
        }
    } catch (e) { /* use now() */ }
    return Math.floor(Math.min(requested, anchor + STORE_HARD_CAP_MS) / 1000);
}

async function storeDelete(env, id, kind) {
    if (!STORE_ID_RE.test(String(id))) return false;
    const q = kind ? '?kind=' + encodeURIComponent(kind) : '';
    const out = await storeFetch(env, '/v1/objects/' + id + q, { method: 'DELETE' });
    if (out.unreachable) return false;
    return !!out.ok;
}

// STORAGE MUST SPLIT WHERE DELIVERY STOPS INLINING.
//
// putBlob used to split at CHUNK_THRESHOLD (~25 MB, a KV limit) while delivery
// inlines only up to INLINE_DELIVERY_MAX (6 MB, a DELIVERY limit). Anything in
// between - and a real script landed there at 18,592,590 bytes - was stored as
// one whole value with no parts, so it could neither be inlined nor chained and
// was refused. That is the same class of bug the constant block above warns
// about, in the opposite direction: two independent numbers with a gap between
// them.
//
// One number, derived from the delivery limit, so the gap cannot reopen.
// A chunk is also delivered as a single response, so sizing chunks at the
// inline cap is the same reasoning as capping the inline response there.
const CHUNK_DELIVERY_MAX = INLINE_DELIVERY_MAX;

async function putBlob(env, id, prefix, text) {
    const s = String(text);

    // R2, for anything past the inline ceiling. ONE object - no chunking,
    // no cmeta count to keep in step, and the 5 GB per-object ceiling is
    // far above anything a browser can be handed in one response anyway.
    //
    // At-rest encryption is applied first, exactly as it is for KV, so R2 is
    // not a plaintext-at-rest store that KV was not.
    if (r2Configured(env) && s.length > INLINE_DELIVERY_MAX) {
        const enc = !!kekConfigured(env);
        const body = enc ? await encryptAtRest(env, s) : s;
        await env.ARTIFACTS.put('a' + prefix + id, body);
        // n:1 so the existing chain machinery serves it as a single part
        // from /sh/c/<id>/0, and r2:1 so that part knows to read R2.
        await env.LOADERS_KV.put(KV_CMETA_PREFIX + prefix + id,
            JSON.stringify({ n: 1, len: s.length, enc: enc ? 1 : 0, r2: 1 }),
            { expirationTtl: LOADER_TTL });
        return { chunked: true, n: 1, len: s.length, encrypted: enc, r2: true };
    }
    const enc = !!kekConfigured(env);
    if (s.length <= CHUNK_DELIVERY_MAX) {
        // One value, and it fits in one response. Nothing left to fetch.
        await env.LOADERS_KV.put(prefix + id, enc ? await encryptAtRest(env, s) : s, { expirationTtl: LOADER_TTL });
        return { chunked: false, len: s.length, encrypted: enc };
    }
    const n = Math.ceil(s.length / CHUNK_DELIVERY_MAX);
    if (n > MAX_CHUNKS) throw new Error('too large');
    for (let i = 0; i < n; i++) {
        const part = s.slice(i * CHUNK_DELIVERY_MAX, (i + 1) * CHUNK_DELIVERY_MAX);
        await env.LOADERS_KV.put(KV_CHUNK_PREFIX + prefix + id + '_' + i,
            enc ? await encryptAtRest(env, part) : part, { expirationTtl: LOADER_TTL });
    }
    await env.LOADERS_KV.put(KV_CMETA_PREFIX + prefix + id, JSON.stringify({ n, len: s.length, enc: enc ? 1 : 0 }), { expirationTtl: LOADER_TTL });
    return { chunked: true, n, len: s.length, encrypted: enc };
}
async function getBlob(env, id, prefix) {
    // R2 first when bound. Checked BEFORE the KV single value because a
    // script re-uploaded after R2 was enabled exists in R2 and not in KV,
    // and the reverse would serve a stale KV copy forever.
    if (r2Configured(env)) {
        try {
            const obj = await env.ARTIFACTS.get('a' + prefix + id);
            if (obj) {
                const text = await obj.text();
                if (!isEncrypted(text)) return text;
                const r = await tryDecryptAtRest(env, text);
                if (!r.ok) { console.error('[ScripterHub] R2 decrypt failed: ' + r.error); return null; }
                return r.text;
            }
        } catch (e) {
            console.error('[ScripterHub] R2 read failed for ' + prefix + id + ': ' + (e && e.message));
        }
    }
    // legacy single value first
    const v = await env.LOADERS_KV.get(prefix + id);
    if (v !== null) {
        if (!isEncrypted(v)) return v;                 // legacy plaintext
        const r = await tryDecryptAtRest(env, v);
        // A marked value with no working KEK is REFUSED, not passed through.
        // Returning the raw "SHKEK1:..." string would look to the loader like
        // a corrupt script rather than a misconfigured operator, and the
        // failure would be reported as a user problem instead of a server one.
        if (!r.ok) {
            console.error('[ScripterHub] artifact at-rest decrypt failed: ' + r.error);
            return null;
        }
        return r.text;
    }
    // chunked? read the meta then every chunk in order
    const metaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + prefix + id);
    if (metaRaw === null) return null;
    let meta = {};
    try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
    const parts = [];
    for (let i = 0; i < meta.n; i++) {
        const c = await env.LOADERS_KV.get(KV_CHUNK_PREFIX + prefix + id + '_' + i);
        if (c === null) return null; // missing chunk = corrupted upload
        if (isEncrypted(c)) {
            const r = await tryDecryptAtRest(env, c);
            if (!r.ok) {
                console.error('[ScripterHub] chunk ' + i + ' at-rest decrypt failed: ' + r.error);
                return null;
            }
            parts.push(r.text);
        } else {
            parts.push(c);
        }
    }
    const joined = parts.join('');
    return joined.length === meta.len ? joined : null;
}
// token = HMAC-SHA256(secret = SHA256(key), msg = key|hwid|t0) hex[0..32].
//
// STILL FORGEDABLE BY THE CLIENT (gate G09, not yet closed): the "secret" is
// SHA-256("SHAUTH::" + key), i.e. it is derived from the license key, and the
// message is key|hwid|t0. Every one of those inputs is known to any client
// that already holds the key, so a client can compute this token offline
// without ever asking the server. The token therefore proves nothing that the
// key did not already prove, it is constant for a given (key, hwid, t0), and
// because t0 is baked into the shipped file it never changes.
//
// It is kept here ONLY so the legacy /sh/k path keeps working while Phase 3
// replaces it with a real server-side session (migrations/0001_init.sql,
// tables `sessions` + `nonces`). Do not add new callers. A proper token is
// server-side state: minted once, single-use, expiring, and verifiable only
// against the atomic state layer.
async function makeAuthToken(key, hwid, t0) {
    const enc = new TextEncoder();
    const secretDigest = await crypto.subtle.digest('SHA-256', enc.encode('SHAUTH::' + key));
    const secretKey = await crypto.subtle.importKey('raw', secretDigest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', secretKey, enc.encode(key + '|' + hwid + '|' + t0));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function verifyAuthToken(key, hwid, t0, token) {
    const want = await makeAuthToken(key, hwid, t0);
    return hashEqual(want, String(token || ''));
}
// The HMAC key for multi-part delivery grants (Phase 3).
//
// Reuses the session secret rather than introducing a fourth one. A grant is
// signed with a server-only value so it cannot be forged, and session tokens
// already have exactly that requirement, so a second secret would be a second
// thing to forget to set — and an unset secret is precisely how G19's
// fallback-forgery problem happened in the first place.
//
// Same degradation as sessionSecret(): a derived fallback so the route works
// on a deployment that has not set the secret yet, and a loud warning that
// says the property is not actually there.
async function grantSecret(env) {
    return await sessionSecret(env);
}

async function isKillswitchOn(env) {
    if (!env.LOADERS_KV) return false;
    try {
        const raw = await env.LOADERS_KV.get(KV_KILLSWITCH_KEY);
        return !!(raw && JSON.parse(raw).on);
    } catch (e) { return false; }
}
// auth decision for one license key at hwid; mutates nothing
function classifyLicense(rec, hwid, now, projectId) {
    if (!rec) return { code: 'invalid' };                      // no such key
    if (rec.banned) return { code: 'banned', reason: rec.banReason }; // blacklisted
    if (rec.expiresAt && rec.expiresAt <= now) return { code: 'expired' }; // expired
    if (rec.hwid && rec.hwid !== hwid) return { code: 'hwid' }; // shared key
    // A key bound to a project only opens scripts in that project.
    //
    // The comparison is done on trimmed, lower-cased strings so that a
    // key created with "MyProject" and a script published with "myproject"
    // still match. An empty rec.projectId means "every project", which is
    // what a key created before this existed - or one the owner left on All -
    // means. An empty projectId on the SCRIPT side must not fail closed: a
    // script published before this change carries no project, and refusing
    // those would lock every already-published key-system script out of every
    // already-issued key. That is the whole installed base, so it is checked
    // explicitly rather than assumed.
    const bound = String(rec.projectId || '').trim().toLowerCase();
    const asked = String(projectId || '').trim().toLowerCase();
    // A key bound to a specific project must match the script's project.
    // If the script carries no project, the binding cannot be satisfied —
    // refuse rather than fall through.
    if (bound && bound !== 'all') {
        if (!asked || bound !== asked) {
            return { code: 'project', reason: 'this key is for another project' };
        }
    }
    return { code: 'ok', rec: rec };
}
// ---------------------------------------------------------------------------
// TELEMETRY — metadata only, by construction.
//
// SECURITY: this function is the ONLY outbound webhook path, and it accepts a
// fixed set of metadata fields. It has no parameter that can carry source
// code, a license key, a Special Key, or artifact bytes, so "never log the
// secret" is a property of the signature rather than a rule at the call site.
//
// It replaced two functions that did leak:
//   notifyDiscord()      appended the PLAINTEXT source as a .lua attachment
//                        on every single upload
//   notifyAuthDiscord()  posted every valid LICENSE KEY in cleartext
// Both are treated as credentials-in-a-third-party-service, so neither is
// acceptable regardless of who can read the Discord channel.
//
// Identifiers are hashed rather than sent raw. An operator can correlate
// "the same key failed 40 times" without the log becoming a credential store
// in its own right, and without a leaked webhook URL exposing working keys.
// ---------------------------------------------------------------------------

// Whitelist. Anything not named here cannot be emitted, no matter what a
// caller passes. This is the enforcement point.
const TELEMETRY_FIELDS = [
    'event', 'outcome', 'scriptId', 'userRef', 'licenseRef', 'sessionId',
    'executor', 'reason', 'transport', 'ip', 'ua', 'at', 'bytes', 'parts'
];
// Never emitted, and stripped if a caller tries: the actual secrets.
const TELEMETRY_DENY = /^(code|source|plainCode|obfCode|normalCode|cipher|key|license|hwid|password|specialKey|paddedKey|token|secret)$/i;

function scrubTelemetryValue(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    const s = String(v);
    // keep it short and log-safe; never let a caller smuggle a blob through
    return s.replace(/[\r\n]+/g, ' ').slice(0, 120);
}

// A caller may legitimately pass something non-numeric in `at`; toISOString()
// throws RangeError on that, and this runs inside a request path.
function telemetryIso(ms) {
    const n = Number(ms);
    return new Date(Number.isFinite(n) && n > 0 ? n : Date.now()).toISOString();
}

function buildTelemetry(ev) {
    const out = {};
    for (const f of TELEMETRY_FIELDS) {
        if (TELEMETRY_DENY.test(f)) continue;   // belt and braces
        if (ev[f] !== undefined) out[f] = scrubTelemetryValue(ev[f]);
    }
    return out;
}

// Stable short reference for an identifier we must correlate on but not reveal.
async function telemetryRef(kind, value) {
    if (!value) return '';
    return kind + ':' + (await sha256Hex('SHTELE::' + kind + '::' + String(value))).slice(0, 12);
}

async function notifyAuthDiscord(env, result) {
    return notifyTelemetry(env, {
        event: result.ok ? 'auth.ok' : 'auth.denied',
        outcome: result.ok ? 'ok' : 'denied',
        scriptId: result.scriptId,
        // hashed, not the key itself
        licenseRef: await telemetryRef('lic', result.key),
        // HWID is a stable device fingerprint: hash it too
        userRef: await telemetryRef('hw', result.hwid),
        executor: result.executor,
        reason: result.reason || (result.ok ? 'valid' : 'unknown'),
        at: Date.now()
    });
}

async function notifyScriptDiscord(env, ev) {
    return notifyTelemetry(env, Object.assign({
        event: 'script.published',
        outcome: 'ok'
    }, ev));
}

async function notifyTelemetry(env, ev) {
    const url = env.SH_DISCORD_WEBHOOK;
    if (!url) return;                       // not configured: skip silently
    const meta = buildTelemetry(ev);
    const denyHit = Object.keys(ev).filter(k => TELEMETRY_DENY.test(k));
    if (denyHit.length) {
        // A caller tried to pass a secret. Refuse the whole event rather than
        // silently dropping fields, so the bug is visible in the logs.
        console.error('telemetry: refused event, denied fields: ' + denyHit.join(','));
        return;
    }
    const fields = Object.keys(meta)
        .filter(k => meta[k] !== '')
        .map(k => ({ name: k, value: '`' + meta[k] + '`', inline: true }));
    const payload = {
        username: 'ScripterHub',
        embeds: [{
            title: (meta.event || 'event') + ' - ' + (meta.outcome || 'ok'),
            color: meta.outcome === 'denied' ? 0xff3333 : (meta.outcome === 'error' ? 0xffaa33 : 0x00cc44),
            fields,
            footer: { text: 'ScripterHub telemetry (metadata only)' },
            timestamp: telemetryIso(meta.at)
        }]
    };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        // ---- WHY THIS IS HERE (Phase 3): the webhook "silently did nothing" ----
        //
        // The old code was `catch (e) {}`. Every failure mode looked identical
        // from the outside: no error, no log line, no event. A revoked webhook,
        // a typo in the URL, a rate limit returning 429, a 200 that was really
        // a Discord "this webhook was deleted" body — all of them produced
        // silence, so "the webhook doesn't work" had no way to be diagnosed.
        //
        // Now every non-2xx is reported, with the status Discord returned. That
        // is the single most useful line for working out whether the variable
        // is set, the URL is stale, or the channel is rate-limiting us.
        if (res && res.status >= 300) {
            let body = '';
            try { body = (await res.text()).slice(0, 200); } catch (e) {}
            console.error('[ScripterHub] telemetry webhook returned HTTP ' + res.status
                + ' for ' + (meta.event || 'event') + (body ? ' - ' + body : '')
                + ' (check the SH_DISCORD_WEBHOOK variable)');
        }
    } catch (e) {
        // Telemetry must never break a request, so this is still swallowed —
        // but it is no longer swallowed SILENTLY.
        console.error('[ScripterHub] telemetry webhook unreachable: ' + (e && e.message)
            + ' (check the SH_DISCORD_WEBHOOK variable)');
    }
}

// verify the login-session token (issued by /sh/login)
// Owner login session (issued by /sh/login).
//
// PHASE 1: the signature is a real HMAC over a server-only secret, and the
// access-code hash is no longer carried inside the token. Previously the token
// was base64({t, ch: <code hash>, k: sha256(ch+t)}), so the value used to
// validate it travelled inside it: one observed token was enough to mint
// unlimited valid ones for any future timestamp.
//
// The legacy shape is still accepted so tokens issued before this change stay
// usable for the remainder of their 12h TTL. That is not a new hole: a legacy
// token can only be minted by someone who already has a valid access code,
// because `ch` must match a configured code hash.
async function verifyToken(token, codeHashes, env) {
    const t = String(token || '');
    if (!t) return false;
    try {
        if (t.indexOf('.') > 0) {
            const parts = t.split('.');
            if (parts.length !== 2) return false;
            if (!(await verifySessionSignature(env, parts[0], parts[1]))) return false;
            const raw = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
            if (!raw || raw.kind !== 'owner') return false;
            if (Date.now() - raw.t > TOKEN_TTL) return false;
            if (!codeHashes.includes(String(raw.ch || ''))) return false;
            return true;
        }
        const raw = JSON.parse(atob(t));
        if (Date.now() - raw.t > TOKEN_TTL) return false;
        if (raw.k !== await sha256Hex(String(raw.ch) + raw.t)) return false;
        if (!codeHashes.includes(raw.ch)) return false;
        return true;
    } catch (e) { return false; }
}

// verify a USER session token (issued by /sh/user-login). Any registered
// account can claim loadstrings for its own scripts - the owner access
// code is no longer required for normal users.
// PHASE 1: the token is signed with the server-only secret, and it no longer
// CONTAINS the stored password hash. That was the worst property of the old
// format: the token was base64, so any log entry, proxy capture or browser
// history entry holding a session token also handed over the credential.
//
// `pwd` is a keyed fingerprint of the current password-hash generation, so
// changing a password invalidates outstanding tokens rather than leaving them
// valid for the rest of the TTL. The legacy branch is kept so tokens issued
// before this change keep working until they expire.
async function verifyUserToken(token, env) {
    const t = String(token || '');
    if (!t) return null;
    try {
        let raw;
        if (t.indexOf('.') > 0) {
            const parts = t.split('.');
            if (parts.length !== 2) return null;
            if (!(await verifySessionSignature(env, parts[0], parts[1]))) return null;
            raw = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
        } else {
            raw = JSON.parse(atob(t));
            if (raw.k !== await sha256Hex(String(raw.ch) + raw.t)) return null;
        }
        if (!raw || raw.kind !== 'user') return null;
        if (Date.now() - raw.t > TOKEN_TTL) return null;
        const rec = await loadUserRecord(env, raw.e);
        if (!rec) return null;
        if (raw.pwd) {
            const want = await credentialFingerprint(env, String(rec.password || ''));
            if (!hashEqual(want, String(raw.pwd))) return null;
        } else if (String(rec.password || '') !== String(raw.ch)) {
            return null;
        }
        if (rec.disabled) return null;
        return rec;
    } catch (e) { return null; }
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: CORS_HEADERS
    });
}

// ---------- the loader we hand out ----------
//
// ONE LINE, and it is one line on purpose:
//
//     loadstring(game:HttpGet("https://host/sh/ScripterHub1234567890"))()
//
// That is the whole thing the owner pastes into their executor. The URL is
// public and permanent (D6) and it carries no authorization value on its own:
// anyone can open it, and what comes back is the INIT LAYER - a protocol
// bootstrap with no ciphertext, no key and no artifact material in it.
//
// WHY ONE LINE, WHEN THE PREVIOUS SHAPE WAS FIFTEEN:
//
// The fifteen-line version did two jobs at once: fetch the init layer, and
// cache it on disk so a re-run costs no network round trip. The caching is now
// the init layer's own business - it is the thing that knows what it is
// allowed to keep - and what is left for the pasteable line is a fetch. A
// fetch is one line.
//
// THE THREE LAYERS, AS THE OWNER SEES THEM:
//
//   L1  loadstring(game:HttpGet(".../sh/<id>"))()   <- what the owner pastes
//   L2  the init layer: _bsdata0 + the cdn link + the licensed handshake
//   L3  the artifact behind that link: the obfuscated program itself
//
// L2 is what a deobfuscator sees if it follows the URL, and it is deliberately
// READABLE - the same property Luarmor's init file has. A reader learns the
// protocol, which is public by design, and learns nothing about any
// particular artifact.
//
// WHY request COMES FIRST IN THE PORTABLE VARIANT:
//   * at least one executor in circulation throws
//         invalid argument #1 to find (string expected, got nil)
//     from inside its own game:HttpGet, before any request is made. Its HttpGet is
//     hardcoded to a nil. loadstring(game:HttpGet(url))() cannot work there, which is
//     why that exact one-liner used to be a portability bug. Trying `request` first is
//     what makes this line work on that executor anyway.
//   * the header matters for BOTH paths: game:HttpGet stamps a genuine Roblox UA, but a
//     bare request() call does not, and without an executor-looking UA the worker
//     answers with HTML rather than the init layer.
//
// So the portable line is request+UA first, then HttpGet. One line, both
// fallbacks, no silent HTML. The plain line is the default because it is what
// the owner asked for and what a Luarmor user expects to see; the portable one
// is offered NEXT TO it, not instead of it.
//
// What the plain line must never become: a second route to artifact bytes. It
// only ever fetches /sh/<id>, which serves the init layer - no ciphertext, no
// key, no split key, identical for every script (D6/G01). The bytes still
// leave the worker through deliver() alone (D12/G0x).
function shLoader(base, id) {
    const u = base + '/sh/' + id;
    return 'loadstring(game:HttpGet("' + u + '"))()';
}

// The portable twin of shLoader: same URL, same one line, but it tries
// request() first so it survives an executor whose game:HttpGet throws.
function shLoaderPortable(base, id) {
    const u = base + '/sh/' + id;
    const q = JSON.stringify(u);
    return 'loadstring((request and request({Url=' + q + ',Method="GET",Headers={["User-Agent"]="Roblox/570 Delta Executor"}}).Body) or game:HttpGet(' + q + '))()';
}

// "Method Not Allowed" page — what browsers see when opening a loader link
function methodNotAllowed() {
    return new Response('Method Not Allowed\n', {
        status: 405,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

// generate the random 10 digits: ScripterHub(1234567890). A caller-supplied
// wantId (must match the same shape) is honored so the split-key URL baked
// into an obfuscated file points at the id the upload will actually use.
// Resolve the script id for an upload.
//
// PHASE 1 CHANGE: a client-supplied `wantId` is only honoured when the caller
// owns the existing script (or is the owner). Previously ANY authenticated
// user could pass someone else's id and overwrite their artifact, because
// nothing checked the target's ownership. The id space is only 10 digits, so
// it is enumerable, and the "one user clobbers another user's script" case is
// a real integrity problem rather than a theoretical one.
//
// wantId still exists because the split-key URL is baked into the obfuscated
// file at build time, so re-uploading under a fresh id would orphan the key
// request and produce an undecryptable script.
async function loaderId(wantId, env, authedUser) {
    const w = String(wantId || '');
    if (!/^ScripterHub[0-9]{6,16}$/.test(w)) {
        let d = '';
        // A SCRIPT ID IS 10 RANDOM DIGITS FROM A CSPRNG.
        //
        // This used to be Math.floor(Math.random() * 10) in a loop. Math.random
        // is not a CSPRNG and, in a Worker, is per-isolate - so two concurrent
        // requests could draw the same id and silently overwrite a script, and
        // an attacker could predict an id by sampling. tools/script_id_test.mjs
        // only covered main.js, so this sat there passing.
        //
        // crypto.getRandomValues is a global in Workers, so this needs no binding
        // and no import - which also keeps the single-file rule (D21).
        const ib = new Uint8Array(8);
        crypto.getRandomValues(ib);
        let iv = 0n;
        for (let i = 0; i < ib.length; i++) iv = (iv << 8n) | BigInt(ib[i]);
        return 'ScripterHub' + (iv % 10000000000n).toString().padStart(10, '0');
    }
    // Not yet taken: nothing to protect.
    const existing = env && env.LOADERS_KV ? await env.LOADERS_KV.get(KV_META_PREFIX + w) : null;
    if (existing === null) return w;
    let owner = '';
    try { owner = String((JSON.parse(existing) || {}).user || ''); } catch (e) { owner = ''; }
    const caller = String(authedUser || '');
    const isOwnerRole = !!(env && env.SH_OWNER_CODE_HASH) || caller.toLowerCase() === OWNER_EMAIL;
    if (owner && caller && owner.toLowerCase() === caller.toLowerCase()) return w;   // owner re-uploading their own
    if (isOwnerRole) return w;                                                        // site owner
    // Refuse rather than silently minting a new id: a caller that asked for a
    // specific id and was refused should be told, not handed a working
    // loadstring for a different script than the one it intended to publish.
    return null;
}

// REMOVED: notifyDiscord(env, username, scriptName, normalCode, obfCode)
// This appended the PLAINTEXT source (<name>_normal.lua) and the obfuscated
// code to the Discord webhook on every upload. That made Discord a third-party
// store of the customer's source and gave anyone who obtained the webhook URL
// a full dump of every script ever published. It is replaced by
// notifyScriptDiscord() above, which takes metadata only.

export default {
    async fetch(request, env, ctx) {
        try {
            return await handleRequest(request, env, ctx);
        } catch (e) {
            // GLOBAL SAFETY NET: an uncaught error used to produce a blank
            // 500 with NO CORS headers - the browser swallowed it and the
            // site just showed "fetch failed" (the loadstring outage).
            // Every error now returns readable JSON with CORS.
            return new Response(JSON.stringify({ ok: false, error: 'worker error: ' + String(e && e.message ? e.message : e).slice(0, 300) }), {
                status: 500,
                headers: CORS_HEADERS
            });
        }
    },

    // -----------------------------------------------------------------------
    // CRON: the janitor (Phase 3.2)
    // -----------------------------------------------------------------------
    //
    // Every table the state layer writes is append-or-update, so all of them
    // grow without bound: sessions, nonces, rate_limits, audit_log,
    // revocations. None is read except by explicit id or by a current window,
    // which means old rows are pure cost. They inflate the database, they slow
    // the indices, and they eventually make every write slower — a slow-motion
    // outage that nobody diagnoses because nothing is actually broken.
    //
    // This used to be listed as an open item with a function written and
    // nothing calling it, which is the same as not having it: the tables grew
    // either way and the function was documentation of a wish.
    //
    // Wired to a Cloudflare cron trigger (see [triggers] in wrangler.toml).
    // Runs on a schedule, not on a request, because sweeping on the request
    // path would put a multi-table DELETE in front of somebody trying to run
    // a script.
    async scheduled(event, env, ctx) {
        const started = Date.now();
        const state = stateFor(env);
        if (!state) {
            // Not an error condition to shout about: a deployment without D1
            // has nothing to sweep, and the delivery gate is already refusing
            // loudly for that same reason.
            console.warn('[ScripterHub] cron: no state layer, nothing to sweep');
            return;
        }
        try {
            const out = await state.sweepExpired(started);
            console.log('[ScripterHub] cron sweep: ' + JSON.stringify(out) + ' in ' + (Date.now() - started) + 'ms');
            // Non-zero counts are worth surfacing: a sweeper that suddenly
            // deletes 200k rows means something was not running before, and
            // that is a signal in itself.
            ctx.waitUntil(notifyTelemetry(env, {
                event: 'cron.sweep', outcome: 'ok',
                reason: 'sessions=' + out.sessions + ' nonces=' + out.nonces
                    + ' rateLimits=' + out.rateLimits + ' audit=' + out.audit,
                at: started
            }));
        } catch (e) {
            // A failed sweep is not fatal — the tables keep working, they just
            // keep growing — so this is logged and not rethrown. Rethrowing
            // would mark the cron invocation failed and Cloudflare would
            // retry, multiplying the load of a job that is already unhealthy.
            console.error('[ScripterHub] cron sweep FAILED: ' + (e && e.message));
        }
    }
};

async function handleRequest(request, env, ctx) {
        const url = new URL(request.url);

        // load persisted stat counters once per isolate (fire-and-forget)
        loadStatsOnce(env);

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        // ================= HIDDEN LOADER HOST =================

        // ---------- GET /sh/kv-selftest : DIAGNOSTIC, reports what THIS worker reads ----------
        //
        // Added while login was failing on a deployment whose bindings appeared
        // correct in the dashboard and in the Cloudflare API, while the worker
        // behaved as though the namespace held nothing. Every external check
        // agreed with every other external check and all of them disagreed with
        // the worker, and no amount of reading it from outside could say which
        // one was wrong.
        //
        // This endpoint answers it from the only vantage point that is not
        // outside: inside the worker, using the same binding and the same code
        // path a login uses.
        //
        // IT REPORTS SHAPE, NOT CONTENT. No email, no username, no password
        // hash, no record body - only key names it already holds the name of,
        // byte counts, and booleans. That keeps it safe to leave in place: it
        // can be called by anyone and it discloses nothing about an account.
        // If it ever needs removing it is one self-contained block.
        if (url.pathname === '/sh/kv-selftest' && request.method === 'GET') {
            const out = { ok: true, hasKV: !!env.LOADERS_KV, legacyBlob: null, perUserKeys: null, ownerReadable: null, sample: [] };
            if (!env.LOADERS_KV) return jsonResponse(out);

            // 1. the legacy blob: length only.
            try {
                const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
                out.legacyBlob = raw === null ? 'ABSENT' : ('present, ' + raw.length + ' bytes');
                if (raw) {
                    try { out.legacyBlobAccounts = Object.keys(JSON.parse(raw) || {}).length; } catch (e) { out.legacyBlobAccounts = -1; }
                }
            } catch (e) { out.legacyBlob = 'THREW: ' + String(e && e.message).slice(0, 120); }

            // 2. how many per-user keys does the LIST see?
            try {
                const page = await env.LOADERS_KV.list({ prefix: USER_PREFIX, limit: 1000 });
                const names = (page.keys || []).map(k => k.name);
                out.perUserKeys = names.length;
                out.sample = names.slice(0, 3).map(n => n.replace(USER_PREFIX, '') + '…');
            } catch (e) { out.perUserKeys = 'THREW: ' + String(e && e.message).slice(0, 120); }

            // 3. can it read ONE known record through the login path? Shape only.
            try {
                const rec = await loadUserRecord(env, OWNER_EMAIL);
                out.ownerReadable = rec ? ('yes, password field is ' + (String(rec.password || '').slice(0, 7)) + '…') : 'NO RECORD FOUND';
                out.ownerHasUsername = rec ? !!rec.username : false;
            } catch (e) { out.ownerReadable = 'THREW: ' + String(e && e.message).slice(0, 120); }

            // 4. what the login lookup actually resolves for a known key.
            try {
                const direct = await env.LOADERS_KV.get(userKvKey(OWNER_EMAIL));
                out.directOwnerKey = direct === null ? 'get() returned NULL' : ('readable, ' + direct.length + ' bytes');
            } catch (e) { out.directOwnerKey = 'THREW: ' + String(e && e.message).slice(0, 120); }

            // 5. A SECOND namespace binding, for identifying which store the
            // running worker is really using.
            //
            // The symptom being chased: every external check agreed the worker
            // was bound to namespace b65a64ae, and the running worker read a
            // different store (31 accounts) than the one wrangler wrote to (70).
            // Two values cannot coexist at one key in one namespace, so one of
            // those readings was wrong and nothing outside the worker could say
            // which.
            //
            // So bind the SAME namespace a second time, under a different name,
            // and read both. If they disagree, the dashboard's namespace and
            // wrangler's id are not the same thing and the mismatch is finally
            // located. If they agree, the fault is in the cache and not in the
            // binding, which rules out a whole class of wrong repairs.
            //
            // It is additive on purpose: nothing that already works is touched,
            // and the second binding can be deleted the moment it has answered.
            const alt = env.LOADERS_KV_ALT;
            if (alt) {
                try {
                    const rawAlt = await alt.get(USERS_KV_KEY);
                    out.altBlob = rawAlt === null ? 'ABSENT' : ('present, ' + rawAlt.length + ' bytes');
                } catch (e) { out.altBlob = 'THREW: ' + String(e && e.message).slice(0, 120); }
                try {
                    const pageAlt = await alt.list({ prefix: USER_PREFIX, limit: 1000 });
                    out.altUserKeys = (pageAlt.keys || []).length;
                } catch (e) { out.altUserKeys = 'THREW: ' + String(e && e.message).slice(0, 120); }
                try {
                    const directAlt = await alt.get(userKvKey(OWNER_EMAIL));
                    out.altOwnerKey = directAlt === null ? 'get() returned NULL' : ('readable, ' + directAlt.length + ' bytes');
                } catch (e) { out.altOwnerKey = 'THREW: ' + String(e && e.message).slice(0, 120); }
            } else {
                out.altBlob = 'no LOADERS_KV_ALT binding';
            }

            return jsonResponse(out);
        }

        // ---------- POST /sh/kv-repair : ONE-TIME. rebuilds per-email keys FROM the worker's own blob ----------
        //
        // WHY THIS EXISTS, AND WHY IT HAS TO BE THE WORKER THAT RUNS IT
        //
        // The deployment turned out to have two independent views of "the" user
        // table: one holding 70 accounts, one holding 31, at the same namespace
        // id. Binding the same namespace a second time read the 31, so the
        // difference was never the binding - it was which store the running
        // worker actually uses. That store can only be read from inside the
        // worker, which is why this route exists at all: an outside migration
        // tool would have been writing to the wrong table, which is exactly the
        // mistake that cost this deployment its users in the first place.
        //
        // It migrates blob -> per-email keys and DELETES every stray key that is
        // not in the blob. That delete is the point: a stale per-email record
        // shadows the blob in loadUserRecord(), so an account whose password
        // changed in the blob but not in the key can never sign in again.
        //
        // GATED BY A ONE-TIME SECRET, and the secret is stored only as a SHA-256
        // so it is not recoverable from the deployed source. Without it, anyone
        // could wipe the user table by calling this. It is compared in constant
        // time, and the plaintext is never written to a log or a KV value.
        if (url.pathname === '/sh/kv-repair' && request.method === 'POST') {
            const REPAIR_SHA = '2b2df295afdd8aa320b4ba16946a68d9bbf5b618f9eecc011c0b44c1c22a0888';
            let supplied = '';
            try {
                const b = await request.json();
                supplied = String((b && b.secret) || '');
            } catch (e) {}
            // HASH IT FIRST. hashEqual() compares two strings byte for byte, and it
            // was being handed the RAW secret on one side and the stored SHA-256
            // on the other, so the comparison could never succeed and every call
            // returned 401 - which is indistinguishable from a wrong secret.
            // The stored value is a digest and the caller sends plaintext, so the
            // only correct comparison is digest against digest.
            const suppliedHash = supplied ? await sha256Hex(supplied) : '';
            if (!suppliedHash || !hashEqual(suppliedHash, REPAIR_SHA)) {
                return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            }

            const out = { ok: true, migrated: 0, deleted: 0, blobAccounts: 0, failed: [] };
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound.' }, 500);

            let blob = {};
            try {
                const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
                blob = raw ? (JSON.parse(raw) || {}) : {};
            } catch (e) {
                return jsonResponse({ ok: false, error: 'legacy blob unreadable: ' + String(e && e.message).slice(0, 120) }, 500);
            }
            out.blobAccounts = Object.keys(blob).length;

            // 1. write one key per account from the blob
            for (const email of Object.keys(blob)) {
                const rec = blob[email];
                if (!rec || typeof rec !== 'object') continue;
                try { await putUserRecord(env, rec); out.migrated++; }
                catch (e) { out.failed.push(email + ': ' + String(e && e.message).slice(0, 80)); }
            }

            // 2. delete per-email keys that the blob does NOT contain. Without
            //    this a shadowing record makes an account permanently unloginable.
            try {
                let cursor = null, guard = 0;
                do {
                    const page = await env.LOADERS_KV.list({ prefix: USER_PREFIX, cursor: cursor || undefined, limit: USERS_LIST_MAX });
                    for (const k of (page.keys || [])) {
                        const email = k.name.slice(USER_PREFIX.length);
                        if (blob[email]) continue;
                        await env.LOADERS_KV.delete(k.name).catch(() => {});
                        out.deleted++;
                    }
                    cursor = page.list_complete ? null : page.cursor;
                    if (++guard > 20) { cursor = null; break; }
                } while (cursor);
            } catch (e) { out.failed.push('delete pass: ' + String(e && e.message).slice(0, 80)); }

            // 3. prove the owner can now be read back through the login path
            try {
                const rec = await loadUserRecord(env, OWNER_EMAIL);
                out.ownerNowReadable = rec ? ('yes, ' + String(rec.username || '?') + ' / plan ' + String(rec.plan || '?')) : 'NO';
            } catch (e) { out.ownerNowReadable = 'THREW'; }

            return jsonResponse(out);
        }

        // ---------- GET /sh/health ----------
        if (url.pathname === '/sh/health') {
            const setAt = env.LOADERS_KV ? await env.LOADERS_KV.get(CODE_SET_KEY) : null;
            // Phase 3: report the state layer explicitly. "loaders": true with
            // no D1 is a DELIVERY OUTAGE, not a healthy system, because the
            // gate refuses everything when the state layer is missing. An
            // operator must be able to tell those two states apart from here.
            const hasState = !!stateFor(env);
            return jsonResponse({
                ok: true,
                loaders: !!(env.LOADERS_KV),
                stateLayer: hasState,
                delivery: hasState ? 'session-gated' : 'REFUSING (bind SH_DB + apply migrations/0001_init.sql)',
                webhook: !!env.SH_DISCORD_WEBHOOK,
                // At-rest encryption is OPTIONAL, so this reports which of the
                // three states you are in. "on" and "off" both work; the
                // dangerous one is having marked artifacts on disk with no KEK
                // to read them, and that shows up as a decrypt failure in the
                // log plus refused deliveries, not here.
                artifactCrypto: kekConfigured(env) ? 'on' : 'off',
                legacyWindow: legacySplitKeyEnabled(env) ? 'OPEN' : 'closed',
                codeSet: !!setAt,
                at: Date.now(),
                state: hasState ? await stateFor(env).stats().catch(() => null) : null
            });
        }

        // ---------- POST /sh/owner-claim : ONE-TIME reveal of the owner code ----------
        // Body: { setupToken }  - setupToken = your SH_SETUP_TOKEN secret.
        //
        // WHY THIS EXISTS
        // A deployment created before Phase 1 has no owner access code, and the
        // hard-coded "ScripterHub" default has been removed. Without a way to
        // obtain a code, that deployment would be locked out of its own admin
        // panel. This endpoint mints one, returns it ONCE, and forgets it.
        //
        // SECURITY PROPERTIES, and they are the whole point of the design:
        //   * the plaintext is NEVER logged. Cloudflare retains worker logs and
        //     anyone with dashboard access can read them, so a credential in a
        //     log is a permanently exposed credential no matter how briefly it
        //     was printed. It exists only in this HTTP response.
        //   * only the SHA-256 is persisted, so the KV namespace never holds it.
        //   * gated on SH_SETUP_TOKEN, which the operator sets as a Worker
        //     secret, so reaching the endpoint is not enough.
        //   * strictly single-use: the code record is deleted as it is read, and
        //     the bootstrap marker prevents re-minting. A second call with a
        //     valid setup token returns { ok: true, alreadyClaimed: true } and
        //     no secret.
        //   * no-store and no CORS, so the response is not cached by any
        //     intermediary and cannot be read cross-origin by a page.
        //
        // Run it once, save the code somewhere safe, then you can disable it by
        // removing the route. To rotate later, use /sh/setcode.
        if (url.pathname === '/sh/owner-claim' && request.method === 'POST') {
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound.' }, 500);
            if (!env.SH_SETUP_TOKEN) {
                return jsonResponse({ ok: false, error: 'SH_SETUP_TOKEN is not set, so this endpoint cannot be authorized. Set it first.' }, 401);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const supplied = String(body.setupToken || '');
            if (!supplied || !hashEqual(supplied, String(env.SH_SETUP_TOKEN))) {
                // Deliberately vague: do not confirm whether the token was close.
                return new Response(JSON.stringify({ ok: false, error: 'Not authorized.' }), {
                    status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
            const existing = await env.LOADERS_KV.get(CODE_KV_KEY);
            if (existing) {
                // Already has a code. Never re-reveal it: we only stored the hash,
                // so it cannot be recovered even by us.
                return new Response(JSON.stringify({ ok: true, alreadyClaimed: true, hint: 'A code already exists and cannot be shown again. Use /sh/login, or set a new one via /sh/setcode.' }), {
                    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
            const code = await bootstrapOwnerCode(env);
            if (!code) {
                return new Response(JSON.stringify({ ok: false, error: 'Could not mint a code. Check KV binding.' }), {
                    status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
            // This response body is the ONLY place the plaintext ever exists.
            // It is not logged, not stored, and not cached.
            return new Response(JSON.stringify({
                ok: true,
                code: code,
                warning: 'This is shown ONCE and is not stored in readable form. Save it now. It is not in the worker logs.'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' }
            });
        }

        // ---------- POST /sh/setcode : set / rotate the owner access code ----------
        // Body: { setupToken, code }  - setupToken = your SH_SETUP_TOKEN secret.
        //
        // PHASE 1: this used to ADD an extra code while the hard-coded default
        // "ScripterHub" kept working. The default is gone, so this is now the
        // normal way to set or rotate the code, and it REPLACES any existing
        // one. Use it to rotate, or to take over from /sh/owner-claim.
        // Only the SHA-256 is stored, never the plaintext.
        if (url.pathname === '/sh/setcode' && request.method === 'POST') {
            // Tight bucket: this route can lock the owner out of their own
            // account, so it is limited hard on the setup token.
            {
                const rl = rateLimit('setcode', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV first (Settings > Bindings).' }, 500);
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const setupToken = String(body.setupToken || '');
            if (!env.SH_SETUP_TOKEN) {
                return jsonResponse({ ok: false, error: 'SH_SETUP_TOKEN secret is MISSING in worker settings. Go to Settings > Variables and Secrets > add Secret named exactly "SH_SETUP_TOKEN", then re-deploy and try again.' }, 401);
            }
            if (setupToken !== env.SH_SETUP_TOKEN) {
                return jsonResponse({ ok: false, error: 'Invalid setup token (does not match the SH_SETUP_TOKEN secret).' }, 401);
            }
            const code = String(body.code || '');
            if (code.length < 8) return jsonResponse({ ok: false, error: 'Code too short (min 8 chars).' }, 400);
            if (code.length > 100_000) return jsonResponse({ ok: false, error: 'Code too large (max 100k chars).' }, 413);
            // store ONLY the hash - the code itself is never saved
            const hash = await sha256Hex(code);
            await env.LOADERS_KV.put(CODE_KV_KEY, JSON.stringify({ hash }));
            await env.LOADERS_KV.put(CODE_SET_KEY, String(Date.now()));
            return jsonResponse({ ok: true, len: code.length, setAt: Date.now() });
        }

        // ---------- POST /sh/login : owner login for hidden raw page ----------
        // Body: { code }. Accepted codes: the default "ScripterHub" plus any
        // optional extra code set via /sh/setcode. The worker hashes the
        // supplied code and compares against the valid hashes. Codes are
        // never stored anywhere - only hashes.
        if (url.pathname === '/sh/login' && request.method === 'POST') {
            // Access-code brute force. Keyed on IP only: the caller has no
            // proven identity yet, and the code is the thing being guessed.
            {
                const rl = rateLimit('login', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) {}
            const codeHashes = await getCodeHashes(env);
            const supplied = String(body.code || '');
            const suppliedHash = await sha256Hex(supplied);
            // constant-time-ish compare
            let matched = null;
            for (const h of codeHashes) {
                if (suppliedHash.length === h.length) {
                    let diff = 0;
                    for (let i = 0; i < h.length; i++) diff |= suppliedHash.charCodeAt(i) ^ h.charCodeAt(i);
                    if (diff === 0) { matched = h; break; }
                }
            }
            if (!matched) {
                return jsonResponse({ ok: false, error: 'Invalid access code.' }, 401);
            }
            // Hand out a short-lived session token.
            //
            // PHASE 1: signed with HMAC-SHA256 under SH_SESSION_SECRET instead
            // of a checksum derived from the access-code hash carried INSIDE
            // the token. The old shape was self-certifying, so observing one
            // valid token was enough to forge unlimited future ones. The code
            // hash is still referenced (so rotating the code invalidates live
            // sessions) but it is no longer what makes the token genuine.
            const now = Date.now();
            const token = await signSessionToken(env, { kind: 'owner', ch: matched, t: now });
            return jsonResponse({ ok: true, token, ttl: TOKEN_TTL });
        }

        // ---------- POST /sh/upload : store ENCRYPTED script + notify Discord ----------
        // Body: { token, name, user, cipher, keyHash, normalCode }.
        // The browser encrypts the script with the Special Key BEFORE
        // uploading (sh-crypto.js) - the worker NEVER sees the key or the
        // plaintext. keyHash (SHA-256 of the key) is optional metadata.
        if (url.pathname === '/sh/upload' && request.method === 'POST') {
            // Pre-auth bucket keyed on IP. It bounds the cost of an unauthenticated
            // flood before any KV write or hashing happens. After the identity is
            // proven below, a second bucket keyed on that identity is consumed, so
            // a valid account cannot be used to publish without limit either.
            {
                const rl = rateLimit('upload', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            // Auth: an owner session token (from /sh/login) OR any registered
            // user's session token (from /sh/user-login). Normal users can
            // claim loadstrings without the owner access code.
            //
            // `authedUser` is the identity the TOKEN proves. It is deliberately
            // separate from the boolean `authed` because Phase 1 needs the real
            // principal to stop trusting body.user and to enforce ownership.
            const codeHashes = await getCodeHashes(env);
            let authed = false;
            let authedUser = null;
            let authedRole = null;
            const ownerTok = (request.headers.get('X-SH-Token') || '') || (body && body.token) || '';
            if (await verifyToken(ownerTok, codeHashes, env)) {
                authed = true;
                authedRole = 'owner';
                authedUser = OWNER_EMAIL;
            }
            if (!authed && body.userToken) {
                const u = await verifyUserToken(body.userToken, env);
                if (u) {
                    authed = true;
                    authedRole = (u.role === 'owner' || String(u.email || '').toLowerCase() === OWNER_EMAIL) ? 'owner' : 'user';
                    authedUser = String(u.email || u.username || '').slice(0, 100);
                }
            }
            // REMOVED (Phase 1): the `ownerProof` branch, which accepted the
            // base64 owner password as an alternative to a session token. See
            // isOwnerRequest() for why a password in a request is not an
            // acceptable admin credential.
            if (!authed) {
                return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            }
            // Second bucket, now keyed on the PROVEN identity. Separate from the
            // pre-auth bucket so a shared IP (office, school, hosting) does not
            // let one user exhaust another's publish budget.
            {
                const rl = rateLimit('upload', rateIdentity(request, url, authedUser));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV (see worker comments).' }, 500);
            const name = String(body.name || 'script').slice(0, 100);
            // The authenticated identity, not a client-supplied string.
            //
            // `body.user` used to be trusted verbatim, so any authenticated
            // user could publish a script attributed to anyone, poisoning the
            // telemetry and any future per-user authorization. The upload path
            // records the real owner below instead.
            const claimedUser = String(body.user || '').slice(0, 100);
            const user = authedUser || claimedUser || 'unknown';
            const id = await loaderId(body.wantId, env, authedUser);
            if (id === null) {
                return jsonResponse({ ok: false, error: 'Not authorized to publish to that script id. Pick a new one.' }, 403);
            }
            // ---- SPLIT-KEY (anti-static-peel): the obfuscated file is
            // missing its final layer key; store the padded key + t0 here
            // so the runtime can fetch it (executor-only, time-locked).
            if (body.splitKey && Array.isArray(body.splitKey.paddedKey) && body.splitKey.paddedKey.length) {
                const sk = {
                    paddedKey: body.splitKey.paddedKey.map(n => n & 0xFF),
                    t0: Number(body.splitKey.t0) || 0,
                    chk: Number(body.splitKey.chk) || 0
                };
                if (sk.t0 < 1 || sk.chk < 1) return jsonResponse({ ok: false, error: 'splitKey.t0/chk required' }, 400);
                await env.LOADERS_KV.put(KV_SKEY_PREFIX + id, JSON.stringify(sk), { expirationTtl: LOADER_TTL });
                // PHASE 4 — record the build so t0 becomes rotatable.
                //
                // Every re-upload carries a FRESH t0 (the obfuscator generates
                // one per build), and that is the whole mechanism: the split
                // key record now holds the newest t0, so the previous build's
                // t0 matches nothing and its files stop unlocking. Before this
                // the row existed but nothing wrote it, so `generation` was
                // always 0 and t0 was permanent — a credential that could
                // never be revoked.
                //
                // This is deliberately NOT a silent rotation of everything
                // already published. Re-uploading a script id kills the
                // previous build's files, which is the point, but it is also
                // why the owner should treat a re-upload as a rotation and
                // re-issue loadstrings. The audit trail records both.
                if (stateFor(env) && typeof body.buildId === 'string' && /^ScripterHub[0-9]{6,16}$/.test(id)) {
                    try {
                        const st = stateFor(env);
                        const gen = await st.nextGeneration(id);
                        // The scripts row must exist BEFORE the build row:
                        // build_versions.script_id is a foreign key, and the
                        // splitKey block runs ahead of the meta write further
                        // down this route. Without this the insert fails on the
                        // FK, and the failure surfaces as a rejected upload
                        // rather than as the missing row it actually is.
                        await ensureScriptRow(st, id, {
                            user, name, visibility: readVisibility(body),
                            authRequired: body.authRequired === true
                        }, Date.now());
                        await st.recordBuild({
                            id: body.buildId.slice(0, 64) || ('b_' + id + '_' + gen),
                            scriptId: id, generation: gen,
                            // The schema's artifact_id is NOT NULL and is meant
                            // to name the KV key holding the bytes, so it is
                            // NOT NULL in practice: there is always one, even
                            // for a chunked or GitHub-backed script, because the
                            // manifest and the parts are both addressed from it.
                            // Passing null here is a NOT NULL violation, and it
                            // surfaced as a rejected upload rather than as a
                            // clear "you forgot a field".
                            artifactId: KV_PREFIX + id,
                            now: Date.now()
                        });
                        await st.retireOlder(id, gen, Date.now());
                        await st.audit({
                            event: 'build.published', outcome: 'ok', scriptId: id,
                            reason: 'generation=' + gen, at: Date.now()
                        });
                    } catch (e) {
                        console.error('[ScripterHub] build record failed: ' + (e && e.message));
                    }
                }
            }
            // ---- KEYLESS (free) scripts ----
            // Executor blob (plainCode) = the obfuscated code, served to
            // executors with NO key (free = anyone can run). Browser view
            // (cipher) = the SAME code encrypted with the owner's Special Key,
            // so the website key page requires the key to show it.
            // normalCode is ONLY for the Discord attachment (7MB cap there)
            // - never let a giant raw source bloat the request body.
            const normalCode = String(body.normalCode || '').slice(0, 7_000_000);
            // A KEYLESS UPLOAD MUST STILL STORE THE SPLIT KEY.
            //
            // Since D29 every build - keyless included - is compiled with a
            // serverKey, so the artifact's last layer is encrypted with the
            // padded key and those bytes are NOT in the file. The only copy is
            // served here, behind a session, and handed to the artifact through
            // __SH_SPLITKEY.
            //
            // The keyless branch never stored one, so delivery found no key and
            // fell back to SHL - a plain body with no key line. The artifact
            // then went to its own /sh/k fallback, which requires a session it
            // does not have, and died with:
            //
            //     [ScripterHub] Key response too short
            //
            // That is the whole failure. Not a big script, not chunking - a
            // free script built to need a key that was never saved. The paid
            // path above has always stored it; this branch had no equivalent.
            if (body.splitKey && Array.isArray(body.splitKey.paddedKey) && body.splitKey.paddedKey.length) {
                await env.LOADERS_KV.put(KV_SKEY_PREFIX + id, JSON.stringify({
                    paddedKey: body.splitKey.paddedKey.map(n => n & 0xFF),
                    t0: Number(body.splitKey.t0) || 0,
                    chk: Number(body.splitKey.chk) || 0
                }), { expirationTtl: LOADER_TTL });
            } else if (body.keyless === true) {
                // Refuse rather than publish something that cannot run.
                //
                // The alternative is a loadstring that uploads successfully and
                // then fails on every user's machine with an error naming
                // nothing - the "works until someone runs it" class of bug.
                return jsonResponse({
                    ok: false,
                    error: 'this build has no server-held key, so the script would be published in a form that cannot execute. Re-obfuscate it (this is a client/server version mismatch).'
                }, 400);
            }
            if (body.keyless === true) {
                const plainCode = String(body.plainCode || '');
                const cipher = String(body.cipher || '');
                if (!plainCode) return jsonResponse({ ok: false, error: 'plainCode is required for keyless scripts (the obfuscated code)' }, 400);
                if (plainCode.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare: KV values cap at 25MB and request bodies at ~100MB). Reduce the script or split it into modules.' }, 413);
                // executor blob (no key needed in-game) - chunked if large
                //
                // When the Storage Keeper backend is bound the bytes go to the owner's PC
                // and KV is skipped entirely for them. A definite refusal from the
                // service fails the upload rather than silently publishing a script whose
                // body was never stored - the alternative is a loadstring that 404s later,
                // which is the exact "works until someone runs it" class of bug.
                try {
                    if (keeperNeededFor(env, plainCode.length)) {
                        // await matters: expiresAtForUpload is async, and without the await
                        // the promise is stringified into the query string as
                        // expires_at=[object Promise], which the service correctly refuses.
                        const put = await storePut(env, id, 'artifact', plainCode, await expiresAtForUpload(env, body, id));
                        if (put === false) return jsonResponse({ ok: false, error: 'script storage refused the upload. Check the Storage Keeper service is running and its token matches.' }, 502);
                        if (put === null) return jsonResponse({ ok: false, error: 'script storage is unreachable. The script was NOT published. Try again shortly.' }, 503);
                    } else {
                        // KV. The script then runs with the owner's PC off.
                        await putBlob(env, id, KV_PREFIX, plainCode);
                    }
                } catch (e) {
                    return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                }
                // browser view: encrypted with the Special Key if provided
                // (website key page asks for it); without a key the browser
                // keeps getting "Method Not Allowed" (legacy behavior).
                const keyHash = String(body.keyHash || '');
                await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({
                    name, user, at: Date.now(), keyHash,
                    keyless: true,
                    visibility: readVisibility(body),
                    webKey: !!cipher,
                    projectId: String(body.projectId || '').slice(0, 60),
                    projectName: String(body.projectName || '').slice(0, 120)
                }), { expirationTtl: LOADER_TTL });
                mirrorScript(env, id, { name, user, visibility: readVisibility(body), authRequired: false });
                if (cipher) {
                    if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                    try {
                        // 'web' is a separate object from 'artifact'. Sharing a slot would
                        // let the browser preview replace the executor's copy.
                        if (keeperNeededFor(env, cipher.length)) await storePut(env, id, 'web', cipher, await expiresAtForUpload(env, body, id));
                        else await putBlob(env, id, KV_WEB_PREFIX, cipher);
                    } catch (e) {
                        return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                    }
                }
                // Report what actually happened.
                //
                // This discarded the result and answered `replaced: false`
                // unconditionally, while the keyed branch a few lines below
                // returns the real value. So a keyless EDIT - the common case -
                // told the panel the previous loader was still live, moments
                // after this same function deleted it. The client keeps its own
                // record of the old loaderId, so the two disagreed about whether
                // the user's old loadstring still worked.
                const replaced = await maybeReplaceOld(env, body.replaces);
                ctx.waitUntil(notifyScriptDiscord(env, {
                    event: 'script.published', outcome: 'ok',
                    scriptId: id, userRef: await telemetryRef('user', user),
                    at: Date.now(), bytes: plainCode.length
                }));
                const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
                return jsonResponse({ ok: true, id, replaced, keyless: true, loadstring: shLoader(base, id), loadstringPortable: shLoaderPortable(base, id) });
            }
            // ---- keyed scripts: the ARTIFACT is plainCode, the browser view is cipher ----
//
// This branch stored `cipher` as the delivery artifact. That was the second half
// of "Wrong Special Key, or the delivery was tampered with".
//
// `cipher` is shEncryptPayload(obfCode, specialKey) - the SPECIAL KEY layer. It
// exists so the owner can read the source back on the website. The executor never
// has the Special Key; it has the LICENSE, and the loader runs
// DEC(getgenv().ScripterHubKey) over whatever it is given.
//
// So the delivered body was ciphertext under a key the visitor does not hold,
// decrypted with a key they do. Garbage out, the SHOK magic fails, and the script
// dies with a message that accuses the visitor of tampering with the delivery.
//
// The two layers have separate jobs and separate storage:
//
//   plainCode -> sh_loader_<id>  the executor artifact, encrypted PER DELIVERY
//                                with the licence key that authorised the session
//   cipher    -> sh_web_<id>     the browser view, opened with the Special Key on
//                                the website
//
// main.js now sends plainCode for keyed uploads too. It is optional here so an
// older panel still works, but without it the artifact is the Special-Key
// ciphertext and a keyed script cannot run - which is the bug.
const cipher = String(body.cipher || '');
const plainCode = String(body.plainCode || '');
if (!cipher && !plainCode) {
    return jsonResponse({ ok: false, error: 'cipher is required (encrypt client-side with the Special Key first)' }, 400);
}
// The browser view. Same as the keyless branch, and it is NOT the artifact. A
// failure here must not fail the publish - the artifact write below is what
// decides whether this script exists at all.
if (cipher) {
    if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
    try {
        if (keeperNeededFor(env, cipher.length)) await storePut(env, id, 'web', cipher, await expiresAtForUpload(env, body, id));
        else await putBlob(env, id, KV_WEB_PREFIX, cipher);
    } catch (e) { /* the view is not worth failing a publish over */ }
}
// The artifact the executor receives.
const artifact = plainCode || cipher;
if (artifact.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare: KV values cap at 25MB and request bodies at ~100MB). Reduce the script or split it into modules.' }, 413);
const keyHash = String(body.keyHash || ''); // optional SHA-256 hex
try {
    if (keeperNeededFor(env, artifact.length)) {
        const put = await storePut(env, id, 'artifact', artifact, await expiresAtForUpload(env, body, id));
        if (put === false) return jsonResponse({ ok: false, error: 'script storage refused the upload. Check the Storage Keeper service is running and its token matches.' }, 502);
        if (put === null) return jsonResponse({ ok: false, error: 'script storage is unreachable. The script was NOT published. Try again shortly.' }, 503);
    } else {
        // KV: chunks if needed, and /sh/c/<id>/<i> serves them. The
        // script runs with the PC off.
        await putBlob(env, id, KV_PREFIX, artifact);
    }
} catch (e) {
    return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
}
            // authRequired: this script demands a valid license key + HWID
            // on EVERY run (Luarmor model) - the split key is never served
            // without a short-lived /sh/auth token
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({
                name, user, at: Date.now(), keyHash,
                authRequired: body.authRequired === true,
                visibility: readVisibility(body),
                // The owning project. Without it here a key bound to a
                // project has nothing to be compared against and the binding
                // silently does nothing on exactly the scripts it was meant
                // to protect - the key-system ones.
                projectId: String(body.projectId || '').slice(0, 60),
                projectName: String(body.projectName || '').slice(0, 120)
            }), { expirationTtl: LOADER_TTL });
            mirrorScript(env, id, { name, user, visibility: readVisibility(body), authRequired: body.authRequired === true });
            // optional: kill an OLD loader (key rotation / re-upload on edit)
            let replaced = await maybeReplaceOld(env, body.replaces);
            // Discord notification (attachments = download txt/lua files)
            ctx.waitUntil(notifyScriptDiscord(env, {
                event: 'script.published', outcome: 'ok',
                scriptId: id, userRef: await telemetryRef('user', user),
                at: Date.now(), bytes: cipher.length
            }));
            const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
            // NO key in the URL - the key is asked at runtime
            return jsonResponse({ ok: true, id, replaced, loadstring: shLoader(base, id), loadstringPortable: shLoaderPortable(base, id) });
        }

        // ---------- POST /sh/visibility : set server-side script visibility ----------
        // Body: { token | userToken, id, visibility }
        //
        // WHY THIS ROUTE EXISTS
        //
        // `visibility` used to be a field in the dashboard's localStorage and
        // nothing else. The worker never heard about it, so "Private" and
        // "Anyone" produced byte-identical loader URLs with byte-identical
        // responses — the setting was a label on a list, not a control. That is
        // gate G10, and no amount of gating in the delivery route can fix a
        // policy the server has never been told.
        //
        // It is a separate endpoint rather than a re-upload because re-uploading
        // would need the artifact, and the artifact is deliberately not in the
        // dashboard's hands: the owner's copy of the source is the file they
        // uploaded, and the worker holds only what it needs to serve bytes.
        //
        // Ownership is enforced, and enforced against the PROVEN identity rather
        // than a client-supplied `user` string (the same rule as G12).
        if (url.pathname === '/sh/visibility' && request.method === 'POST') {
            const limited = await guardRate(env, 'admin', rateIdentity(request, url));
            if (limited) return limited;
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            const id = String(body.id || '');
            if (!/^ScripterHub[0-9]{6,16}$/.test(id)) return jsonResponse({ ok: false, error: 'bad script id' }, 400);
            const vis = readVisibility(body);
            if (!['anyone', 'account', 'private'].includes(String(body.visibility))) {
                return jsonResponse({ ok: false, error: 'visibility must be anyone | account | private' }, 400);
            }

            const codeHashes = await getCodeHashes(env);
            let who = null;
            if (await verifyToken((request.headers.get('X-SH-Token') || '') || body.token || '', codeHashes, env)) who = OWNER_EMAIL;
            if (!who && body.userToken) {
                const u = await verifyUserToken(body.userToken, env);
                if (u) who = String(u.email || u.username || '').slice(0, 100);
            }
            if (!who) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);

            const raw = await env.LOADERS_KV.get(KV_META_PREFIX + id);
            if (raw === null) return jsonResponse({ ok: false, error: 'no such script' }, 404);
            let meta = {};
            try { meta = JSON.parse(raw); } catch (e) { return jsonResponse({ ok: false, error: 'corrupt meta' }, 500); }
            const owner = String(meta.user || '');
            const isSiteOwner = who.toLowerCase() === OWNER_EMAIL;
            if (!isSiteOwner && owner.toLowerCase() !== who.toLowerCase()) {
                return jsonResponse({ ok: false, error: 'Not your script.' }, 403);
            }

            meta.visibility = vis;
            // Carried through explicitly. JSON.stringify keeps whatever is in
            // the object, but relying on that for a field the whole key
            // binding depends on is how it disappears on the next edit.
            if (meta.projectId === undefined) meta.projectId = String(body.projectId || '').slice(0, 60);
            if (meta.projectName === undefined) meta.projectName = String(body.projectName || '').slice(0, 120);
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify(meta), { expirationTtl: LOADER_TTL });
            mirrorScript(env, id, {
                user: owner, name: meta.name,
                visibility: vis,
                authRequired: meta.authRequired === true
            });
            ctx.waitUntil(notifyTelemetry(env, {
                event: 'script.visibility', outcome: 'ok', scriptId: id,
                userRef: await telemetryRef('user', who), reason: vis, at: Date.now()
            }));
            return jsonResponse({ ok: true, id, visibility: vis });
        }

        // ================= CROSS-DEVICE USER SYNC =================
        // Lets accounts made on one device appear in the Users/Admin
        // panels on EVERY device, and lets users log in from anywhere.

        if (!env.LOADERS_KV && url.pathname.startsWith('/sh/user')) {
            return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV first (Settings > Bindings).' }, 500);
        }

        // ---------- POST /sh/user-signup : public account creation ----------
        if (url.pathname === '/sh/user-signup' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            // flood guard: >10 signups/min from one IP = bot (the KV quota
            // got burned by 1200 junk signups in one day)
            const ip = (request.headers.get('CF-Connecting-IP') || 'unknown').slice(0, 64);
            if (signupFloodBlocked(ip)) return jsonResponse({ ok: false, error: 'Too many signups. Try again later.' }, 429);
            try {
                const email = String(body.email || '').trim();
                const username = String(body.username || '').trim();
                const password = String(body.password || '');
                if (!email || !username || !password) return jsonResponse({ ok: false, error: 'missing fields' }, 400);
                if (password.length < 6) return jsonResponse({ ok: false, error: 'password too short' }, 400);
                // shape guards: junk emails/usernames were used to bloat the
                // KV (1231 records, ~500KB of garbage)
                if (email.length > MAX_EMAIL_LEN || !/^[^\s@]{1,64}@[^\s@]{1,64}\.[^\s@]{1,16}$/.test(email)) return jsonResponse({ ok: false, error: 'invalid email' }, 400);
                if (username.length > MAX_USERNAME_LEN || username.length < 2) return jsonResponse({ ok: false, error: 'invalid username' }, 400);
                // RULES: the username and the description are both moderated
                // before the record is written.
                //
                // A violation does NOT reject the signup and does NOT delete
                // anything - the account is created and immediately blocked for
                // the stated window, so the owner can lift it by hand if the rule
                // misfired. Refusing the signup outright is the more obvious
                // design and the wrong one: to the person it happens to, that is
                // indistinguishable from the site being broken.
                const signupViol = ruleCheck('your username', username, 0)
                    || ruleCheck('your description', body.description, 0);
                // Duplicate checks read ONE record and ONE index key.
//
// This used to load the entire user table and scan it for both the email and
// the username. Beyond being O(all users) on every signup, that is what made
// the failure so confusing: when the table read returned nothing, BOTH checks
// silently passed, so signing up with an email that already existed returned
// 200 and created a second account. Measured on the live worker during this
// investigation: a known existing address returned 200 instead of 409.
const existingRec = await loadUserRecord(env, email);
if (existingRec) return jsonResponse({ ok: false, error: 'An account with this email already exists.' }, 409);
{
    // The username index maps a lowercased username to its email, so this is
                    // a single get rather than a scan.
                    let takenBy = null;
                    try { takenBy = await env.LOADERS_KV.get(unameKvKey(username)); } catch (e) { takenBy = null; }
                    if (takenBy) return jsonResponse({ ok: false, error: 'This username is already taken.' }, 409);
                }
                const rec = sanitizeUserRecord({
                    id: body.id || ('user_' + Date.now()),
                    email: email,
                    username: username,
                    // PBKDF2, not btoa. See hashPassword() for why, and for the
                // legacy-migration path that keeps existing accounts working.
                password: await hashPassword(env, password),
                    plan: 'Basic',
                    description: String(body.description || ''),
                    createdAt: body.createdAt || new Date().toISOString(),
                    profileImage: '', bannerImage: '', theme: 'default',
                    stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
                });
                // global hourly cap (counts only signups about to hit KV):
                // bots rotate IPs, so the per-IP limit alone still let
                // hundreds of junk accounts through
                if (signupGlobalBlocked()) return jsonResponse({ ok: false, error: 'Too many signups right now. Try again later.' }, 429);
                // Apply the block AFTER the record exists, so the account and
                // everything it will ever own are preserved. See ruleCheck.
                if (signupViol) ruleApplyModeration(rec, signupViol);
                // ONE key. Writing the whole table here is what made two
                // signups inside the read cache erase each other.
                await putUserRecord(env, rec);
                // AND THE D1 MIRROR, here, not on some later request.
                //
                // The delivery gate re-checks the account live:
                //
                //     EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.disabled = 0)
                //
                // so an account in KV but not in D1 is an account the gate
                // cannot find. The mirror only ran inside loadUsersMap(), so a
                // brand-new account was invisible to the gate until an
                // unrelated request read the whole table - and that read was
                // the one that started 503ing at 51 accounts. So a new
                // account could stay invisible for good.
                if (stateFor(env)) {
                    try { await syncUsersToD1(env, { [String(email).toLowerCase()]: rec }); }
                    catch (e) { console.error('[ScripterHub] signup mirror to D1 failed: ' + (e && e.message)); }
                }
    // A session token is issued HERE, at signup, rather than being fetched with a
    // second /sh/user-login call the client used to make purely to obtain one.
    //
    // That second call re-ran PBKDF2 over the same password - ~1.3s of duplicated
    // work, measured - and the token it produced was discarded when the tab closed
    // anyway. The password has just been proven and the record just written, so
    // there is nothing left to check.
    //
    // Same payload /sh/user-login issues, including the credential fingerprint, so
    // changing the password later still invalidates these tokens.
    let signupToken = null;
    try {
        signupToken = await signSessionToken(env, {
            kind: 'user',
            sub: email,
            e: email,
            pwd: await credentialFingerprint(env, String(rec.password || '')),
            t: Date.now()
        });
    } catch (e) { /* a token is a convenience here; the account still exists */ }
    const out = { ok: true, user: publicUser(rec) };
    if (signupToken) out.token = signupToken;
                // The account works and the client is told plainly what is
                // blocked and until when, so the reason is never a mystery.
                if (signupViol) {
                    out.moderated = {
                        reason: signupViol.reason,
                        until: rec.moderatedUntil,
                        penaltyHours: Math.round(signupViol.penalty / 3600000)
                    };
                }
                return jsonResponse(out);
            } catch (e) {
                // NEVER a blank 500: the browser would swallow the error
                // (no CORS headers on the error path) and users would
                // just see "fetch failed"
                return jsonResponse({ ok: false, error: 'server error creating the account: ' + String(e && e.message ? e.message : e).slice(0, 200) }, 500);
            }
        }

        // ---------- POST /sh/user-login : cross-device login ----------
        if (url.pathname === '/sh/user-login' && request.method === 'POST') {
            // Password brute force. Keyed on IP + the account being targeted,
            // so one attacker cannot grind a single account AND a spray across
            // accounts cannot escape the per-IP budget.
            {
                let probeEmail = '';
                try { probeEmail = String((await request.clone().json() || {}).emailOrUsername || '').toLowerCase(); } catch (e) {}
                const rl = rateLimit('user-login', rateIdentity(request, url) + '|' + probeEmail);
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            try {
                const emailOrUser = String(body.emailOrUsername || '').trim();
                if (!emailOrUser || emailOrUser.length > MAX_EMAIL_LEN || String(body.password || '').length > 500) return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                // ONE record, not the whole table.
                //
                // This used to call loadUsersMap() and then loop over every
                // account looking for a match. That meant authenticating one
                // person required reading all of them - so the moment the table
                // crossed the KV read ceiling, EVERY login failed with the same
                // 401, for a correct password and an incorrect one alike.
                //
                // loadUserRecord() reads a single key (plus one username-index
                // key), so its size is bounded by one account no matter how many
                // accounts exist.
                const rec = await loadUserRecord(env, emailOrUser);
                let found = rec || null;
                let foundEmail = rec ? d1UserId(rec.email || rec.id) : null;
                if (!found) {
                    return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                }
                const verdict = await verifyPassword(env, found.password, body.password);
                if (!verdict.ok) {
                    return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                }
                if (found.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.' }, 403);
                // RULES: a moderated account is refused HERE, after the password
                // has been proven, so the message can name the reason. Checking
                // it before the password check would leak whether a given
                // username is currently blocked - a free oracle for enumerating
                // accounts, and one that answers faster than a wrong password.
                //
                // The data is untouched. This is a block with an expiry, not a
                // deletion, and it lifts by itself.
                const block = ruleIsBlocked(found);
                if (block) {
                    return jsonResponse({
                        ok: false,
                        error: 'This account is blocked for ' + Math.max(1, Math.ceil(block.leftMs / 60000)) + ' more minute(s): ' + block.reason + '. Your account and everything in it is untouched.',
                        moderated: { reason: block.reason, until: block.until, leftMs: block.leftMs }
                    }, 403);
                }
                // Opportunistic migration: the correct password was just proven,
                // so a legacy base64 record can be upgraded in place. Doing it
                // here rather than in a batch means it can never lock anyone
                // out, and it means the weak records disappear on first use.
                if (verdict.needsRehash) {
                    try {
                        found.password = await hashPassword(env, body.password);
                        // ONE key, not the whole table. Calling saveUsersMap()
                        // here would re-read and re-write every account on a
                        // routine login, which is both slow and a lost-update
                        // risk against a concurrent signup.
                        await putUserRecord(env, found);
                    } catch (e) { /* a failed upgrade must not block login */ }
                }
                // Issue a USER session token. It binds to the account id and
                // the CURRENT password-hash generation, so changing the
                // password invalidates outstanding tokens.
                const now = Date.now();
                const token = await signSessionToken(env, {
                    kind: 'user',
                    sub: foundEmail,
                    e: foundEmail,
                    pwd: await credentialFingerprint(env, String(found.password || '')),
                    t: now
                });
                return jsonResponse({ ok: true, user: publicUser(found), token });
            } catch (e) {
                return jsonResponse({ ok: false, error: 'server error during login: ' + String(e && e.message ? e.message : e).slice(0, 200) }, 500);
            }
        }

        // ---------- POST /sh/user-sync : password-verified self profile upsert ----------
        // Used to push local profile changes (theme/images/stats) and to
        // migrate existing local accounts to the cloud. The password field
        // MUST match the stored one for existing records. plan/admin flags
        // are protected - they only change via the owner /sh/users route.
        if (url.pathname === '/sh/user-sync' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const password = String(body.password || '');
            // A SESSION TOKEN is accepted as identity, and is what the dashboard
            // sends. The base64 password the client stores is not a usable proof:
            // verifyPassword hashes whatever it is given, so a base64 string can
            // never match a PBKDF2 record - and the worker migrates legacy records
            // on first login, so that fallback dies the first time an account is
            // used. The token is the one credential the client can actually
            // produce after the sign-in moment has passed.
            const tok = String(body.userToken || body.token || '');
            let tokenOk = false;
            if (tok) {
                try {
                    const u = await verifyUserToken(tok, env);
                    // Bound to THIS account. A valid token belonging to somebody
                    // else must not authorise a write to this record.
                    tokenOk = !!(u && String(u.email || '').toLowerCase() === email.toLowerCase());
                } catch (e) { tokenOk = false; }
            }
            if (!email || email.length > MAX_EMAIL_LEN || (!tokenOk && (!password || password.length > 500))) return jsonResponse({ ok: false, error: 'bad request' }, 400);
            // ONE account, not the whole table. See loadUserByEmail.
            const existing = await loadUserByEmail(env, email);
            if (existing) {
                // must prove identity with the real password.
                // PHASE 1: PBKDF2 (was: b64 comparison). A legacy record is
                // upgraded in place once the correct password is proven.
                let v = tokenOk ? { ok: true, needsRehash: false } : await verifyPassword(env, existing.password, password);
                if (!v.ok) {
                    return jsonResponse({ ok: false, error: 'Not authorized for this account.' }, 401);
                }
                if (v.needsRehash) {
                    try {
                        existing.password = await hashPassword(env, password);
                        // ONE key, not the whole table rewritten.
                        await putUserRecord(env, storageSafeUser(existing));
                    } catch (e) { /* a failed upgrade must not block the sync */ }
                }                const inc = sanitizeUserRecord(body.user || {});
                // merge only profile fields - keep server plan/flags/password
                const rec = { ...existing };
                // customBackground is a DIFFERENT feature from bannerImage and
                // needs its own slot, not a repurpose of the banner:
                //   bannerImage - a strip in the profile header
                //   customBackground - a full-page backdrop behind the whole app
                //
                // This list is a SECOND allowlist, separate from the one in
                // sanitizeUserRecord, and that is the trap: a field can be
                // accepted by the sanitiser and then silently dropped here, so
                // it works on the device that set it and never appears on any
                // other one. There is no error and no warning - it just does not
                // sync. Any new profile field has to be added in BOTH places.
                for (const k of ['username', 'description', 'profileImage', 'bannerImage', 'customBackground', 'theme', 'stats', 'disabled', 'createdAt', 'id', 'twoStepEnabled', 'twoStepCode', 'twoStepExpires']) {
                    if (inc[k] !== undefined) rec[k] = inc[k];
                }
                // ONE key - this route only ever touches the caller's own
                // record, so there is nothing here that needs the whole table.
                await putUserRecord(env, rec);
                if (stateFor(env)) {
                    try { await syncUsersToD1(env, { [String(email).toLowerCase()]: rec }); }
                    catch (e) { console.error('[ScripterHub] user sync to D1 failed: ' + (e && e.message)); }
                }
                return jsonResponse({ ok: true, user: publicUser(rec) });
            }
            // new record (account migration from a device that made it
            // before cloud sync existed) - plan starts at Basic
            const rec = sanitizeUserRecord(body.user || {});
            rec.email = email;
            // the owner account keeps its owner/admin flags on migration
            // (sanitize strips them for everyone - the owner's flags are
            // what make ownerProof work for plan changes)
            if (email === OWNER_EMAIL && body.user && (body.user.isScripter === true || body.user.isAdmin === true)) {
                rec.isScripter = true;
                rec.isAdmin = true;
            }
            rec.password = btoa(password || rec.password || 'x');
            if (!rec.password || rec.password === btoa('')) rec.password = btoa('sh_no_login_' + Date.now());
            await putUserRecord(env, rec);
            if (stateFor(env)) {
                try { await syncUsersToD1(env, { [String(email).toLowerCase()]: rec }); }
                catch (e) { console.error('[ScripterHub] user sync to D1 failed: ' + (e && e.message)); }
            }
            return jsonResponse({ ok: true, user: publicUser(rec) });
        }

        // ---------- POST /sh/user-get : fetch YOUR OWN record (page refresh) ----------
        // Lets any logged-in device pull its fresh record (plan changes by
        // the owner, profile edits from another device, bans, etc.) after a
        // page refresh. Requires email + password proof (raw or b64).
// ---------- GET /sh/user-me : the signed-in user's own record ----------
//
// Exists because the client cannot re-prove identity with a password. It stores
// btoa(password) and nothing else, and that value is not a valid proof for a
// PBKDF2 record - the worker hashes whatever it is given. So the page-load
// refresh had no working credential, got a 401, and the client read that as
// "the account was deleted": it deleted the local record and force-logged the
// user out with "Your account was deleted by admin."
//
// A session token IS a working credential, so this uses one. The token is bound
// to a fingerprint of the password-hash generation, so changing the password
// invalidates it - which is the correct behaviour and cannot be spoofed.
//
// A missing account is a 404 and a DISABLED account is a 403, deliberately
// distinct: only 403 is a real administrative action, and the client is
// forbidden from treating anything else as grounds for deleting an account.
if (url.pathname === '/sh/user-me' && request.method === 'GET') {
    const tok = url.searchParams.get('userToken') || url.searchParams.get('token') || '';
    const u = tok ? await verifyUserToken(tok, env) : null;
    if (!u || !u.email) return jsonResponse({ ok: false, error: 'no valid session' }, 401);
    // ONE account, not the whole table. See loadUserByEmail.
    const rec = await loadUserByEmail(env, u.email);
    if (!rec) return jsonResponse({ ok: false, error: 'no such account' }, 404);
    if (rec.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.', disabled: true }, 403);
    return jsonResponse({ ok: true, user: publicUser(rec) });
}

        if (url.pathname === '/sh/user-get' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            // ONE account, not the whole table. See loadUserByEmail.
            const rec = await loadUserByEmail(env, email);
            // PHASE 1: PBKDF2 verification, not a base64 comparison. A legacy
            // base64 record is accepted once and upgraded in place, because the
            // correct password was just proven.
            const verdict = rec ? await verifyPassword(env, rec.password, body.password) : { ok: false, needsRehash: false };
            if (!rec || !verdict.ok) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            if (verdict.needsRehash) {
                try {
                    rec.password = await hashPassword(env, body.password);
                    // ONE key. The old call wrote the whole table back, which is
                    // a write per account to upgrade one.
                    await putUserRecord(env, rec);
                } catch (e) { /* a failed upgrade must not block the read */ }
            }
            if (rec.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.' }, 403);
            return jsonResponse({ ok: true, user: publicUser(rec) });
        }

        // ---------- POST /sh/user-delete : password-verified self-delete ----------
        if (url.pathname === '/sh/user-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            // ONE account, not the whole table. See loadUserByEmail.
            const existing = await loadUserByEmail(env, email);
            if (!existing) return jsonResponse({ ok: true }); // already gone
            // PHASE 1: PBKDF2 verification.
            const delV = await verifyPassword(env, existing.password, body.password);
            if (!delV.ok) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            // Delete THIS account and everything that still named it: the
            // record, the D1 row the gate reads, the legacy entry, and the
            // username it had reserved. The old code rewrote the whole table
            // with the account removed, which is a write per account to delete
            // one. See deleteUserRecord.
            await deleteUserRecord(env, email, existing);
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/user-password : self password change ----------
        if (url.pathname === '/sh/user-password' && request.method === 'POST') {
            // Tight bucket keyed on the target account: a password change
            // requires the CURRENT password, so this route is a guessing
            // oracle for anyone who knows an email address.
            {
                let probeEmail = '';
                try { probeEmail = String((await request.clone().json() || {}).email || '').toLowerCase(); } catch (e) {}
                const rl = rateLimit('password', rateIdentity(request, url) + '|' + probeEmail);
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const oldPw = String(body.oldPassword || '');
            const newPw = String(body.newPassword || '');
            if (!email || !oldPw || !newPw) return jsonResponse({ ok: false, error: 'email, oldPassword, newPassword required' }, 400);
            if (newPw.length < 6) return jsonResponse({ ok: false, error: 'New password must be at least 6 chars.' }, 400);
            // ONE account, not the whole table. See loadUserByEmail.
            const existing = await loadUserByEmail(env, email);
            if (!existing) return jsonResponse({ ok: false, error: 'Account not found.' }, 404);
            // PHASE 1: PBKDF2 verification, and the new password is stored as
            // a PBKDF2 hash rather than btoa(). Because a session token binds
            // to a fingerprint of the credential generation (see
            // credentialFingerprint), changing the password here also
            // invalidates every session token already issued to this account.
            const chgV = await verifyPassword(env, existing.password, oldPw);
            if (!chgV.ok) return jsonResponse({ ok: false, error: 'Current password is incorrect.' }, 401);
            existing.password = await hashPassword(env, newPw);
            // ONE key, and ONE D1 row. The old call rewrote the whole table.
            await putUserRecord(env, storageSafeUser(existing));
            if (stateFor(env)) {
                try { await syncUsersToD1(env, { [String(email).toLowerCase()]: existing }); }
                catch (e) { console.error('[ScripterHub] password change mirror failed: ' + (e && e.message)); }
            }
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/aegis : Aegis obfuscator proxy ----------
        //
        // The site used to call Aegis straight from the browser:
        //
        //     fetch('https://api.aegis-obfuscater.cc.cd/api/obfuscate', {
        //         headers: { 'Content-Type': 'application/json' }, ...
        //
        // Aegis is API v4. Every programmatic call now requires an admin-issued
        // X-Api-Key ("API key: required for programmatic access - ask the admin
        // to issue one"). The browser sent none, so every Aegis publish came back
        // 401 and the option was simply broken. Adding the header in the browser
        // would have been the obvious fix and the wrong one: the bundle is
        // downloaded, minified and readable, so the key would be published to
        // every visitor. The dashboard API key is also a 20-min-per-day budget -
        // a public one would be burned by anyone who opened the site.
        //
        // So the call moves here. The key is a worker SECRET (AEGIS_API_KEY),
        // set under Settings > Variables and Secrets with type "Secret" - not a
        // binding, because Bindings is for resources like KV and D1 and this is
        // just a string. Never in the client, and the route is owner-only so the
        // quota cannot be spent by other accounts.
        //
        // Sources over 150 KB are queued by Aegis as a background job (202 with a
        // jobId, ready in 1-2 minutes). The browser code did not handle 202 at
        // all - it read data.url unconditionally, which for a 202 is the JOB
        // endpoint, and then downloaded JSON as if it were the script. So large
        // sources produced a script that was a JSON object. Polled here, and if
        // the job outlives the worker budget the jobId comes back so the client
        // can ask again.
        if (url.pathname === '/sh/aegis' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);

            // Input is validated BEFORE the secret is read. Checking the secret
            // first made every malformed request report "AEGIS_API_KEY is not
            // set" instead of the actual problem - a misleading error precisely
            // when the secret genuinely is missing.
            const source = String(body.source || '');
            const followUp = String(body.job || '').trim();
            if (!source && !followUp) return jsonResponse({ ok: false, error: 'nothing to obfuscate' }, 400);
            if (source.length > 1000 * 1000) {
                return jsonResponse({ ok: false, error: 'Source is over Aegis\' 1 MB limit (' + source.length + ' bytes). Use the Default engine.' }, 413);
            }
            if (followUp && !/^[A-Za-z0-9_-]{4,64}$/.test(followUp)) return jsonResponse({ ok: false, error: 'bad job id' }, 400);

            const aegisKey = String(env.AEGIS_API_KEY || '');
            if (!aegisKey) {
                // The message has to say WHERE, because "not set" alone sends
                // people to the Bindings tab - where this cannot be set at all.
                // It is a Secret, not a binding: Bindings is for resources (KV, D1,
                // R2), and AEGIS_API_KEY is just a string read off env.
                return jsonResponse({
                    ok: false,
                    error: 'AEGIS_API_KEY is not set, so the Aegis engine is unavailable. '
                        + 'Add it under Settings > Variables and Secrets, type "Secret" '
                        + '(NOT Settings > Bindings - that is for KV/D1/R2 resources), '
                        + 'or run: wrangler secret put AEGIS_API_KEY'
                }, 501);
            }
            const AEGIS_ORIGIN = 'https://api.aegis-obfuscater.cc.cd';
            const aegisHeaders = { 'Content-Type': 'application/json', 'X-Api-Key': aegisKey };

            // --- download a finished file, or poll a queued job ---
            const grab = async (fileUrl) => {
                const f = await fetch(AEGIS_ORIGIN + fileUrl, { headers: aegisHeaders });
                if (!f.ok) {
                    return { err: f.status === 410
                        ? 'the Aegis download link expired (they live 5 minutes)'
                        : ('Aegis download failed (' + f.status + ')') };
                }
                return { code: await f.text() };
            };

            // Called repeatedly for a queued job. Bounded: a worker request must
            // return, and a job normally finishes in 1-2 minutes.
            const waitForJob = async (jobId) => {
                for (let attempt = 0; attempt < 10; attempt++) {
                    const j = await fetch(AEGIS_ORIGIN + '/api/job/' + jobId, { headers: aegisHeaders });
                    if (!j.ok) return { err: 'Aegis job lookup failed (' + j.status + ')' };
                    const d = await j.json();
                    if (d.status === 'done') return { url: d.url };
                    if (d.status === 'failed') return { err: 'Aegis could not obfuscate this source (usually a syntax error, or the input is already an Aegis output)' };
                    await new Promise((res) => setTimeout(res, 3000));
                }
                return { stillQueued: true };
            };

            // A follow-up poll for a job the previous request did not wait out.
            if (body.job) {
                const jobId = followUp;
                const r = await waitForJob(jobId);
                if (r.err) return jsonResponse({ ok: false, error: r.err });
                if (r.stillQueued) return jsonResponse({ ok: true, queued: true, job: jobId });
                const g = await grab(r.url);
                if (g.err) return jsonResponse({ ok: false, error: g.err });
                return jsonResponse({ ok: true, code: g.code });
            }

            // --- submit ---
            {
                // Aegis allows 6 requests/minute per key and one large job in
                // flight. Proxied through here, every visitor's traffic shares the
                // owner's key, so the bucket has to be applied on our side too.
                const rl = rateLimit('aegis', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            const res = await fetch(AEGIS_ORIGIN + '/api/obfuscate', {
                method: 'POST',
                headers: aegisHeaders,
                body: JSON.stringify({ source, name: String(body.name || 'script') })
            });
            if (!res.ok) {
                let msg = 'Aegis API error ' + res.status;
                if (res.status === 401) msg = 'Aegis rejected the API key (X-Api-Key) - ask the Aegis admin to issue a valid one';
                else if (res.status === 422) msg = 'Aegis could not parse this source - check for a syntax error, or for it already being an Aegis output';
                else if (res.status === 429) msg = 'Aegis rate limit reached (6 requests/minute)';
                else if (res.status === 503) msg = 'the Aegis large-job queue is full - try again shortly';
                try { const e = await res.json(); if (e && (e.error || e.message)) msg += ' - ' + (e.error || e.message); } catch (e) {}
                return jsonResponse({ ok: false, error: msg }, res.status);
            }
            const data = await res.json();
            // 202: queued. data.url is the JOB endpoint here, not a file.
            if (data.queued || res.status === 202) {
                const r = await waitForJob(String(data.jobId || ''));
                if (r.err) return jsonResponse({ ok: false, error: r.err });
                if (r.stillQueued) return jsonResponse({ ok: true, queued: true, job: String(data.jobId || '') });
                const g = await grab(r.url);
                if (g.err) return jsonResponse({ ok: false, error: g.err });
                return jsonResponse({ ok: true, code: g.code });
            }
            const g = await grab(data.url);
            if (g.err) return jsonResponse({ ok: false, error: g.err });
            return jsonResponse({ ok: true, code: g.code });
        }

        // The Host Announcement feature is removed. Its /sh/announcement routes, the
        // KV key and the hex-validated reader went with it. Any announcement already
        // stored in KV under 'sh_announcement' is left untouched and simply never
        // read again - deleting a KV value is not something a deploy should do
        // silently, and nothing depends on it any more.

        // "Is this the owner?" in the sense the DASHBOARD means it.
        //
        // isOwnerRequest accepts ONLY the raw-page session token, which comes
        // from the access code. So every admin action silently required a second
        // sign-in that looks like nothing to the person doing it: you are logged
        // in, the panel is open, the button is right there, and it refuses you
        // with a message about a sign-in you did not know existed. That is the
        // reported symptom for BOTH "Refresh from Cloud" and the Host
        // Announcement.
        //
        // This also accepts the owner ACCOUNT's own user session. It is
        // deliberately NOT isUserOrOwner, which accepts ANY valid user token -
        // correct for a per-script route like /sh/gh-put, and badly wrong for a
        // broadcast that every signed-in device will render.
        async function isOwnerSessionOrAccount(env, url, body, request) {
            // NOTE: this line must call isOwnerRequest, not itself. A bulk find-and-
            // replace of `await isOwnerRequest(` once rewrote this very line,
            // producing `if (await isOwnerSessionOrAccount(...)) return true;` - i.e.
            // the function called itself, and every owner admin route blew the stack
            // with "Maximum call stack size exceeded". It presented as a server fault
            // on /sh/users, not as a logic error, so it was not obvious.
            if (await isOwnerRequest(env, url, body, request)) return true;
            // The SAME credential may be a user session rather than an access-code
            // session, and a GET has no body to carry it in. The dashboard sends its
            // owner account token in X-SH-Token for GETs, and isOwnerRequest only
            // understands the code token - so it returned 401 for an owner who was
            // plainly signed in, and told them to sign in again.
            //
            // It must still be the OWNER's user token. A valid token from any other
            // account is not enough, and that is what keeps a normal user out of the
            // entire admin surface.
            // A POST carries the credential in body.token - which only isOwnerRequest
            // reads, and only as a CODE token. That is exactly how the dashboard
            // sends every admin POST, so an owner using their account token was
            // refused with 401 there too.
    // Every read of `request` is guarded. A missing argument then means "no
    // header token" - a 401, a wrong guess about the caller - rather than a
    // ReferenceError that turns one badly-wired route into a 500 for every
    // admin action at once.
    const hdr = (h) => {
        try { return (request && request.headers && request.headers.get(h)) || ''; }
        catch (e) { return ''; }
    };
    // A GET has no body, so the dashboard may also pass the account session as
    // ?userToken=. A POST carries it as body.userToken. Both are read here, and
    // neither needs a custom request header - which is the whole point, because
    // a custom header is exactly what a browser preflight can reject.
    const cand = (body && body.userToken) ||
    (body && body.token) ||
    hdr('X-SH-Token') ||
    hdr('X-SH-User-Token') ||
    ((url && url.searchParams.get('userToken')) || '') ||
    ((url && url.searchParams.get('token')) || '');
            if (cand) {
                try {
                    const u = await verifyUserToken(String(cand), env);
                    if (u && String(u.email || '').toLowerCase() === OWNER_EMAIL) return true;
                } catch (e) { /* a malformed token is simply not owner proof */ }
            }
            return false;
        }


        // ---------- owner auth helper for the users endpoints ----------
        // Two ways to prove "I am the owner (Scripter)":
        //   1. token     - raw-page session token (sh/login)
        //   2. ownerProof- b64 password of the owner account stored in KV
        // The panels use ownerProof so plan changes sync without needing
        // the raw-page access code prompt.
        // NOTE: the isScripter flag is NO LONGER required for ownerProof
        // (record migrations stripped it, which silently killed every plan
        // change). The OWNER_EMAIL + matching password is proof enough -
        // only the owner can know that password.
        // Owner authorization for the admin panel.
        //
        // REMOVED (Phase 1): the `ownerProof` branch.
        //
        // ownerProof was the base64 of the owner account's password, accepted
        // from a query string. That is a password-equivalent credential placed
        // in a URL, which means it lands in proxy and CDN access logs, in
        // browser history, and in any Referer header on a follow-up request.
        // It also meant the owner's password was the admin credential for
        // /sh/users, /sh/users-delete and /sh/users-clear, so one leaked
        // password took the whole user table with it.
        //
        // The replacement is a real owner session token from /sh/login, which
        // is derived from the access code and expires. It is read from the
        // X-SH-Token header, or from a body field for POSTs.
        //
        // A token in a query string is still not ideal, so callers should
        // prefer the header. The query parameter is retained only for
        // compatibility with the site's existing login flow.
        async function isOwnerRequest(env, url, body, request) {
            const codeHashes = await getCodeHashes(env);
            const token = ((request && request.headers && request.headers.get('X-SH-Token')) || '')
                || (body && body.token)
                || (url && url.searchParams.get('token'))
                || '';
            if (await verifyToken(token, codeHashes, env)) return true;
            return false;
        }

        // ---------- GET /sh/users : owner pull of ALL users ----------
        //
        // WHY THE IMAGE FIELDS ARE NOT IN THE DEFAULT RESPONSE
        //
        // This route sent every user record with its base64 images attached. A
        // record carries up to three of them - profile, banner, and a full-page
        // customBackground that is routinely 1-2MB of base64 - and there is no
        // per-user KV entry to fetch them from: the whole table is ONE value. So
        // the response size is the sum of every image on the site, and the client
        // cannot render a single row until all of it has arrived and parsed.
        //
        // That is what "Refresh from Cloud" actually was: a multi-megabyte
        // download behind a 3-second "Refreshing..." toast, on a page with no
        // progress and no timeout. On a small table it was invisible. Once the
        // table held real users with real images it stopped being a refresh and
        // became a wait, and the client had no way to tell those two apart.
        //
        // The admin list does not need the image bytes to draw a row: it shows a
        // name, an email, a plan and a role, and the client already re-attaches the
        // local copy of any image the cloud did not send. So the listing is metadata
        // and the pixels are a separate, paged request the client makes only for
        // what it is missing - see /sh/user-images below.
        if (url.pathname === '/sh/users' && request.method === 'GET') {
            if (!(await isOwnerSessionOrAccount(env, url, null, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            // A PAGE, not the whole table. See loadUsersPage.
            //
            // The old call read every account's RECORD to build the listing,
            // which is one subrequest per account. Past 50 accounts the
            // platform killed the request: an empty 503, no message, and an
            // admin panel that had quietly stopped working.
            const wantOffset = Math.max(0, parseInt((url && url.searchParams.get('offset')) || '0', 10) || 0);
            const wantLimit = Math.min(25, Math.max(1, parseInt((url && url.searchParams.get('limit')) || '25', 10) || 25));
            const page = await loadUsersPage(env, wantOffset, wantLimit);
            // ?images=1 restores the old shape. Kept so the owner, a script, or
            // cleanup-bots.mjs can still ask for everything in one call - and so the
            // default is a choice that can be undone, not a removal.
            const wantImages = ((url && url.searchParams.get('images')) || '') === '1';
            const out = {};
            for (const k in page.users) {
                const rec = publicUser(page.users[k]);
                if (!wantImages) {
                    // Absent, not ''. A missing key and an empty value mean the
                    // same thing to the client here, and omitting them is what makes
                    // a 58-user listing tens of kilobytes instead of tens of
                    // megabytes.
                    delete rec.profileImage;
                    delete rec.bannerImage;
                    delete rec.customBackground;
                }
                out[k] = rec;
            }
            return jsonResponse({
                ok: true, users: out, count: Object.keys(out).length,
                total: page.total, offset: page.offset, limit: page.limit,
                hasMore: page.hasMore, images: wantImages
            });
        }

        // ---------- GET /sh/user-images : owner, the pictures, a page at a time ----------
        //
        // The counterpart to the listing above. The admin panel draws a row per
        // user, and it wants the avatar on each one, so metadata-only would have
        // meant every avatar silently became an initial letter - a quiet regression
        // traded for speed.
        //
        // So the images are still available, but in bounded pages:
        //
        //   ?offset=0&limit=8   ->  { ok, total, offset, users: { email: {images} } }
        //
        // The client renders the panel from the listing immediately and fills each
        // avatar in as its page lands. Every response is small, the first row appears
        // in one round trip, and a page that fails costs one batch of avatars rather
        // than the whole refresh. Owner-gated by exactly the same check as the
        // listing - this is the same data, so it gets the same gate.
        if (url.pathname === '/sh/user-images' && request.method === 'GET') {
            if (!(await isOwnerSessionOrAccount(env, url, null, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            // Clamped, not merely defaulted. An unbounded ?limit= is a request for
            // the entire image table, which is the exact response this route
            // exists to stop being.
            //
            // The ceiling is also the SUBREQUEST budget: one get per account in
            // the page, and Workers on the free plan allow 50 per request. It
            // used to be 50, which was one over the limit for a full page - the
            // route that exists to be cheap was the one that 503'd.
            const limit = Math.min(20, Math.max(1, parseInt((url && url.searchParams.get('limit')) || '8', 10) || 8));
            const offset = Math.max(0, parseInt((url && url.searchParams.get('offset')) || '0', 10) || 0);
            const page = await loadUsersPage(env, offset, limit);
            const out = {};
            for (const k in page.users) {
                const rec = publicUser(page.users[k]);
                out[k] = {
                    profileImage: rec.profileImage || '',
                    bannerImage: rec.bannerImage || '',
                    customBackground: rec.customBackground || ''
                };
            }
            return jsonResponse({ ok: true, total: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore, users: out });
        }

        // ---------- POST /sh/users : owner upsert one user (PLAN CHANGES) ----------
        if (url.pathname === '/sh/users' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!body.email) return jsonResponse({ ok: false, error: 'email required' }, 400);
            // ONE account. See loadUserByEmail.
            const prev = (await loadUserByEmail(env, body.email)) || {};
            // Owner-controlled upsert: plan, admin flags, disable, everything.
            //
            // The IMAGE fields are excluded on purpose. This route is reached from
            // exactly one place - a plan change, which sends the owner's own local
            // copy of the user record - and that copy carries whatever images THIS
            // device happens to hold. A device that never received a user's avatar
            // sends an empty one, and the bare spread wrote it straight over the
            // server's copy. Nothing errors, no plan change reports a problem, and
            // the user's avatar is gone from every device. The owner destroys user
            // data as a side effect of doing their job.
            //
            // Images are the user's own data and are changed only through
            // /sh/user-sync, from the user's own device. That is an ownership
            // boundary, not a limitation: it is what makes a plan change incapable
            // of touching them.
            const patch = (body.user && typeof body.user === 'object') ? body.user : {};
            const next = storageSafeUser({ ...prev, ...patch, email: body.email });
            for (const k of SH_IMAGE_FIELDS) {
                if (typeof next[k] !== 'string') next[k] = '';
                next[k] = (typeof prev[k] === 'string') ? prev[k] : '';
            }
            // ONE key, and ONE D1 row. The old call rewrote the whole table.
            await putUserRecord(env, next);
            if (stateFor(env)) {
                try { await syncUsersToD1(env, { [String(body.email).toLowerCase()]: next }); }
                catch (e) { console.error('[ScripterHub] owner upsert mirror failed: ' + (e && e.message)); }
            }
            return jsonResponse({ ok: true, user: publicUser(next) });
        }

        // ---------- POST /sh/users-delete : owner delete one user ----------
        if (url.pathname === '/sh/users-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            // The record is read first, for the username it had reserved. Rewriting
            // the whole table to remove one account is a write per account,
            // and reading the whole table first was one subrequest per
            // account - which is what made this route 503.
            const email = String(body.email || '');
            const gone = await loadUserByEmail(env, email);
            await deleteUserRecord(env, email, gone);
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/users-clear : owner delete all (keeps creator/admin) ----------
        if (url.pathname === '/sh/users-clear' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const keep = String(body.keep || '');
            // The NAMES, not the records. "Keep these, delete the rest" only
            // needs to know which accounts exist, and one list call tells it.
            // Reading every record to decide which to delete was one subrequest
            // per account - the same 503 as everywhere else.
            const names = await listUserKeys(env);
            const keepSet = new Set((keep || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
            let removed = 0;
            // The usernames of the accounts being removed, for the index. They
            // are read here - while the record is in hand - rather than by the
            // single-account delete, which does not always have one. Reading
            // each removed record costs one subrequest each, which this route
            // can afford ONLY because it is explicitly a bulk operation; that is
            // still 50 accounts, so it is done in bounded batches and the
            // batches stop at the platform's limit rather than being retried.
            const toRemove = [];
            for (const name of names) {
                const email = name.slice(USER_PREFIX.length).toLowerCase();
                if (keepSet.has(email)) continue;
                toRemove.push({ name, email });
            }
            const BATCH = 40;
            for (let i = 0; i < toRemove.length && i < BATCH; i++) {
                const { name, email } = toRemove[i];
                let username = null;
                try { username = (JSON.parse(await env.LOADERS_KV.get(name)) || {}).username; } catch (e) { /* unreadable */ }
                try { await env.LOADERS_KV.delete(name); } catch (e) { /* already gone */ }
                await releaseUsernameIndex(env, email, username);
                await removeUserFromLegacyBlob(env, email);
                removed++;
            }
            // The D1 rows go in ONE statement, not one per account: a delete
            // per account is a subrequest per account, and this route exists to
            // remove a lot of them at once.
            //
            // The owner is added to the keep set by force. A clear that removed
            // the owner row would leave the gate with no owner and the site
            // with no way back in.
            try {
                const state = stateFor(env);
                if (state) {
                    keepSet.add(d1UserId(OWNER_EMAIL));
                    const keptIds = [...keepSet].map(d1UserId).filter(Boolean).slice(0, 200);
                    if (keptIds.length) {
                        const ph = keptIds.map(() => '?').join(',');
                        await d1run(state._db, 'DELETE FROM users WHERE id NOT IN (' + ph + ')', ...keptIds);
                    }
                }
            } catch (e) {
                console.error('[ScripterHub] D1 users-clear failed: ' + (e && e.message));
            }
            // Said plainly, because a silent cap is how "I cleared the users"
            // comes to mean something else than it says.
            const remaining = toRemove.length - removed;
            return jsonResponse({
                ok: true, removed,
                truncated: remaining > 0,
                remaining: remaining > 0 ? remaining : 0,
                note: remaining > 0
                    ? 'removed ' + removed + ', left ' + remaining + ' - a bulk clear may only touch ' + BATCH + ' accounts per call, so run it again'
                    : 'removed ' + removed
            });
        }

        // ================= OWNER LICENSE MANAGEMENT =================
        // Real server-side key management (Luarmor-style ops layer):
        //   POST /sh/licenses        { ownerProof|token, licenses: {key:rec} }
        //                             -> full REPLACE of the license map
        //                                (the website syncs its Users Keys
        //                                here after every edit)
        //   POST /sh/license-delete  { ownerProof, key }
        //   POST /sh/license-reset   { ownerProof, key }  (HWID reset w/
        //                             24h cooldown enforced server-side)
        //   POST /sh/license-ban     { ownerProof, key, banned, reason }
        //   POST /sh/killswitch      { ownerProof, on }  -> flip the
        //                             global kill-switch; when on, EVERY
        //                             auth fails (all loaders die)
        //   GET  /sh/licenses        -> the whole map (owner panels)
        if (url.pathname === '/sh/licenses' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, url, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            const incoming = body.licenses;
            if (!incoming || typeof incoming !== 'object') return jsonResponse({ ok: false, error: 'licenses map required' }, 400);
            // sanitize every record (never trust client extras)
            const out = {};
            let n = 0;
            for (const k of Object.keys(incoming)) {
                const key = String(k).slice(0, 200);
                if (!key) continue;
                const r = incoming[k] || {};
                out[key] = {
                    hwid: String(r.hwid || '').slice(0, 300),
                    expiresAt: Number(r.expiresAt) || 0,
                    banned: !!r.banned,
                    banReason: String(r.banReason || '').slice(0, 300),
                    discordId: String(r.discordId || '').slice(0, 64),
                    // The project a key is bound to. Empty or "all" means every
                    // project, which is what every key issued before this
                    // change means - so the installed base keeps working and only
                    // keys the owner deliberately narrows are restricted.
                    projectId: String(r.projectId || '').slice(0, 60),
                    projectName: String(r.projectName || '').slice(0, 120),
                    note: String(r.note || '').slice(0, 300),
                    hwidResets: Number(r.hwidResets) || 0,
                    executions: Number(r.executions) || 0,
                    lastAuthAt: Number(r.lastAuthAt) || 0,
                    // Phase 3: `scriptId` was being dropped here, so every
                    // license saved through the panel's editor lost the only
                    // link to the script it was created for. It is
                    // informational (licenses.script_id has no FK and the gate
                    // does not read it), but the panel round-trips it, so
                    // stripping it here silently corrupted what the dashboard
                    // displays back to the owner.
                    scriptId: String(r.scriptId || '').slice(0, 60)
                };
                n++;
            }
            await saveLicenses(env, out);
            return jsonResponse({ ok: true, count: n });
        }

        if (url.pathname === '/sh/licenses' && request.method === 'GET') {
            if (!(await isOwnerSessionOrAccount(env, url, null, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const ks = await isKillswitchOn(env);
            return jsonResponse({ ok: true, licenses: map, killswitch: ks });
        }

        if (url.pathname === '/sh/license-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const key = String(body.key || '');
            if (!map[key]) return jsonResponse({ ok: false, error: 'no such key' }, 404);
            delete map[key];
            await saveLicenses(env, map);
            return jsonResponse({ ok: true });
        }

        if (url.pathname === '/sh/license-reset' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const key = String(body.key || '');
            const rec = map[key];
            if (!rec) return jsonResponse({ ok: false, error: 'no such key' }, 404);
            // 24h cooldown: the last reset must be older than a day
            if (rec.hwidResets > 0 && rec.lastHwidResetAt && Date.now() - rec.lastHwidResetAt < HWID_RESET_COOLDOWN_MS) {
                const hours = Math.ceil((HWID_RESET_COOLDOWN_MS - (Date.now() - rec.lastHwidResetAt)) / 3600000);
                return jsonResponse({ ok: false, error: 'HWID reset cooldown: try again in ~' + hours + 'h' }, 429);
            }
            rec.hwid = '';
            rec.hwidResets = (rec.hwidResets || 0) + 1;
            rec.lastHwidResetAt = Date.now();
            await saveLicenses(env, map);
            return jsonResponse({ ok: true, hwidResets: rec.hwidResets });
        }

        if (url.pathname === '/sh/license-ban' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const key = String(body.key || '');
            const rec = map[key];
            if (!rec) return jsonResponse({ ok: false, error: 'no such key' }, 404);
            rec.banned = !!body.banned;
            rec.banReason = rec.banned ? String(body.reason || 'No reason provided').slice(0, 300) : '';
            await saveLicenses(env, map);
            return jsonResponse({ ok: true, banned: rec.banned });
        }

        if (url.pathname === '/sh/killswitch' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            const on = !!body.on;
            await env.LOADERS_KV.put(KV_KILLSWITCH_KEY, JSON.stringify({ on, at: Date.now() }));
            return jsonResponse({ ok: true, on });
        }

        // ================= STORAGE KEEPER (GitHub big-script storage) =================
        // For scripts too large for KV (~50MB). Parts stream from the
        // owner's browser -> worker -> private GitHub repo. Executors then
        // fetch parts through the worker proxy (/sh/g/*) - GitHub is
        // never exposed publicly.

        // KV records are written by this worker, but a half-written or hand-edited value must not
        // be able to throw inside a delivery request. Returns null on anything unparseable.
        function parseJson(raw) {
            if (raw === null || raw === undefined) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        }

        // Owner token + ownerProof, OR any registered user's session token, so normal users can
        // upload big scripts through the parts path and not only the owner.
        async function isUserOrOwner(env, url, body) {
            if (await isOwnerRequest(env, url, body, request)) return true;
            if (body && body.userToken && await verifyUserToken(body.userToken, env)) return true;
            return false;
        }

        // A part is 40MB of RAW text. Chosen to sit under the service's 64 MiB per-object
        // ceiling with room to spare, so a full part is never refused by the service for
        // being oversized - a failure the uploader would otherwise see as an opaque 502.
        const KB_PART_MAX = 40_000_000;

        // ---------- POST /sh/gh-put : RETIRED ----------
        // Script bytes no longer go into a GitHub repository. They go to the owner's PC
        // through the Storage Keeper service, which is the entire point of the change:
        // a private repo was still Cloudflare-adjacent hosting with a 100MB-per-file cap
        // and a commit per part, not the owner's own disk.
        //
        // AUTH BEFORE the 410, deliberately.
        //
        // Answering an unauthenticated caller with "this endpoint is retired" tells a
        // stranger something about the deployment for free. 401 first keeps the only
        // difference between "you may not ask" and "this is gone" behind a credential,
        // which is the same ordering every other write route in this worker uses.
        //
        // REFUSED rather than removed, and refused LOUDLY, because silently accepting
        // these would let new scripts keep landing in the repo the owner believes is
        // empty. Already-published scripts stay readable through /sh/g/<id>/<i> below -
        // refusing an upload must not orphan a script somebody is running right now.
        if (url.pathname === '/sh/gh-put' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            return jsonResponse({
                ok: false,
                error: 'GitHub script storage is retired. Use /sh/kb-put (Storage Keeper, stores on the owner\'s PC).'
            }, 410);
        }
        if (url.pathname === '/sh/gh-finalize' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            return jsonResponse({
                ok: false,
                error: 'GitHub script storage is retired. Use /sh/kb-finalize (Storage Keeper, stores on the owner\'s PC).'
            }, 410);
        }

        // ---------- POST /sh/kb-put : owner uploads ONE part to the owner's PC ----------
        // Body: { token|ownerProof, userToken, id, part (0-based), content (RAW string,
        // <=40MB - not base64; the service stores exactly these bytes) }
        if (url.pathname === '/sh/kb-put' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            if (!/^ScripterHub[0-9]{6,16}$/.test(String(body.id || ''))) return jsonResponse({ ok: false, error: 'id must be ScripterHub followed by 6 to 16 digits' }, 400);
            if (!storeConfigured(env)) {
                // Refusing beats falling back. The old fallback here was GitHub, which is
                // exactly where the owner asked to stop storing scripts.
                return jsonResponse({ ok: false, error: 'Storage Keeper is not configured (SH_STORE_URL / SH_STORE_TOKEN).' }, 503);
            }
            const id = String(body.id);
            const part = parseInt(String(body.part), 10);
            const content = String(body.content || '');
            if (!Number.isFinite(part) || part < 0 || part > 255) return jsonResponse({ ok: false, error: 'part must be 0..255' }, 400);
            if (!content) return jsonResponse({ ok: false, error: 'content required' }, 400);
            if (content.length > KB_PART_MAX) return jsonResponse({ ok: false, error: 'part too large (max 40MB raw)' }, 413);

            const put = await storePut(env, id, 'part' + part, content, null);
            if (put === false) return jsonResponse({ ok: false, error: 'storage keeper refused the part. Check the service is running and its token matches.' }, 502);
            if (put === null) return jsonResponse({ ok: false, error: 'storage keeper is unreachable. The part was NOT stored.' }, 503);

            // The index only records THAT a part exists. No bytes, no hash of the body.
            const recKey = KV_KB_PREFIX + id;
            const rec = parseJson(await env.LOADERS_KV.get(recKey)) || {};
            rec.parts = rec.parts || {};
            rec.parts[part] = { len: content.length };
            rec.id = id;
            await env.LOADERS_KV.put(recKey, JSON.stringify(rec), { expirationTtl: LOADER_TTL });
            return jsonResponse({ ok: true, part: part, len: content.length });
        }

        // ---------- POST /sh/kb-finalize : register the loader for a keeper-stored script ----------
        // Body: { token|ownerProof, userToken, id, n (part count), len (total bytes),
        //         name, user, keyless, webKey, keyHash, authRequired, replaces,
        //         cipherTail (optional - last slice kept in KV for the browser key page) }
        if (url.pathname === '/sh/kb-finalize' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            if (!/^ScripterHub[0-9]{6,16}$/.test(String(body.id || ''))) return jsonResponse({ ok: false, error: 'id must be ScripterHub followed by 6 to 16 digits' }, 400);
            if (!storeConfigured(env)) return jsonResponse({ ok: false, error: 'Storage Keeper is not configured (SH_STORE_URL / SH_STORE_TOKEN).' }, 503);
            const id = String(body.id);
            const recKey = KV_KB_PREFIX + id;
            const rec = parseJson(await env.LOADERS_KV.get(recKey)) || {};

            const n = parseInt(String(body.n), 10);
            if (!Number.isFinite(n) || n < 1) return jsonResponse({ ok: false, error: 'n (part count) required' }, 400);
            // Verify every part against the SERVICE, not against the index. The index
            // says a part was accepted; the service is what actually holds the bytes, and
            // it is also the authority on whether they are still there. Finalizing a
            // script with a missing part produces a loadstring that 404s halfway through
            // a chain, which is the "works until someone runs it" class of bug.
            for (let i = 0; i < n; i++) {
                const head = await storeMeta(env, id, 'part' + i);
                if (!head) {
                    return jsonResponse({ ok: false, error: 'part ' + i + ' is not in storage. Upload it before finalizing.' }, 400);
                }
            }
            rec.n = n;
            rec.len = Number(body.len) || 0;
            rec.at = Date.now();
            rec.name = String(body.name || 'script').slice(0, 100);
            rec.user = String(body.user || 'unknown').slice(0, 100);
            rec.keyless = body.keyless === true;
            rec.webKey = body.webKey === true;
            rec.keyHash = String(body.keyHash || '');
            rec.authRequired = body.authRequired === true;
            await env.LOADERS_KV.put(recKey, JSON.stringify(rec), { expirationTtl: LOADER_TTL });
            // ---- THE SPLIT KEY, WHICH LARGE SCRIPTS WERE LOSING ----
            //
            // Every build is compiled with a serverKey, so the artifact's last
            // layer is encrypted with the padded key and those bytes are not in
            // the file. The only copy is this record, served behind a session.
            //
            // kb-finalize never wrote it, so EVERY script that took the keeper
            // path - i.e. every large one - was published without the key its
            // own artifact requires. Delivery then found no key, fell back to
            // SHL, and the artifact died at runtime with:
            //
            //     [ScripterHub] Key response too short
            //
            // It is a small KV record even when the artifact is tens of
            // megabytes on the PC, which is why the bytes live in KV while only
            // the artifact lives in the keeper.
            if (body.splitKey && Array.isArray(body.splitKey.paddedKey) && body.splitKey.paddedKey.length) {
                await env.LOADERS_KV.put(KV_SKEY_PREFIX + id, JSON.stringify({
                    paddedKey: body.splitKey.paddedKey.map(n => n & 0xFF),
                    t0: Number(body.splitKey.t0) || 0,
                    chk: Number(body.splitKey.chk) || 0
                }), { expirationTtl: LOADER_TTL });
            } else if (body.keyless === true) {
                // A keyless build with no key cannot execute. Refusing beats
                // publishing a loadstring that fails on every user's machine
                // with an error that names nothing.
                return jsonResponse({
                    ok: false,
                    error: 'this build has no server-held key, so the script would be published in a form that cannot execute. Re-obfuscate it (this is a client/server version mismatch).'
                }, 400);
            }
            // register the loader meta so /sh/<id> serves the bootstrap
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({
                name: rec.name, user: rec.user, at: rec.at, keyHash: rec.keyHash,
                keyless: rec.keyless, webKey: rec.webKey, authRequired: rec.authRequired,
                storage: 'keeper', parts: n, len: rec.len
            }), { expirationTtl: LOADER_TTL });
            // optional cipher tail in KV (browser key page for keyed scripts)
            if (body.cipherTail && String(body.cipherTail).length < MAX_CIPHER_LEN) {
                await env.LOADERS_KV.put(KV_WEB_PREFIX + id, String(body.cipherTail), { expirationTtl: LOADER_TTL });
            }
            // kill the OLD loader (re-upload on edit)
            await maybeReplaceOld(env, body.replaces);
            const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
            ctx.waitUntil(notifyScriptDiscord(env, {
                event: 'script.published', outcome: 'ok',
                scriptId: id, userRef: await telemetryRef('user', rec.user),
                at: Date.now(), parts: n
            }));
            return jsonResponse({ ok: true, id, parts: n, loadstring: shLoader(base, id), loadstringPortable: shLoaderPortable(base, id) });
        }

        // The ORIGINAL /sh/gh-finalize body was removed here. It is unreachable - the 410
        // handler above matches the pathname first - and leaving it would mean two handlers
        // claiming one route, with the live one being the one that refuses.

        // ---------- POST /sh/kb-delete : owner deletes a keeper-stored script ----------
        // Body: { token|ownerProof, id }. Removes every part from the service, then the
        // index and meta.
        //
        // Parts MUST be removed explicitly. Nobody sweeps them up afterwards: the service's
        // cleanup is driven by expiry, and a deleted script has no expiry to pass, so a
        // forgotten part would sit on the owner's drive forever, invisible to every
        // number the dashboard reports. storeDelete with no kind removes every kind the
        // index knows for the id, which is what makes this a single call.
        if (url.pathname === '/sh/kb-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const id = String(body.id || '');
            if (!/^ScripterHub[0-9]{6,16}$/.test(id)) return jsonResponse({ ok: false, error: 'bad id' }, 400);
            if (!storeConfigured(env)) return jsonResponse({ ok: false, error: 'Storage Keeper is not configured.' }, 503);
            const rec = parseJson(await env.LOADERS_KV.get(KV_KB_PREFIX + id));
            let freed = 0;
            if (rec && rec.n) {
                for (let i = 0; i < rec.n; i++) {
                    if (await storeDelete(env, id, 'part' + i)) freed++;
                }
            }
            await env.LOADERS_KV.delete(KV_KB_PREFIX + id).catch(() => {});
            await env.LOADERS_KV.delete(KV_META_PREFIX + id).catch(() => {});
            await env.LOADERS_KV.delete(KV_WEB_PREFIX + id).catch(() => {});
            return jsonResponse({ ok: true, partsFreed: freed });
        }

        // ---------- POST /sh/gh-delete : owner deletes a GitHub-stored script ----------
        // Body: { token|ownerProof, id } - removes scripts/<id>/ folder
        // contents one by one (GitHub has no folder delete), then the KV meta.
        if (url.pathname === '/sh/gh-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const id = String(body.id || '');
            if (!/^ScripterHub[0-9]{6,16}$/.test(id)) return jsonResponse({ ok: false, error: 'bad id' }, 400);
            const rec = JSON.parse((await env.LOADERS_KV.get(KV_GH_PREFIX + id)) || 'null');
            if (rec && rec.n) {
                for (let i = 0; i < rec.n; i++) {
                    try {
                        await ghFetch(env, '/repos/' + rec.repo + '/contents/scripts/' + id + '/' + i + '.part', { method: 'DELETE', body: { message: 'storage: remove ' + id + '/' + i, sha: (rec.parts && rec.parts[i] ? rec.parts[i].sha : undefined) } });
                    } catch (e) { /* already gone */ }
                }
            }
            await env.LOADERS_KV.delete(KV_GH_PREFIX + id).catch(() => {});
            await env.LOADERS_KV.delete(KV_META_PREFIX + id).catch(() => {});
            await env.LOADERS_KV.delete(KV_WEB_PREFIX + id).catch(() => {});
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/gh-status : owner usage summary ----------
        if (url.pathname === '/sh/gh-status' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            // list sh_gh_* keys via KV list (paginated)
            let cursor = null, total = 0, scripts = 0, largest = 0;
            do {
                const page = await env.LOADERS_KV.list({ prefix: KV_GH_PREFIX, cursor: cursor });
                for (const k of (page.keys || [])) {
                    const rec = JSON.parse((await env.LOADERS_KV.get(k.name)) || '{}');
                    if (rec && rec.n) { scripts++; total += (rec.len || 0); largest = Math.max(largest, rec.len || 0); }
                }
                cursor = page.list_complete ? null : page.cursor;
            } while (cursor);
            return jsonResponse({
                ok: true, configured: !!(env.SH_GH_TOKEN && env.SH_GH_REPO),
                repo: env.SH_GH_REPO || null,
                scripts: scripts, totalBytes: total, largestBytes: largest,
                partMaxBytes: GH_PART_MAX
            });
        }

        // ---------- GET /sh/g/<id>/<i> : GitHub part proxy (chain-gated) ----------
        // Executors fetch Storage Keeper parts here; the worker pulls the
        // blob from the private repo and streams it out. The repo token never
        // leaves the worker.
        //
        // PHASE 3: this route used to be reachable by anyone who sent an
        // executor-looking User-Agent, which is a string anyone can type. It is
        // now behind guardPartRequest(), so a part is served only to a session
        // that already spent a delivery, and only as the next step of its own
        // forward-only chain.
        const gMatch = url.pathname.match(/^\/sh\/g\/(ScripterHub[0-9]{6,16})\/(\d+)$/);
        if (gMatch) {
            const limited = await guardRate(env, 'part', rateIdentity(request, url));
            if (limited) return limited;
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = gMatch[1];
            const idx = parseInt(gMatch[2], 10);
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua) || !Number.isFinite(idx) || idx < 0 || idx > 255) { S.threatsBlocked++; return methodNotAllowed(); }
            const raw = await env.LOADERS_KV.get(KV_GH_PREFIX + id);
            if (raw === null) return methodNotAllowed();
            let rec = {};
            try { rec = JSON.parse(raw); } catch (e) { return methodNotAllowed(); }
            if (!rec.repo || !rec.n || idx >= rec.n) { S.threatsBlocked++; return methodNotAllowed(); }
            const denied = await guardPartRequest(env, request, url, id, idx);
            if (denied) return denied;
            try {
                const part = await ghGetPart(env, rec.repo, 'scripts/' + id + '/' + idx + '.part', 'main');
                return new Response(part, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            } catch (e) {
                return methodNotAllowed();
            }
        }

        // ---------- GET /sh/kb/<id>/<i> : EXECUTOR-ONLY keeper part, proxied from the PC ----------
        // The /sh/g/ twin above, with the owner's storage service where GitHub was. It
        // reuses guardPartRequest, which is the whole gate: a part is served only to a
        // session that already spent a delivery, only as the next step of its own
        // forward-only chain, and only once. Reusing the gate rather than writing a
        // second one is deliberate - the checks are the security property, and two
        // copies of a security property drift.
        const kbMatch = url.pathname.match(/^\/sh\/kb\/(ScripterHub[0-9]{6,16})\/(\d+)$/);
        if (kbMatch) {
            const limited = await guardRate(env, 'part', rateIdentity(request, url));
            if (limited) return limited;
            if (!env.LOADERS_KV) return methodNotAllowed();
            if (!storeConfigured(env)) return methodNotAllowed();
            const id = kbMatch[1];
            const idx = parseInt(kbMatch[2], 10);
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua) || !Number.isFinite(idx) || idx < 0 || idx > 255) { S.threatsBlocked++; return methodNotAllowed(); }
            const rec = parseJson(await env.LOADERS_KV.get(KV_KB_PREFIX + id));
            if (!rec || !rec.n || idx >= rec.n) { S.threatsBlocked++; return methodNotAllowed(); }
            const denied = await guardPartRequest(env, request, url, id, idx);
            if (denied) return denied;
            const got = await storeGet(env, id, 'part' + idx);
            if (got.unreachable) {
                // Distinct from "gone". Reporting gone here would tell every running
                // executor its script had expired when the owner's PC was merely asleep.
                console.error('[ScripterHub] keeper part unreachable');
                return methodNotAllowed();
            }
            if (got.value === null) {
                // Missing or expired part. Byte-identical to how a missing script is
                // answered, for the same reason: a distinguishable answer is an oracle.
                return new Response('SHERR gone', {
                    status: 404,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            }
            return new Response(got.value, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ---------- GET /sh/auth/<id>?k=<license>&h=<hwid>&t=<t0> ----------
        // EXECUTOR-ONLY license auth (Luarmor model). The loader calls
        // this BEFORE it needs the split key; the response carries a
        // short-lived HMAC token that /sh/k then requires for
        // auth-required scripts. Possible bodies:
        //   "SHA <token> <expiresAtMs> <t0>"   -> success
        //   "SHERR invalid|banned|expired|hwid|killswitch|gone"
        // Wire format is plain text (no JSON in executors) and NEVER
        // contains the license key or any payload data.
        const authMatch = url.pathname.match(/^\/sh\/auth\/(ScripterHub[0-9]{6,16})$/);
        if (authMatch) {
            // License-key brute force. The audit measured 40/40 unauthenticated
            // guesses being served before this limit existed.
            {
                const rl = rateLimit('auth', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = authMatch[1];
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua)) { S.threatsBlocked++; return methodNotAllowed(); }
            const t0 = parseInt(String(url.searchParams.get('t') || ''), 10);
            const key = String(url.searchParams.get('k') || '').slice(0, 200);
            const hwid = String(url.searchParams.get('h') || '').slice(0, 300);
            const result = { key, hwid, scriptId: id, executor: sniffExecutor(ua), reason: '' };
            let body = 'SHERR gone';
            if (!Number.isFinite(t0) || !key || !hwid) {
                result.reason = 'missing params';
            } else if (await isKillswitchOn(env)) {
                result.reason = 'killswitch';
                body = 'SHERR killswitch';
            } else {
                // the script must actually exist and require auth
                let meta = {};
                try { meta = JSON.parse((await env.LOADERS_KV.get(KV_META_PREFIX + id)) || '{}'); } catch (e) {}
                if (meta.authRequired === true) {
                    const lic = await loadLicenses(env);
                    // The project this script belongs to, so a key bound to a
                    // different one is refused here as well as at the gate.
                    // Both paths classify, and a binding enforced in only one of
                    // them is a binding with a hole in it.
                    const verdict = classifyLicense(lic[key], hwid, Date.now(), meta.projectId);
                    if (verdict.code === 'ok') {
                        // first run locks the key to this hardware
                        if (!lic[key].hwid) { lic[key].hwid = hwid; }
                        lic[key].executions = (lic[key].executions || 0) + 1;
                        lic[key].lastAuthAt = Date.now();
                        await saveLicenses(env, lic);
                        const token = await makeAuthToken(key, hwid, t0);
                        const exp = Date.now() + AUTH_TOKEN_TTL_MS;
                        result.ok = true;
                        body = 'SHA ' + token + ' ' + exp + ' ' + t0;
                    } else {
                        result.reason = verdict.code;
                        body = 'SHERR ' + verdict.code;
                    }
                } else {
                    // keyless scripts never call /sh/auth; treat as gone
                    result.reason = 'no auth required for this script';
                }
            }
            if (!result.ok) S.threatsBlocked++;
            ctx.waitUntil(notifyAuthDiscord(env, result));
            return new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ---------- GET /sh/k/<id>?t=<t0>&a=<token> : SPLIT-KEY delivery ----------
        // The obfuscated file deliberately ships WITHOUT its final-layer
        // key. The runtime loader (inside the file) fetches it here right
        // before decrypting. Rules:
        //   - executor User-Agent only (browsers/AI/curl get nothing)
        //   - t=<t0> must be EXACTLY the t0 stored for this key (the one
        //     baked into the file), so a saved/replayed response is
        //     useless and no other request shape leaks bytes
        //   - AUTH-REQUIRED scripts ALSO demand a=<token> issued by
        //     /sh/auth (valid ~90s, bound to key+hwid) - without a valid
        //     license the split key is NEVER served, so the file cannot
        //     decrypt, period. (Luarmor: no server yes -> no script.)
        //   - the response embeds t0+chk+paddedKey; the Lua side verifies
        //     both AND regenerates the time pad, so even a MITM'd response
        //     with wrong values decrypts to garbage ("Goodluck Sonion")
        // ==================================================================
        // PHASE 3 — SESSION-GATED DELIVERY
        //
        // The loader URL is public and permanent. What changed is that it is
        // USELESS without a live, single-use, server-verified session.
        //
        // The flow, and what each step is for:
        //
        //   GET /sh/<id>          INIT LAYER only. No artifact bytes, ever.
        //          |
        //   POST /sh/session      authenticate -> D1 session + nonce (45s)
        //          |               nothing secret is returned
        //   GET /sh/v4_init/<id>.lua
        //                         THE GATE. consume nonce, consume session,
        //          |               then and only then read artifact bytes
        //          v
        //   (oversized only)
        //   GET /sh/c/<id>/<i>    one forward-only step of a chain
        //
        // (/sh/a/<id> is the same gate under its canonical name.)
        // The separation between "may I open a session" and "may I have the
        // bytes" is deliberate. Re-checking the license at BOTH is what makes
        // a ban effective on the very next request instead of up to 45s later,
        // and it is the specific hole the audit recorded as G06.
        // ==================================================================

        // ---------- THE HOST COMPILE PATH IS GONE ----------
        //
        // Three routes used to live here:
        //
        //   POST /sh/obfuscate-ticket  mint a signed pass to the owner's PC
        //   POST /sh/obfuscate         relay a compile to it (already retired)
        //   GET  /sh/obfuscate/health  ask whether it is awake
        //
        // All three existed for one reason: a browser tab could not obfuscate a
        // large script, so large scripts were compiled on the owner's machine,
        // through a cloudflared tunnel, and the product only worked while that
        // machine was awake. It does not need to any more - the bytecode VM was
        // what exhausted the tab, and custom-obfuscator.js now picks the
        // strongest tier that FITS, so a big source builds in the browser at
        // roughly its own size.
        //
        // They are removed rather than left answering "host not configured",
        // for two reasons. A route that can hand out a signed pass to the
        // owner's machine is an attack surface with no user left to serve: the
        // keeper's own token never leaves the worker, but a ticket does not
        // carry it - and a ticket route that outlives its caller is exactly the
        // kind of thing a future change finds and uses. And a route that
        // answers "ready: false" is a route that keeps the word "host" in the
        // product, which is the word that made people believe the site needed
        // their PC.
        //
        // A tab still running the old main.js gets a sentence it can act on,
        // not a bare 404.
        if (url.pathname === '/sh/obfuscate' || url.pathname === '/sh/obfuscate-ticket' || url.pathname === '/sh/obfuscate/health') {
            return jsonResponse({
                ok: false,
                reason: 'stale',
                error: 'This page is running an older copy of the site. Reload it (Ctrl+F5), then obfuscate again.'
            }, 410);
        }
        // ---------- POST|GET /sh/session : MINT ----------
        // In:  id, k (license), h (hwid), u (account email, keyless scripts)
        // Out: "SHS <sid> <nonce> <expiresAtMs>"  or  "SHERR <reason>"
        //
        // Plain text on the wire because executors cannot parse JSON without
        // a library, and this is on the critical path of every single run.
        //
        // The response carries NO artifact material. A caller who can mint a
        // session has proved a license, and that is all they get: proof, not
        // payload. The bytes require a second, separate, single-use request.
        {
            if (url.pathname === '/sh/session' && (request.method === 'POST' || request.method === 'GET')) {
                const limited = await guardRate(env, 'session', rateIdentity(request, url));
                if (limited) return limited;

                const now = Date.now();
                const state = stateFor(env);
                const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64) || null;
                const ua = (request.headers.get('User-Agent') || '').slice(0, 200);

                let body = {};
                if (request.method === 'POST') {
                    try { body = await request.json(); } catch (e) { body = {}; }
                }
                // GET fallback exists because game:HttpGet cannot POST. The
                // transport is recorded so the URL path is counted separately
                // in the audit log — its credential can reach access logs, and
                // that share of traffic must stay visible rather than being
                // averaged into the strong path (D5).
                const transport = request.method === 'POST'
                    ? (request.headers.get('Authorization') ? 'header' : 'url')
                    : 'url';
                const id = String(body.id || url.searchParams.get('id') || '');
                const key = String(body.k || url.searchParams.get('k') || '').slice(0, 200);
                const hwid = String(body.h || url.searchParams.get('h') || '').slice(0, 300);
                const userEmail = String(body.u || url.searchParams.get('u') || '').slice(0, 100);

                const deny = async (reason, extra) => {
                    S.threatsBlocked++;
                    if (state) {
                        try {
                            await state.audit({
                                event: 'session.denied', outcome: 'denied',
                                scriptId: /^ScripterHub[0-9]{6,16}$/.test(id) ? id : null,
                                userRef: userEmail ? await telemetryRef('user', userEmail) : null,
                                licenseRef: key ? await telemetryRef('lic', key) : null,
                                reason, transport, ip, ua, at: now
                            });
                        } catch (e) { /* audit must never break a request */ }
                    }
                    ctx.waitUntil(notifyTelemetry(env, Object.assign({
                        event: 'session.denied', outcome: 'denied',
                        scriptId: id, licenseRef: await telemetryRef('lic', key),
                        reason, transport, ip, at: now
                    }, extra || {})));
                    return new Response('SHERR ' + reason + '\n', {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
                    });
                };

                if (!state) {
                    console.error('[ScripterHub] /sh/session refused: D1 (SH_DB) is not bound or not migrated. '
                        + 'See wrangler.toml steps 2-3.');
                    return deny(DENY.NO_STATE);
                }
                if (!/^ScripterHub[0-9]{6,16}$/.test(id)) return deny(DENY.NO_SCRIPT);

                const script = await scriptAuthz(env, id);
                // A missing script must be a REFUSAL, not a crash.
                //
                // scriptAuthz returns null for an id that was never published,
                // was deleted, or was replaced by a newer build - all routine.
                // The next line then read `script.authRequired` on null, threw,
                // and the generic catch-all returned HTTP 500 with "worker
                // error: Cannot read properties of null", which tells the caller
                // nothing and hides the real answer (SHERR gone).
                //
                // Same class as the dead SHERR check: an error path that never
                // worked, so every failure on it presented as a different and
                // more alarming failure.
                if (!script) return deny(DENY.NO_SCRIPT);
                const killswitch = await isKillswitchOn(env);

                // D1 REVERSED. A keyless script needs no identity, no email and
                // no token. Two reasons.
                //
                // First, it did not work. The gate also required a SIGNED user
                // token that the loader had no way to carry, so a keyless script
                // was not "gated behind an account" - it was undeliverable. Users
                // were being asked to paste their email into an executor to reach
                // a script that then still refused them.
                //
                // Second, it bought nothing against a scraper. Retrieving a
                // keyless artifact is two requests - mint a session, spend it - and
                // a scrapper simply leaves the identity blank. What stands in the
                // way is the session itself: minted per request, single-use, and
                // rate limited to 30/min on `session` and 60/min on `deliver`.
                // That stops bulk. It does not stop one deliberate fetch, and
                // nothing delivered to a client can - whoever runs the code can
                // read it.
                //
                // Benchmarked as A9, reclassified from "blocked" to "accepted by
                // design" so the tradeoff stays visible instead of being tested
                // away.
                // userId is still written into the session row and the audit log,
                // so it is declared rather than deleted - a null here records that
                // no identity was presented, which is now the normal case and is
                // worth having in the trail.
                const userId = null;

                // Read fresh, never from a value captured earlier in the
                // request: an isolate outlives many requests and a stale map
                // would be a stale authorization decision.
                const licensesCache = await loadLicenses(env);
                const classify = (k, h, at, pid) => classifyLicense(licensesCache[k], h, at, pid);
                const verdict = classifyAuthorization({
                    noState: false,
                    scriptExists: !!script,
                    killswitch, scriptKilled: false,
                    visibility: script.visibility,
                    isOwner: userEmail.toLowerCase() === OWNER_EMAIL,
                    userId,
                    authRequired: script.authRequired,
                    scriptProjectId: script.projectId,
                    key, hwid, classify, now
                });
                if (verdict) return deny(verdict);

                // First successful auth locks the key to this hardware. Kept in
                // KV (the panel's copy) and mirrored to D1 by saveLicenses.
                let licenseKey = null;
                if (script.authRequired && key) {
                    const map = await loadLicenses(env);
                    const rec = map[key];
                    if (rec && !rec.hwid) {
                        rec.hwid = hwid;
                        await saveLicenses(env, map);
                    }
                }
                // Record the credential on the session ONLY for a keyed script.
                //
                // These were two separate questions and only one of them was
                // asked. "Is a licence required?" belongs to authRequired and
                // decides hardware binding. "Which key was presented?" decides
                // what a keyed delivery body can be encrypted with, and that
                // depends on `keyless` - a DIFFERENT flag.
                //
                // A script with keyless:false and authRequired:false therefore
                // got a session with no licence on it, and the delivery
                // contract for a non-keyless script is SHK - ciphertext, opened
                // by the key the visitor typed. With nothing on the session
                // there was nothing to encrypt with, so every such delivery was
                // either refused or served as plaintext the loader could not
                // decrypt - the reported "Wrong Special Key".
                //
                // WHY NOT `key` UNCONDITIONALLY. Recording it for a KEYLESS
                // script breaks that path outright: consumeSession() re-checks
                // the licence with an EXISTS subquery, so a key that was never
                // a licence for a free script - harmless at mint time, because
                // nothing needed it - becomes a hard 405 at delivery. A8 caught
                // exactly that. A keyless script delivers plain Lua (SHX) and
                // decrypts nothing, so it needs no credential recorded.
                if (key && !script.keyless) licenseKey = key;

                const ttl = transport === 'url' ? URL_SESSION_TTL_MS : SESSION_TTL_MS;
                let session;
                try {
                    session = await state.createSession({
                        scriptId: id, licenseKey, userId, hwid, transport,
                        ttlMs: ttl, now, ip, ua
                    });
                } catch (e) {
                    console.error('[ScripterHub] session mint failed: ' + (e && e.message));
                    return deny('error');
                }

                try {
                    await state.audit({
                        event: 'session.minted', outcome: 'ok', scriptId: id,
                        userRef: userId ? await telemetryRef('user', userId) : null,
                        licenseRef: key ? await telemetryRef('lic', key) : null,
                        sessionId: session.sid,
                        nonceRef: await telemetryRef('nonce', session.nonce),
                        reason: transport, transport, ip, ua, at: now
                    });
                } catch (e) { /* audit must never break a request */ }

                ctx.waitUntil(notifyTelemetry(env, {
                    event: 'session.minted', outcome: 'ok', scriptId: id,
                    licenseRef: await telemetryRef('lic', key),
                    sessionId: session.sid, transport, reason: 'minted', ip, at: now
                }));

                S.events.push({ t: now, executor: sniffExecutor(ua), scriptId: id });
                S.totalExecutions++;
                S.perScript[id] = (S.perScript[id] || 0) + 1;
                prune(now);
                saveStatsSoon(env);

                // Plain text, and the three values are the ONLY thing a caller
                // walks away with. A sid is a claim, not a credential: it is
                // worth exactly one artifact, for 45 seconds, on one script.
                return new Response('SHS ' + session.sid + ' ' + session.nonce + ' ' + session.expiresAt + '\n', {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            }
        }

        // ---------- GET|POST /sh/a/<id>?s=<sid>&n=<nonce> : THE GATE ----------
        // This is the only route in the worker permitted to return artifact
        // bytes, and it is behind two atomic statements in DELIVERY RULES below.
        //
        // Order is deliberate: spend the NONCE, then spend the SESSION. A
        // failure after the nonce is spent burns the session and forces a
        // re-mint, which can never deliver twice. The reverse order could.
        //
        // THE SECOND SPELLING: /sh/v4_init_<id>.lua
        //
        // The init layer (L2) fetches the artifact (L3) from a FILE-SHAPED
        // address, the way Luarmor's init file fetches
        // https://cdn.luarmor.net/v4_init_<key>.lua. It is the SAME route with
        // a different name - same gate, same nonce, same session, same bytes.
        // "cdn" here does NOT mean a public bucket: the artifact must stay
        // behind the same atomic gate, so the alias is a shape, not a hole.
        //
        // /sh/a/<id> stays the canonical spelling. The alias exists so the
        // init layer can look like what a Luarmor user expects to see, and so
        // a reader following the URL lands on a file name instead of a
        // query-string soup.
        {
            const aMatch = url.pathname.match(/^\/sh\/a\/(ScripterHub[0-9]{6,16})$/)
                || url.pathname.match(/^\/sh\/v4_init_(ScripterHub[0-9]{6,16})\.lua$/);
            if (aMatch && (request.method === 'POST' || request.method === 'GET')) {
                const limited = await guardRate(env, 'deliver', rateIdentity(request, url));
                if (limited) return limited;

                const id = aMatch[1];
                const now = Date.now();
                const state = stateFor(env);
                const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64) || null;
                const ua = (request.headers.get('User-Agent') || '').slice(0, 200);

                let body = {};
                if (request.method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
                const sid = String(body.s || url.searchParams.get('s') || '').slice(0, 80);
                const nonce = String(body.n || url.searchParams.get('n') || '').slice(0, 80);
                const transport = request.method === 'POST' && request.headers.get('Authorization') ? 'header' : 'url';

                const refuse = async (reason, status) => {
                    S.threatsBlocked++;
                    if (state) {
                        try {
                            await state.audit({
                                event: 'delivery.denied', outcome: 'denied', scriptId: id,
                                sessionId: sid || null,
                                nonceRef: nonce ? await telemetryRef('nonce', nonce) : null,
                                reason, transport, ip, ua, at: now
                            });
                        } catch (e) { /* audit must never break a request */ }
                    }
                    ctx.waitUntil(notifyTelemetry(env, {
                        event: 'delivery.denied', outcome: 'denied', scriptId: id,
                        sessionId: sid, reason, transport, ip, at: now
                    }));
                    return new Response('SHERR ' + reason + '\n', {
                        status: status || 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
                    });
                };

                if (!state) {
                    console.error('[ScripterHub] /sh/a refused: D1 (SH_DB) is not bound or not migrated.');
                    return refuse(DENY.NO_STATE);
                }
                if (!sid || !nonce) return refuse(DENY.NO_SESSION);
                if (!env.LOADERS_KV) return refuse(DENY.NO_STATE);
                if (await isKillswitchOn(env)) return refuse(DENY.KILLED);

                // ---- THE ATOMIC GATE ----
                const verdict = await deliver(state, { sid, nonce, scriptId: id, now });
                if (!verdict.ok) return refuse(verdict.reason);

                // ---- authorised. from here, bytes may be read. ----
                const script = await scriptAuthz(env, id);
                if (!script) return refuse(DENY.NO_SCRIPT);

                // Count the execution and bump the license counter.
                S.events.push({ t: now, executor: sniffExecutor(ua), scriptId: id });
                S.totalExecutions++;
                S.perScript[id] = (S.perScript[id] || 0) + 1;
                prune(now);
                saveStatsSoon(env);

                let licenseRef = null;
                // The licence key is needed in CLEARTEXT further down: a keyed
                // script is delivered as ciphertext and the visitor decrypts it
                // with the key they typed, so the body has to be encrypted with
                // the same one. Scoped out of the block below deliberately -
                // an earlier version read `row` from there and threw
                // "row is not defined" on every keyed delivery.
                let sessionLicenseKey = '';
                {
                    // The license that authorised this session is recorded on
                    // the session row itself, so read it back rather than
                    // guessing from the request. It is hashed for the log.
                    const row = await state.peekSession(sid, now);
                    sessionLicenseKey = row && row.license_key ? String(row.license_key) : '';
                    licenseRef = sessionLicenseKey ? await telemetryRef('lic', sessionLicenseKey) : null;
                }

                // ---- where do the bytes come from? ----
                const ghRaw = await env.LOADERS_KV.get(KV_GH_PREFIX + id);
                const isGithub = ghRaw !== null;
                const kbRaw = await env.LOADERS_KV.get(KV_KB_PREFIX + id);
                const isKeeper = kbRaw !== null;
                const cmetaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id);
                const isChunked = cmetaRaw !== null;
                let inlineBlob = '';
                // Set when the PC storage backend refused our credential, so the
                // final refusal can say THAT instead of blaming the script.
                let keeperAuthBroken = false;
                if (!isGithub && !isChunked && !isKeeper) {
                    // TRY THE PC FIRST, THEN KV. Not one or the other.
                    //
                    // This used to be an either/or: if the keeper was bound, only the PC
                    // was asked, and a miss was treated as "gone". That silently broke
                    // every script published BEFORE the storage move - their bytes are in
                    // KV and the PC has never heard of them - so binding SH_STORE_URL took
                    // 71 working scripts offline without a single error, which is the worst
                    // possible failure mode for a change whose whole promise was that
                    // existing scripts keep working.
                    //
                    // KV is therefore a FALLBACK, not a legacy branch. Two things fall out
                    // of that, both of them wanted:
                    //   * a pre-migration script still runs, and
                    //   * the site keeps serving those scripts while the owner's PC is off,
                    //     asleep, rebooting or mid-tunnel-restart. Only scripts actually
                    //     stored on the PC depend on the tunnel being up.
                    //
                    // A script stored ONLY on the PC is unaffected: it is not in KV, so
                    // the fallback misses and it refuses exactly as before.
                    if (storeConfigured(env)) {
                        const got = await storeGet(env, id, 'artifact');
                        if (got.unreachable) {
                            // Distinct from "gone". Reporting gone would tell every user
                            // their script had expired when the owner's PC was simply off.
                            // Falling through to KV is safe and is what keeps the
                            // pre-migration catalogue alive while the tunnel is down.
                            //
                            // A credential rejection lands here too, and it MUST:
                            // falling back to KV keeps a token-mismatch outage from
                            // taking every PC-hosted script offline, and the script is
                            // still there - only our copy of it is unreachable.
                            if (got.authFailed) {
                                keeperAuthBroken = true;
                            }
                            console.error('[ScripterHub] storage keeper unavailable'
                                + (got.authFailed ? ' (credential rejected)' : '')
                                + '; falling back to KV');
                        } else if (got.value !== null) {
                            // The service is the authority on whether the bytes exist AND
                            // whether they have expired - it refuses to serve an expired
                            // object, so a browser countdown lying about a script changes
                            // nothing here.
                            inlineBlob = got.value;
                        }
                    }
                    if (!inlineBlob) {
                        const rawInline = await env.LOADERS_KV.get(KV_PREFIX + id);
                        if (rawInline !== null) {
                            if (isEncrypted(rawInline)) {
                                const r = await tryDecryptAtRest(env, rawInline);
                                if (!r.ok) {
                                    // Refuse loudly rather than serving the raw
                                    // envelope. The operator needs to know the KEK
                                    // is missing; the user needs to know the script
                                    // is not broken.
                                    console.error('[ScripterHub] delivery refused: at-rest decrypt failed: ' + r.error);
                                    return refuse(DENY.NO_STATE);
                                }
                                inlineBlob = r.text;
                            } else {
                                inlineBlob = rawInline;
                            }
                        }
                    }
                }

                // A script whose metadata exists but whose body cannot be produced is not
                // a script anybody can run. Refuse with the one controlled answer rather
                // than returning an empty SHL body, which the loader would try to compile.
                if (!isGithub && !isChunked && !isKeeper && !inlineBlob) {
                    return refuse(DENY.NO_SCRIPT);
                }

                const needsChain = isGithub || isChunked || isKeeper;
                let total = 0;
                if (isChunked) { try { total = Number(JSON.parse(cmetaRaw).n) || 0; } catch (e) { total = 0; } }
                if (isGithub) { try { total = Number(JSON.parse(ghRaw).n) || 0; } catch (e) { total = 0; } }
                if (isKeeper) { try { total = Number(JSON.parse(kbRaw).n) || 0; } catch (e) { total = 0; } }

                // SMALL: everything in one response. This is the strong case:
                // one atomic consume, one response, nothing left to fetch, and
                // no way to come back for more.
                //
                // The limit is INLINE_DELIVERY_MAX (~6 MB), NOT the storage
                // threshold. An artifact under 25 MB used to be inlined, and a
                // real one shipped at 18,607,247 bytes took 13.9 s to fetch from
                // a workstation - which on an executor becomes a Cloudflare 524
                // and an HTML body, which the bootstrap reports as
                // "Unrecognised delivery format." So a large artifact now chains
                // instead of riding one response. See INLINE_DELIVERY_MAX.
                if (!needsChain && inlineBlob && inlineBlob.length <= INLINE_DELIVERY_MAX) {
                    const skRaw = await env.LOADERS_KV.get(KV_SKEY_PREFIX + id);
                    let sk = null;
                    if (skRaw) { try { sk = JSON.parse(skRaw); } catch (e) { sk = null; } }
                // The key line follows the SAME condition as the envelope.
                //
                // These used to be decided independently: the header by
                // script.keyless, the key line by whether a skey happened to
                // exist in KV. A keyless id that had once carried a split key
                // therefore got an SHL header with a key line welded on, and
                // the loader - which strips four bytes and nothing more for a
                // keyless envelope - fed those numbers to the parser as line 1:
                //
                //     1790455763315 7148516 228 127 190 ...
                //     loadstring:1: Expected identifier when parsing expression
                //
                // The artifact was never the problem. An SHL body is now pure
                // Lua by construction, whatever is in KV.
                //
                // SHX IS SHL PLUS A KEY LINE, and it exists because a KEYLESS
                // script had no server-only layer at all.
                //
                // The rule was "a keyless script has no licence to gate, so
                // there is nothing for a split key to protect" - which reads
                // sensibly and is wrong. The split key is not the licence; it
                // is the last layer of the artifact, and without it the file is
                // fully self-contained. That makes every free script a valid
                // single-sample deobfuscation target: paste the loadstring, get
                // the artifact, work on it offline at leisure.
                //
                // SHX carries the plain Lua AND the key line, and the key line
                // is what the bootstrap hands to the artifact in __SH_SPLITKEY.
                // The body is NOT ciphertext - the bootstrap only runs DEC for
                // KEYED scripts, because free scripts have no Special Key to
                // decrypt with. So SHX must not be spelled SHK: SHK means
                // "ciphertext follows", and a keyless bootstrap would treat
                // plain Lua as ciphertext, skip DEC, and hand the parser raw
                // key numbers on line 1 - the exact failure recorded above.
                let out, keyLine = sk ? (sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ')) : '';
                if (script.keyless) {
                    out = keyLine ? ('SHX\n' + keyLine + '\n') : 'SHL\n';
                    out += inlineBlob;
                } else {
                    out = 'SHK\n';
                    if (keyLine) out += keyLine + '\n';
                    // SHK MEANS CIPHERTEXT, SO IT HAS TO BE CIPHERTEXT.
                    //
                    // The blob here is the plain artifact, and the bootstrap
                    // runs DEC(getgenv().ScripterHubKey) over whatever follows
                    // this header - the LICENSE key. Serving plaintext under an
                    // SHK header made every keyed script fail the SHOK magic and
                    // die with "Wrong Special Key, or the delivery was tampered
                    // with", which is what the owner reported the moment he
                    // generated a license and ran the script.
                    //
                    // Encrypting with the session's own license key is the only
                    // pairing both sides can honour: the worker holds the key it
                    // validated at mint time, and the visitor holds the key they
                    // typed. It also means a leaked SHK body is useless without
                    // a valid licence - which is the point of the envelope.
                    const licKey = sessionLicenseKey;
                    if (!licKey) {
                        return refuse(DENY.NEEDS_KEY);
                    }
                    try {
                        out += shEncryptForLoader(inlineBlob, licKey);
                    } catch (e) {
                        console.error('[ScripterHub] SHK encrypt failed: ' + (e && e.message));
                        return refuse(DENY.NO_STATE);
                    }
                }
                    try {
                        await state.audit({
                            event: 'delivery.ok', outcome: 'ok', scriptId: id, sessionId: sid,
                            nonceRef: await telemetryRef('nonce', nonce),
                            licenseRef: licenseRef, reason: 'inline', transport, ip, ua, at: now
                        });
                    } catch (e) { /* audit must never break a request */ }
                    ctx.waitUntil(notifyTelemetry(env, {
                        event: 'delivery.ok', outcome: 'ok', scriptId: id, sessionId: sid,
                        reason: 'inline', transport, bytes: inlineBlob.length, ip, at: now
                    }));
                    return new Response(out, {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-store'
                        }
                    });
                }

                // An OVER-CAP blob with no chain to serve is still deliverable
                // INLINE, and this is the only place that can happen.
                //
                // Capping inline delivery at INLINE_DELIVERY_MAX created a dead
                // zone for PC-stored scripts, which is the same mistake the
                // chunking boundary warned about in the opposite direction:
                //
                //   needsChain = isGithub || isChunked || isKeeper
                //   a PC-only script has none of those, so needsChain is false
                //   18,592,590 > 6,000,000, so the inline branch above is skipped
                //   needsChain is false, so the chain branch below is skipped too
                //   -> refuse(NO_SCRIPT)
                //
                // Measured on a real deployment: the worker spent 11.7 s
                // SUCCESSFULLY fetching all 18 MB from the keeper, and then
                // reported "SHERR gone" - "this script does not exist" - for a
                // script that exists, is stored, and was fully retrieved.
                //
                // The chain machinery only exists for artefacts that were
                // SPLIT at upload time. A blob that arrived whole has no parts,
                // so the only thing to do with it is send it - and a 19 MB
                // response is exactly what INLINE_DELIVERY_MAX exists to
                // prevent, so this case must fail LOUDLY and honestly rather
                // than claim the script is gone.
                if (!needsChain && inlineBlob && inlineBlob.length > INLINE_DELIVERY_MAX) {
                    console.error('[ScripterHub] artefact for ' + id + ' is ' + inlineBlob.length
                        + ' bytes, over the ' + INLINE_DELIVERY_MAX + ' byte inline cap, and it was'
                        + ' stored whole (no parts to chain). It was NOT published in parts, so it'
                        + ' cannot be delivered in parts either. Re-upload it so it is split.');
                    return refuse('toobig');
                }

                // LARGE: open a forward-only chain and hand back a grant.
                // The session is ALREADY spent (deliver() ran). The chain is a
                // continuation of that one delivery, never an alternative.
                if (needsChain && total > 0) {
                    const chainExp = now + CHAIN_GRANT_TTL_MS;
                    const opened = await openChain(state, sid, total, chainExp, now);
                    if (!opened) return refuse(DENY.NO_SESSION);
                    const grant = await signGrant(await grantSecret(env), sid, id, chainExp);
                    let skRaw = await env.LOADERS_KV.get(KV_SKEY_PREFIX + id);
                    let sk = null;
                    if (skRaw) { try { sk = JSON.parse(skRaw); } catch (e) { sk = null; } }
                    let head = 'SHG ' + total + ' ' + (isGithub ? '/sh/g/' : isKeeper ? '/sh/kb/' : '/sh/c/') + id + ' ' + grant + '\n';
                    // SAME RULE AS THE INLINE PATH: the key line goes out
                    // whenever a key EXISTS, keyless or not.
                    //
                    // This still said `sk && !script.keyless`, which was correct
                    // when a keyless build shipped self-contained and had no key
                    // to send - and became the bug the moment every build got
                    // one (D29).
                    //
                    // It mattered most here. The inline path is only reached for
                    // artifacts that fit in one response; a large script is
                    // keeper-stored, so it chains, so it came through HERE and
                    // left without its key. The artifact then fell back to its
                    // own /sh/k, which needs a session it does not have, and
                    // died with:
                    //
                    //     [ScripterHub] Key response too short
                    //
                    // The inline fix looked complete and fixed nothing for large
                    // scripts, because it was a different branch. Two delivery
                    // paths, one rule, applied in one place - and the bug lived
                    // in the other.
                    if (sk) head += (sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ') + '\n');
                    try {
                        await state.audit({
                            event: 'delivery.ok', outcome: 'ok', scriptId: id, sessionId: sid,
                            reason: 'chain:' + total, transport, ip, ua, at: now
                        });
                    } catch (e) { /* audit must never break a request */ }
                    ctx.waitUntil(notifyTelemetry(env, {
                        event: 'delivery.ok', outcome: 'ok', scriptId: id, sessionId: sid,
                        reason: 'chain', transport, parts: total, ip, at: now
                    }));
                    return new Response(head, {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-store'
                        }
                    });
                }

                // The script's RECORD exists (scriptAuthz passed to reach
                // here) but no backend could produce its BYTES. When we know
                // the PC storage backend rejected our credential, say so: the
                // operator needs to fix a secret, and "gone" sends them to
                // delete a perfectly good script instead.
                if (keeperAuthBroken) return refuse('storageauth');
                return refuse(DENY.NO_SCRIPT);
            }
        }

        // ---------- GET /sh/k/<id>?t=&s=&n= : LEGACY SPLIT-KEY (hardened) ----------
        // The obfuscated file deliberately ships WITHOUT its final-layer key.
        // This route releases it.
        //
        // WHAT CHANGED IN PHASE 3, and why the old rules were not enough:
        //
        //   was:  executor UA + t0 must match + a=<token> where the token was
        //         HMAC(key|hwid|t0) keyed by SHA-256("SHAUTH::"+key)
        //   now:  executor UA + t0 must match + s=<sid>&n=<nonce> where BOTH
        //         are server-issued random values with a D1 row behind them,
        //         and the session is SPENT by this request
        //
        // The old token was not proof of anything: every input to the HMAC was
        // known to anyone holding the license key, so it could be computed
        // offline with no server involvement (gate G09). The new one cannot be
        // computed at all — sid and nonce come from crypto.getRandomValues()
        // and the only way to learn a valid pair is to have passed
        // /sh/session, which means the license was verified server-side.
        //
        // This route is kept so loadstrings already running in the wild keep
        // working. It is NOT how new loaders authenticate: they use /sh/a.
        const kMatch = url.pathname.match(/^\/sh\/k\/(ScripterHub[0-9]{6,16})$/);
        if (kMatch) {
            const limited = await guardRate(env, 'key', rateIdentity(request, url));
            if (limited) return limited;
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = kMatch[1];
            const now = Date.now();
            const state = stateFor(env);
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua)) { S.threatsBlocked++; return methodNotAllowed(); }
            const raw = await env.LOADERS_KV.get(KV_SKEY_PREFIX + id);
            if (raw === null) return methodNotAllowed();
            let sk = {};
            try { sk = JSON.parse(raw); } catch (e) { return methodNotAllowed(); }
            const wantT = parseInt(String(url.searchParams.get('t') || ''), 10);
            if (!Number.isFinite(wantT) || wantT !== sk.t0) { S.threatsBlocked++; return methodNotAllowed(); }

            const sid = String(url.searchParams.get('s') || '').slice(0, 80);
            const nonce = String(url.searchParams.get('n') || '').slice(0, 80);
            const refuse = async (reason) => {
                S.threatsBlocked++;
                if (state) {
                    try {
                        await state.audit({
                            event: 'delivery.denied', outcome: 'denied', scriptId: id,
                            sessionId: sid || null, reason, transport: 'url', at: now
                        });
                    } catch (e) { /* audit must never break a request */ }
                }
                ctx.waitUntil(notifyTelemetry(env, {
                    event: 'delivery.denied', outcome: 'denied', scriptId: id, sessionId: sid,
                    reason, transport: 'url', at: now
                }));
                return methodNotAllowed();
            };

            if (await isKillswitchOn(env)) return refuse(DENY.KILLED);

            // =================================================================
            // THE COMPATIBILITY WINDOW   (SH_LEGACY_SPLIT_KEY, default OFF)
            // =================================================================
            //
            // READ THIS BEFORE YOUR FIRST DEPLOY. IT IS A CUSTOMER-FACING
            // DECISION, AND DEPLOYING WITHOUT IT BREAKS LIVE SCRIPTS.
            //
            // The obfuscator BAKES the old request shape into the file
            // (custom-obfuscator.js:961):
            //
            //     requireKey ON  :  /sh/k/<id>?t=t0&a=<token>&k=KEY&h=HWID
            //     requireKey OFF :  /sh/k/<id>?t=t0
            //
            // Those bytes are already in your users' hands. Re-obfuscating does
            // not help them, and neither does re-copying the loadstring: the
            // loadstring is only
            //     loadstring(game:HttpGet(".../sh/<id>"))()
            // so the NEW bootstrap will be fetched, but the artifact it
            // delivers still contains the old baked-in chunk, which then calls
            // /sh/k in the old shape and gets 405.
            //
            // So a hard cutover breaks every already-published require-key
            // script, worldwide, on deploy day. Setting SH_LEGACY_SPLIT_KEY=1
            // keeps them working while you migrate.
            //
            // WHAT THE WINDOW COSTS, precisely. It is not a free switch:
            //
            //   G05 expired license -> STILL CLOSED. The live license re-check
            //                           below runs on this path too.
            //   G06 banned license  -> STILL CLOSED. So the kill switch and the
            //                           ban button keep working during the
            //                           window, which is what you actually need
            //                           when something goes wrong.
            //   G07 replay          -> RE-OPENED. The old token is
            //                           deterministic per (key, hwid, t0), so it
            //                           is replayable for as long as t0 is
            //                           baked, which is forever.
            //   G08 expiry          -> RE-OPENED. t0 never changes.
            //   G09 self-forged     -> RE-OPENED. Anyone holding a valid
            //                           license can compute the token offline.
            //
            // That is a genuine reduction, which is why the window should be
            // as short as you can make it. Note WHAT it does not give them:
            // the artifact is still assembled at runtime through /sh/session
            // and /sh/a, and the split key is still only the final decryption
            // layer. A valid license holder can make themselves a permanent
            // key-fetch credential; they still do not have the source.
            //
            // Every legacy delivery is counted as `legacy.delivery` in the
            // audit log AND in telemetry, so you can watch the number reach
            // zero and know the migration is finished rather than guessing.
            // Turn it off by removing the var (or setting "0") and redeploying.
            if ((!sid || !nonce) && legacySplitKeyEnabled(env)) {
                const script = await scriptAuthz(env, id);
                if (!script) return refuse(DENY.NO_SCRIPT);
                if (script.visibility === 'private') return refuse(DENY.HIDDEN);
                if (script.authRequired) {
                    const licenses = await loadLicenses(env);
                    const licKey = String(url.searchParams.get('k') || '').slice(0, 200);
                    const licHwid = String(url.searchParams.get('h') || '').slice(0, 300);
                    const v = classifyLicense(licenses[licKey], licHwid, now, script.projectId);
                    // G05/G06 close here: this is a LIVE check, not the token.
                    if (v.code !== 'ok') {
                        return refuse(v.code === 'banned' ? DENY.BANNED
                            : v.code === 'expired' ? DENY.EXPIRED
                                : v.code === 'hwid' ? DENY.HWID
                                    : v.code === 'project' ? DENY.PROJECT : DENY.NEEDS_KEY);
                    }
                }
                const body = 'SHK ' + sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ');
                S.events.push({ t: now, executor: sniffExecutor(ua), scriptId: id });
                S.totalExecutions++;
                S.perScript[id] = (S.perScript[id] || 0) + 1;
                prune(now);
                saveStatsSoon(env);
                if (state) {
                    try {
                        await state.audit({
                            event: 'legacy.delivery', outcome: 'ok', scriptId: id,
                            reason: 'compat-window', transport: 'url', at: now
                        });
                    } catch (e) { /* audit must never break a request */ }
                }
                ctx.waitUntil(notifyTelemetry(env, {
                    event: 'legacy.delivery', outcome: 'ok', scriptId: id,
                    reason: 'compat-window', transport: 'url', at: now
                }));
                return new Response(body, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            }

            if (!state) {
                console.error('[ScripterHub] /sh/k refused: D1 (SH_DB) is not bound or not migrated.');
                return refuse(DENY.NO_STATE);
            }
            if (!sid || !nonce) return refuse(DENY.NO_SESSION);

            // PHASE 4 — rotation check. A retired build's t0 no longer matches
            // the active one, so a re-upload kills the previous build's files
            // on the next request rather than whenever their last run happens
            // to notice. Scripts with no recorded build are exempt, because a
            // script published before rotation existed must keep working.
            if (state && !(await state.isActiveT0(id, wantT))) {
                return refuse('rotated');
            }

            // Identical atomic gate to /sh/a. Replay, expiry, ban-at-delivery
            // and forgery are all closed by these two statements, not by any
            // check above them.
            const verdict = await deliver(state, { sid, nonce, scriptId: id, now });
            if (!verdict.ok) return refuse(verdict.reason);

            const body = 'SHK ' + sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ');
            try {
                await state.audit({
                    event: 'delivery.ok', outcome: 'ok', scriptId: id, sessionId: sid,
                    reason: 'legacy-k', transport: 'url', at: now
                });
            } catch (e) { /* audit must never break a request */ }
            ctx.waitUntil(notifyTelemetry(env, {
                event: 'delivery.ok', outcome: 'ok', scriptId: id, sessionId: sid,
                reason: 'legacy-k', transport: 'url', at: now
            }));
            return new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ---------- GET /sh/c/<id>/<i> : CHUNK delivery (chain-gated) ----------
        // Serves chunk i of a chunked (large) script blob. Executors stitch
        // them in memory.
        //
        // PHASE 3: previously reachable by anyone sending an executor-looking
        // User-Agent, so a scraper could walk 0..19 and reassemble the whole
        // artifact from a fixed, guessable path. Now behind
        // guardPartRequest(): the session must have already spent a delivery,
        // and each index is one forward-only step.
        const cMatch = url.pathname.match(/^\/sh\/c\/(ScripterHub[0-9]{6,16})\/(\d+)$/);
        if (cMatch) {
            const limited = await guardRate(env, 'part', rateIdentity(request, url));
            if (limited) return limited;
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = cMatch[1];
            const idx = parseInt(cMatch[2], 10);
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua) || !Number.isFinite(idx) || idx < 0 || idx >= MAX_CHUNKS) {
                S.threatsBlocked++;
                return methodNotAllowed();
            }
            const metaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id);
            if (metaRaw === null) return methodNotAllowed();
            let cmeta = {};
            try { cmeta = JSON.parse(metaRaw); } catch (e) { return methodNotAllowed(); }
            if (idx >= cmeta.n) { S.threatsBlocked++; return methodNotAllowed(); }
            const denied = await guardPartRequest(env, request, url, id, idx);
            if (denied) return denied;
            // R2 artifact: ONE object serving index 0. No per-index chunk key
            // exists, because R2 objects are not split.
            let rawChunk;
            if (cmeta.r2 === 1 && r2Configured(env)) {
                if (idx !== 0) { S.threatsBlocked++; return methodNotAllowed(); }
                try {
                    const obj = await env.ARTIFACTS.get('a' + KV_PREFIX + id);
                    rawChunk = obj ? await obj.text() : null;
                } catch (e) {
                    console.error('[ScripterHub] R2 part read failed for ' + id + ': ' + (e && e.message));
                    rawChunk = null;
                }
            } else {
                rawChunk = await env.LOADERS_KV.get(KV_CHUNK_PREFIX + KV_PREFIX + id + '_' + idx);
            }
            if (rawChunk === null) return methodNotAllowed();
            let chunk = rawChunk;
            if (isEncrypted(rawChunk)) {
                const r = await tryDecryptAtRest(env, rawChunk);
                if (!r.ok) {
                    console.error('[ScripterHub] part decrypt failed: ' + r.error);
                    return methodNotAllowed();
                }
                chunk = r.text;
            }
            return new Response(chunk, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ---------- GET /sh/ScripterHub########## : THE PUBLIC LOADER ----------
        //
        // PHASE 3 — THIS ROUTE NO LONGER SERVES ARTIFACT BYTES. AT ALL.
        //
        // What it used to do, and why each part of it was a hole:
        //
        //   executor UA + keyless -> the obfuscated code, verbatim
        //   executor UA + keyed    -> a bootstrap with the CIPHERTEXT embedded
        //   browser + webKey      -> an HTML page with the CIPHERTEXT embedded
        //
        // All three handed the artifact to anyone who asked. The only barrier
        // was a User-Agent regex, and a User-Agent is a string a scraper types.
        // That is gate G01, G02 and G03, and it is the single biggest thing
        // this phase changes.
        //
        // What it does now:
        //
        //   executor UA -> the INIT LAYER: _bsdata0 + the cdn link + the
        //                  licensed handshake. It contains NO script material.
        //                  It authenticates via /sh/session and fetches via
        //                  /sh/v4_init_<id>.lua. The layer is IDENTICAL for
        //                  every script except the id and the base URL, so
        //                  inspecting it teaches an attacker nothing about any
        //                  artifact.
        //   browser     -> a metadata page. Name, id, and how to run it. No
        //                  cipher, no key, no decrypt box.
        //
        // The honest consequence, restated from decision D6: the loader URL is
        // public and permanent, and that is not going to change. What changed
        // is that it carries no authorization value on its own. Anyone can
        // open it. Nobody can extract anything from it.
        const shMatch = url.pathname.match(/^\/sh\/(ScripterHub[0-9]{6,16})$/);
        if (shMatch) {
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = shMatch[1];
            const ua = request.headers.get('User-Agent') || '';
            const isExecutor = EXECUTOR_UA.test(ua);

            const script = await scriptAuthz(env, id);
            if (!script) { S.threatsBlocked++; return methodNotAllowed(); }

            // Server-side visibility. This used to exist only as a
            // localStorage flag in the browser, so "private" hid a script in
            // the UI while this route still served anyone who asked. That is
            // gate G10.
            if (script.visibility === 'private' && !isExecutor) {
                S.threatsBlocked++;
                return new Response('This script is private.\n', {
                    status: 403,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
                });
            }

            if (!isExecutor) {
                S.threatsBlocked++;
                const pageBase = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
                return scriptPageResponse(id, script, pageBase);
            }

            S.events.push({ t: Date.now(), executor: sniffExecutor(ua), scriptId: id });
            S.totalExecutions++;
            S.perScript[id] = (S.perScript[id] || 0) + 1;
            prune(Date.now());
            saveStatsSoon(env);

            // The init layer (L2). No ciphertext, no key, no script-derived
            // material - just _bsdata0, the cdn link and the handshake.
            const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
            return new Response(luaSessionBootstrap(id, base, script.keyless), {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ================= STATS (existing) =================

        // ---------- POST /track : record an execution ----------
        if (url.pathname === '/track' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) {}
            const executor = String(body.executor || 'Unknown').slice(0, 40);
            const scriptId = String(body.scriptId || '').slice(0, 80);
            const now = Date.now();
            S.events.push({ t: now, executor: executor, scriptId: scriptId });
            S.totalExecutions++;
            if (scriptId) S.perScript[scriptId] = (S.perScript[scriptId] || 0) + 1;
            prune(now);
            saveStatsSoon(env);
            return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
        }

// =========================================================================
        // REWARD / AD-CHECKPOINT ROUTES
        // =========================================================================
        //
        // Shape of a visit, now that the config is server-side:
        //
        //   GET  /sh/reward/pub?rid=&fp=      what the visitor is allowed to see
        //   POST /sh/reward/start             open/resume a session, get the next step
        //   GET  /sh/reward/state?rid=&sid=   progress (for a reload, after a callback)
        //   POST /sh/reward/claim             mint a REAL license key
        //   POST /sh/reward/block             report a bypass attempt -> 2h blacklist
        //   GET  /sh/cp/<provider>?t=         the provider's landing URL (signed)
        //   POST /sh/reward/postback          the provider's server-to-server postback
        //   POST /sh/reward/save              OWNER: create or update a reward
        //   POST /sh/reward/delete            OWNER: remove one
        //
        // Every visitor route consults the blacklist BEFORE anything else, and
        // returns the same answer whether or not the caller knows a session id.
        // ------------------------------------------------------------------------

        // OWNER: create or update a reward. This is where the provider API
        // tokens finally land - server-side, where a visitor cannot read them.
        if (url.pathname === '/sh/reward/save' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, url, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);

            const inR = body.reward || {};
            const name = String(inR.name || '').trim().slice(0, 120);
            if (!name) return jsonResponse({ ok: false, error: 'Reward name is required.' }, 400);

            const rid = String(inR.rid || '').slice(0, 40) || newId('rw');
            const prev = await loadReward(env, rid);

            const cps = [];
            const rawCps = Array.isArray(inR.checkpoints) ? inR.checkpoints.slice(0, 40) : [];
            // The counters are SERVER STATE. The previous record is the authority.
            //
            // They used to be taken from the request body, which means the
            // browser's copy won every save. Since the panel never read the
            // live counters back (rewardPublicView did not include them), the
            // browser's copy was always stale - so every owner edit RESET the
            // completion history to whatever the localStorage mirror happened to
            // hold.
            //
            // That is the same defect as the panel showing a frozen count, seen
            // from the other side: the panel looked broken AND it was destroying
            // the data. Completion is recorded in one place only, /sh/cp/, and
            // it is not an editable field.
            //
            // Matched on the checkpoint's stable id, so reordering the list in
            // the panel does not move a checkpoint's history onto another one.
            const prevCps = ((prev && prev.checkpoints) || []);
            const prevById = {};
            for (const pc of prevCps) if (pc && pc.id) prevById[String(pc.id)] = pc;
            const unsupported = [];
            for (const c of rawCps) {
                const provider = String(c.provider || 'test');
                // LOUD, NOT SILENT.
                //
                // A checkpoint dropped here disappears from the visitor's
                // reward entirely, so a reward the owner believes has N steps
                // can become impossible to complete - and the owner is told
                // nothing. It is collected and refused instead, because a save
                // that quietly loses a checkpoint must not report success.
                if (!REWARD_PROVIDERS[provider]) {
                    unsupported.push({ name: String(c.name || '').slice(0, 80), provider: provider });
                    continue;
                }
                const st = c.settings || {};
                cps.push({
                    id: String(c.id || newId('cp')).slice(0, 40),
                    name: String(c.name || '').slice(0, 80),
                    provider: provider,
                    shortUrl: String(c.shortUrl || '').slice(0, 600),
                    settings: {
                        antiBypass: !!st.antiBypass,
                        advancedAntiBypass: !!st.advancedAntiBypass,
                        dynamicUrl: !!st.dynamicUrl,
                        authToken: String(st.authToken || '').slice(0, 200),
                        apiKey: String(st.apiKey || '').slice(0, 200),
                        // OPTIONAL. The Linkvertise link (or zone) the click has
                        // to belong to. A click id from ANY campaign is a real
                        // click, and without this it would count; with it, the
                        // provider's own answer has to mention this link.
                        linkId: String(st.linkId || '').slice(0, 120),
                        postbackUrl: String(st.postbackUrl || '').slice(0, 400)
                    },
                    completed: Number((prevById[String(c.id || '')] || {}).completed) || 0,
                    cancelled: Number((prevById[String(c.id || '')] || {}).cancelled) || 0,
                    avgTimeSec: Number((prevById[String(c.id || '')] || {}).avgTimeSec) || 0
                });
            }

            const rec = {
                rid: rid,
                owner: (prev && prev.owner) || '',
                name: name,
                keyDurationH: Math.min(Math.max(Number(inR.keyDurationH) || 1, 1), 24 * 30),
                maxKeys: Math.min(Math.max(Number(inR.maxKeys) || 1, 1), 100),
                cooldownH: Math.min(Math.max(Number(inR.cooldownH) || 0, 0), 24 * 30),
                maxHours: Math.min(Math.max(Number(inR.maxHours) || 0, 0), 24 * 365),
                allowExtending: !!inR.allowExtending,
                extHours: Math.min(Math.max(Number(inR.extHours) || 6, 1), 168),
                checkpoints: cps,
                createdAt: (prev && prev.createdAt) || Date.now(),
                updatedAt: Date.now()
            };
            // REFUSE THE SAVE, rather than store a reward the owner cannot
            // complete. Writing it and reporting ok is what let a five-step
            // reward silently become a four-step one that no visitor could
            // finish.
            if (unsupported.length) {
                return jsonResponse({
                    ok: false,
                    error: 'Unsupported provider: ' + unsupported.map(function (u) {
                        return u.provider + (u.name ? ' (' + u.name + ')' : '');
                    }).join(', ') + '. These cannot be verified and were not saved - the reward was left unchanged.',
                    unsupported: unsupported
                }, 400);
            }

            await saveReward(env, rec);

            // Which checkpoints can actually be completed right now. The panel
            // shows this, so an owner who typed a Linkvertise token into the
            // wrong box finds out here instead of discovering it as unpaid ads.
            const notReady = [];
            for (const c of cps) {
                const need = providerNeeds(c);
                if (!need.ok) notReady.push({ id: c.id, name: c.name, provider: c.provider, reason: need.reason });
            }

            return jsonResponse({
                ok: true, rid: rid,
                public: rewardPublicView(rec),
                notReady: notReady
            });
        }

        // OWNER: read a reward back in full, settings included.
        if (url.pathname === '/sh/reward/get' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, url, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const r = await loadReward(env, String(body.rid || ''));
            if (!r) return jsonResponse({ ok: false, error: 'no such reward' }, 404);
            return jsonResponse({ ok: true, reward: r });
        }

        if (url.pathname === '/sh/reward/delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, url, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            await deleteReward(env, String(body.rid || ''));
            return jsonResponse({ ok: true });
        }

        // VISITOR: what am I allowed to know about this reward?
        if (url.pathname === '/sh/reward/pub') {
            const limited = rewardRate(request, url, 'reward-start');
            if (limited) return limited;
            const rid = String(url.searchParams.get('rid') || '').slice(0, 40);
            const fp = String(url.searchParams.get('fp') || '').slice(0, 64);
            const ip = reqIp(request);
            const r = await loadReward(env, rid);
            if (!r) return jsonResponse({ ok: false, error: 'This reward link is no longer valid.' }, 404);

            const bl = await blacklistGet(env, fp, ip);
            S.totalVisitors++;
            return jsonResponse(Object.assign(
                { ok: true, public: rewardPublicView(r) },
                bl ? { blacklisted: true, until: bl.until, strikes: bl.strikes, reason: bl.reason } : {}
            ));
        }

        // VISITOR: open or resume the session and be told the next step.
        if (url.pathname === '/sh/reward/start' && request.method === 'POST') {
            const limited = rewardRate(request, url, 'reward-start');
            if (limited) return limited;
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);

            const rid = String(body.rid || '').slice(0, 40);
            const sid = String(body.sid || '').slice(0, 40);
            const fp = String(body.fp || '').slice(0, 64);
            const ip = reqIp(request);
            const r = await loadReward(env, rid);
            if (!r) return jsonResponse({ ok: false, error: 'This reward link is no longer valid.' }, 404);

            const bl = await blacklistGet(env, fp, ip);
            if (bl) {
                return jsonResponse({
                    ok: false, error: 'blacklisted', until: bl.until,
                    strikes: bl.strikes, reason: bl.reason
                });
            }

            const now = Date.now();
            // Derived, not accepted from the client. A client-supplied sid is
            // ignored entirely, because the whole point is that it cannot be
            // reset by clearing storage.
            const secret0 = await grantSecret(env);
            const resolved0 = await resolveSes(env, rid, fp, ip, secret0);
            const mySid = resolved0.sid;
            let ses = resolved0.ses;
            if (!ses) {
                ses = { rid: rid, sid: mySid, fp: fp, ip: ip, ua: reqUa(request), done: [], issued: [], startedAt: now, stepIndex: -1, stepAt: 0, nonces: {} };
            }
            if (sid && sid !== mySid) {
                // A stale or forged sid. Not fatal on its own - the derived one
                // wins - but recorded, because a client that keeps sending one is
                // either mid-migration from the old localStorage scheme or up to
                // no good.
                S.events.push({ t: now, executor: 'reward-sid-mismatch' });
            }
            // A session is bound to the fingerprint that opened it. Handing the
            // sid to someone else must not transfer their progress.
            if (ses.fp && fp && ses.fp !== fp) {
                const stolen = await blacklistAdd(env, fp, ip, 'session sid replayed from a different browser', rid);
                return jsonResponse({ ok: false, error: 'blacklisted', until: stolen ? stolen.until : now + REWARD_BLACKLIST_MS, strikes: stolen ? stolen.strikes : 1, reason: 'session replay' });
            }

            const next = rewardNextStep(r, ses, now);
            const doneCount = (ses.done || []).length;
            const total = (r.checkpoints || []).length;

            if (next.index === -1) {
                // Nothing to open. This does NOT write the session: the write
                // would carry whatever `done` was when the request started, and
                // a completion that landed in between would be rolled back.
                // A read is all this route needs here.
                return jsonResponse({
                    ok: true, sid: ses.sid, complete: true, done: doneCount, total: total,
                    keys: ses.issued || []
                });
            }

            const cp = r.checkpoints[next.index];
            const need = providerNeeds(cp);

            // OPENING A STEP WRITES THE SESSION - AND ONLY WHEN IT CHANGES.
            //
            // The old code wrote it unconditionally at the end of the route,
            // every single time. That write carried the whole session blob as
            // it was read at the START of the request, so a completion that
            // was recorded while this request was in flight was silently
            // rolled back by it. The page calls this route on every load and
            // after every completion, so the race was not rare - and the
            // symptom was "the checkpoint sometimes does not advance".
            //
            // The write is now under the session lock, it re-reads first, and
            // it merges only the fields this route owns (which step is open,
            // when it was opened, the nonce for it). The progress - the `done`
            // list and the earned keys - is never written from here, so it
            // cannot be lost.
            const secret = await grantSecret(env);
            await withSesLock(env, rid, ses.sid, async function () {
                let cur = await loadSes(env, rid, ses.sid);
                if (!cur) {
                    // FIRST TIME THIS FINGERPRINT HAS OPENED THIS REWARD. The
                    // session has to be CREATED here, not just updated - and it
                    // has to be created under the lock, or two simultaneous
                    // first visits would each write a session and one would be
                    // lost.
                    cur = {
                        rid: rid, sid: ses.sid, fp: fp, ip: ip, ua: reqUa(request),
                        done: [], issued: [], startedAt: now,
                        stepIndex: -1, stepAt: 0, nonces: {}
                    };
                }
                if (cur.stepIndex === next.index) {
                    // Already open. Do not touch the session at all.
                    ses.stepIndex = cur.stepIndex;
                    ses.stepAt = cur.stepAt;
                    ses.nonces = cur.nonces;
                    return;
                }
                cur.stepIndex = next.index;
                cur.stepAt = now;
                cur.nonces = cur.nonces || {};
                cur.nonces[next.index] = newId('n');
                cur.ip = ip;
                await saveSes(env, cur);
                ses.stepIndex = cur.stepIndex;
                ses.stepAt = cur.stepAt;
                ses.nonces = cur.nonces;
            });

            const stepToken = await signStep(secret, {
                rid: rid, sid: ses.sid, i: next.index,
                nonce: ses.nonces[next.index], exp: now + REWARD_STEP_TTL_MS
            });
            const origin = new URL(request.url).origin;
            const verifyUrl = origin + '/sh/cp/' + cp.provider + '?t=' + encodeURIComponent(stepToken);

            // The progress is re-read, not remembered: the completion that
            // landed during this request is in here, and the page is told the
            // truth.
            const fresh = await loadSes(env, rid, ses.sid);
            const doneNow = fresh ? (fresh.done || []).length : doneCount;
            return jsonResponse({
                ok: true, sid: ses.sid,
                step: {
                    i: next.index, name: cp.name || ('Checkpoint ' + (next.index + 1)),
                    provider: cp.provider,
                    // shortUrl goes to the visitor. It is the ad link itself; it
                    // is not a secret, and hiding it would only stop the ad
                    // from being viewable.
                    target: cp.shortUrl,
                    verifyUrl: verifyUrl,
                    // How the owner completes setup. Surfaced in the visitor's
                    // UI as a clear "this provider cannot be verified yet" rather
                    // than a silent stall.
                    ready: need.ok, notReady: need.ok ? '' : need.reason
                },
                done: doneNow, total: total, doneList: (fresh && fresh.done) || ses.done || [],
                complete: false,
                keys: (fresh && fresh.issued) || ses.issued || [],
                stepExpired: !!next.expired
            });
        }

        // VISITOR: progress after a callback, or after a reload.
        if (url.pathname === '/sh/reward/state') {
            // Its OWN bucket, not 'reward-start'. See the bucket table: this is
            // the 4-second progress poll, and sharing a 20/min budget with the
            // page-load calls meant an idle tab starved itself and the progress
            // stopped updating - reported as "it would not count as passed".
            const limited = rewardRate(request, url, 'reward-state');
            if (limited) return limited;
            const rid = String(url.searchParams.get('rid') || '').slice(0, 40);
            const sid = String(url.searchParams.get('sid') || '').slice(0, 40);
            const fp = String(url.searchParams.get('fp') || '').slice(0, 64);
            const ip = reqIp(request);
            const r = await loadReward(env, rid);
            if (!r) return jsonResponse({ ok: false, error: 'This reward link is no longer valid.' }, 404);

            const bl = await blacklistGet(env, fp, ip);
            if (bl) return jsonResponse({ ok: false, error: 'blacklisted', until: bl.until, strikes: bl.strikes, reason: bl.reason });

            // Same derivation as /sh/reward/start, so a visitor who cleared
            // localStorage still sees their own progress and their own keys.
            const sid0 = (await resolveSes(env, rid, fp, ip, await grantSecret(env))).sid;
            let ses = await loadSes(env, rid, sid0);
            if (!ses) return jsonResponse({ ok: true, sid: '', done: 0, total: (r.checkpoints || []).length, keys: [], complete: false });

            // A PROVIDER POSTBACK MAY HAVE LEFT A CLICK FOR THE OPEN STEP.
            //
            // LootLabs' documented mechanism is a server-to-server GET, so the
            // browser never holds the click id and the page has nothing to
            // submit. The click is bound to the visitor by the IP the provider
            // reported, and this poll is where it is picked up.
            if (ses && (ses.done || []).length < (r.checkpoints || []).length) {
                const counted = await completeStepFromProviderClick(env, rid, ip, ses);
                if (counted) ses = await loadSes(env, rid, sid0);
            }

            const total = (r.checkpoints || []).length;
            const done = (ses.done || []).length;
            return jsonResponse({
                // doneList travels alongside the count because the visitor's page
                // renders a per-checkpoint checklist, and a bare count cannot
                // tell it WHICH ones are ticked.
                ok: true, sid: ses.sid, done: done, total: total, doneList: ses.done || [],
                complete: total > 0 && done >= total,
                keys: ses.issued || [],
                cooldownUntil: (ses.lastCompletion || 0) + (r.cooldownH || 0) * 3600000
            });
        }

        // VISITOR: mint a REAL license key, once all checkpoints are verified.
        if (url.pathname === '/sh/reward/claim' && request.method === 'POST') {
            const limited = rewardRate(request, url, 'reward-claim');
            if (limited) return limited;
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);

            const rid = String(body.rid || '').slice(0, 40);
            const sid = String(body.sid || '').slice(0, 40);
            const fp = String(body.fp || '').slice(0, 64);
            const ip = reqIp(request);
            const r = await loadReward(env, rid);
            if (!r) return jsonResponse({ ok: false, error: 'This reward link is no longer valid.' }, 404);

            const bl = await blacklistGet(env, fp, ip);
            if (bl) return jsonResponse({ ok: false, error: 'blacklisted', until: bl.until, strikes: bl.strikes, reason: bl.reason });

            const resolvedC = await resolveSes(env, rid, fp, ip, await grantSecret(env));
            const sid0 = resolvedC.sid;
            const ses = resolvedC.ses;
            if (!ses) return jsonResponse({ ok: false, error: 'No session - open the reward first.' }, 400);
            if (ses.fp && fp && ses.fp !== fp) return jsonResponse({ ok: false, error: 'blacklisted' }, 403);

            const total = (r.checkpoints || []).length;
            const done = (ses.done || []).length;
            if (total === 0) return jsonResponse({ ok: false, error: 'This reward has no checkpoints.' }, 400);
            if (done < total) return jsonResponse({ ok: false, error: 'Not all checkpoints are complete.' }, 400);

            const cooldownUntil = (ses.lastCompletion || 0) + (r.cooldownH || 0) * 3600000;
            if (cooldownUntil > Date.now()) {
                return jsonResponse({ ok: false, error: 'cooldown', until: cooldownUntil });
            }

            // THE CLAIM IS ATOMIC AND IDEMPOTENT.
            //
            // The cap check and the mint have to happen under one lock, or two
            // requests that arrive together both see "0 of 1 issued" and both
            // mint. The visitor asked for one key and would get two - and the
            // session's issued list would only remember one of them, so the
            // second key would exist in the license table with nobody able to
            // see it.
            //
            // Under the lock the session is re-read, the cap is checked
            // against the FRESH count, and the key is minted and recorded
            // before the lock is released.
            let minted = null;
            let keys = ses.issued || [];
            let maxed = false;
            await withSesLock(env, rid, sid0, async function () {
                const cur = await loadSes(env, rid, sid0);
                if (!cur) return;
                const curIssued = cur.issued || [];
                if (curIssued.length >= (r.maxKeys || 1)) {
                    maxed = true;
                    keys = curIssued;
                    return;
                }
                const key = await issueRewardKey(env, r, cur);
                minted = key;
                keys = cur.issued || [];
            });
            if (maxed) {
                // Already at the cap. The existing keys are returned rather than
                // an error, because the visitor still needs to see what they
                // earned; the cap is enforced by refusing to mint more.
                return jsonResponse({ ok: true, keys: keys, maxed: true });
            }
            if (!minted) {
                return jsonResponse({ ok: false, error: 'The key could not be issued. Try again.', retryable: true }, 503);
            }
            return jsonResponse({ ok: true, keys: keys, key: minted, maxed: false });
        }

        // VISITOR: report a bypass attempt. Held server-side, keyed on
        // fingerprint AND ip, so clearing site data does not clear the ban.
        if (url.pathname === '/sh/reward/block' && request.method === 'POST') {
            // A REPORT IS NOT A FREE-FOR-ALL BAN MACHINE.
            //
            // This route takes a fingerprint from the request body and writes a
            // blacklist entry for it, so it was worth bounding: it is now rate
            // limited, and the reward it names has to exist. The fingerprint
            // itself is not a secret - it is a hash of the visitor's browser -
            // so the honest statement is that this route can pause a
            // fingerprint for up to eight minutes (the strikes double from one
            // minute, four deep) and cannot grant anything. It cannot be used
            // to earn a key, and it cannot be used to take one away.
            const limited = rewardRate(request, url, 'reward-block');
            if (limited) return limited;
            let body = {};
            try { body = await request.json(); } catch (e) { body = {}; }
            const fp = String(body.fp || '').slice(0, 64);
            const ip = reqIp(request);
            const blRid = String(body.rid || '').slice(0, 40);
            if (!fp && !ip) return jsonResponse({ ok: false, error: 'nothing to key on' }, 400);
            if (blRid) {
                const r = await loadReward(env, blRid);
                if (!r) return jsonResponse({ ok: false, error: 'unknown reward' }, 404);
            }
            const entry = await blacklistAdd(env, fp, ip, String(body.reason || 'bypass attempt').slice(0, 200), blRid);
            if (!entry) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            return jsonResponse({ ok: true, until: entry.until, strikes: entry.strikes });
        }

        // THE PROVIDER'S LANDING URL. The owner pastes this as the link target;
        // it carries a signed step token, so it cannot be forged or replayed
        // onto another visitor's step.
        if (url.pathname.startsWith('/sh/cp/')) {
            const limited = rewardRate(request, url, 'reward-cb');
            if (limited) return limited;
            const provider = url.pathname.slice('/sh/cp/'.length).replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
            const token = String(url.searchParams.get('t') || '');
            const origin = new URL(request.url).origin;
            const secret = await grantSecret(env);
            const now = Date.now();

            // ----------------------------------------------------------------
            // THE STATIC POSTBACK - the URL THE OWNER PASTES INTO THE PROVIDER
            // ----------------------------------------------------------------
            //
            // WHY THIS BRANCH EXISTS, AND WHY IT IS THE WHOLE BUG
            //
            // Everything below this point is reached through a SIGNED, PER-SESSION
            // token: /sh/reward/start mints `?t=<stepToken>` and that exact URL is
            // handed to the visitor as `verifyUrl`.
            //
            // That works only for a provider that will call a URL you can change
            // per visit. Linkvertise cannot. Its "direct link" is typed once into
            // a dashboard and is then fixed forever - the same string for every
            // visitor, forever. A per-session signed token can never be pasted
            // there, so the postback the owner configures and the postback the
            // worker expects were never the same URL, and NO linkvertise
            // checkpoint could EVER complete. Not a misconfiguration, not a slow
            // API: the two sides could not be joined at all.
            //
            // It presented as three separate problems, all of them downstream of
            // this one:
            //
            //   "it doesnt count"        the honest visitor watched the ad, came
            //                              back, and stayed at 0/1 - forever
            //   "it doesnt block me"     there was nothing to block, because no
            //                              step could be recorded either way
            //   "adding user key fails"   the key is minted on completion, so no
            //                              completion means no key, ever
            //
            // So the postback entry point has to be STATIC and per reward+step:
            //
            //     /sh/cp/<provider>?r=<rid>&i=<index>&site=<site base>
            //
            // The provider appends its own click id and redirects the visitor
            // here. The worker verifies the click against the provider's API and
            // bounces them back to reward.html carrying the click id, which
            // submits it against the session that actually started the step.
            //
            // `site` travels in the URL rather than being guessed, because the
            // worker has no way to know where the owner's static site lives and a
            // wrong guess would send every visitor to a 404.
            if (!token) {
                const rid = String(url.searchParams.get('r') || '').slice(0, 40);
                const idx = Number(url.searchParams.get('i'));
                const site = String(url.searchParams.get('site') || '').slice(0, 300);
                const clickId = pickClickId(url);
                // The IP THE PROVIDER SAW. LootLabs' documented postback
                // carries it, and it is the only thing that ties a click to
                // the machine that made it.
                const reportedIp = String(url.searchParams.get('ip') || '').slice(0, 64);
                const back = site.replace(/\/+$/, '') + '/reward.html';

                if (!rid || !Number.isInteger(idx) || idx < 0 || !site) {
                    return rewardCallbackPage(origin, 'failed', 'bad-postback');
                }
                const r = await loadReward(env, rid);
                if (!r || !(r.checkpoints || [])[idx]) {
                    return rewardCallbackPage(origin, 'failed', 'unknown-step');
                }
                if (r.checkpoints[idx].provider !== provider) {
                    return rewardCallbackPage(origin, 'failed', 'provider-mismatch');
                }
                const cp = r.checkpoints[idx];

                // NO CLICK ID MEANS NO PROOF, AND THE STEP CANNOT COUNT.
                //
                // This used to bounce the visitor back to the reward page
                // anyway, with nothing to submit. The page then asked for the
                // next checkpoint, the visitor watched the ad again, and the
                // provider sent them back to the same dead end - forever. That
                // is the "stuck in a loop between the provider and the site"
                // report, and it was invisible: every request looked fine.
                //
                // Without a click id there is nothing for the provider's API
                // to be asked about, so this checkpoint cannot be verified -
                // for this visitor or for anyone. The page now says so, and
                // the owner is told in the panel, instead of the visitor
                // discovering it by looping.
                if (!clickId) {
                    ctx.waitUntil(notifyTelemetry(env, {
                        event: 'reward.unverifiable', outcome: 'unverified', rid: rid,
                        reason: 'no-click-id', provider: provider, step: idx, at: now
                    }));
                    return rewardCallbackPage(origin, 'unverifiable', 'no-click-id');
                }

                // THE CLICK IS VERIFIED HERE, WITH THE PROVIDER, RIGHT NOW.
                //
                // It has to be here and not later. Linkvertise's anti-bypass
                // token is short lived - it is only valid for seconds after
                // the redirect and is deleted after that - so a check that
                // runs when the visitor's page submits, minutes later, always
                // fails. Verifying at the callback is both the only moment
                // that works and the moment the provider is actually
                // answering.
                //
                // It also means the parked row is a VERIFIED row. It used to
                // be an "a request arrived with this click id" row, which
                // anyone could produce by opening the postback url by hand -
                // and the provider check that was supposed to catch that
                // only looked at whether the API answered 200.
                const verdict = await verifyProvider(cp, {
                    clickId: clickId, ip: reportedIp || reqIp(request), elapsedMs: null
                });
                if (!verdict.ok) {
                    if (isTransientReason(verdict.reason)) {
                        ctx.waitUntil(notifyTelemetry(env, {
                            event: 'reward.unverified', outcome: 'unverified', rid: rid,
                            reason: verdict.reason, provider: provider, step: idx, at: now
                        }));
                        return rewardCallbackPage(origin, 'unverified', verdict.reason);
                    }
                    ctx.waitUntil(notifyTelemetry(env, {
                        event: 'reward.rejected', outcome: 'rejected', rid: rid,
                        reason: verdict.reason, provider: provider, step: idx, at: now
                    }));
                    return rewardCallbackPage(origin, 'failed', verdict.reason);
                }

                // PARK THE VERIFIED CLICK. One row per click id, so one click
                // cannot be spent twice, and the row carries the provider's
                // verdict and the IP the provider saw.
                const parked = await parkClick(env, clickId, {
                    r: rid, i: idx, at: now, ip: reportedIp || '',
                    provider: provider, verified: true, detail: verdict.detail
                });
                if (!parked.ok) {
                    return rewardCallbackPage(origin, 'failed', parked.reason);
                }

                const sep = back.indexOf('?') < 0 ? '?' : '&';
                const resumePart = '&resume=' + encodeURIComponent(clickId);
                return new Response(null, {
                    status: 302,
                    headers: {
                        Location: back + sep + 'rid=' + encodeURIComponent(rid) + resumePart,
                        'Cache-Control': 'no-store'
                    }
                });
            }

            const v = await verifyStep(secret, token, now);

            if (!v.ok) {
                return rewardCallbackPage(origin, 'failed', v.reason);
            }
            // The token body is { r, s, i, n, e } - SHORT field names, because
            // this string is signed, base64'd and pasted into a provider
            // dashboard, and every byte of it is visible there.
            //
            // These were destructured as { rid, sid, ... }, which is silently
            // undefined for every value, so the callback always answered
            // 'unknown-step' and NO checkpoint could ever be completed - not
            // even the test provider, which is why the flow looked untested
            // rather than broken.
            const { r: rid, s: sid, i, n } = v.body;

            const r = await loadReward(env, rid);
            if (!r || !(r.checkpoints || [])[i]) return rewardCallbackPage(origin, 'failed', 'unknown-step');

            // The callback URL names the provider in its path. A visitor cannot
            // move a Work.Ink checkpoint's completion onto a LootLabs one, or
            // onto a checkpoint that needs no verification at all.
            if (r.checkpoints[i].provider !== provider) {
                return rewardCallbackPage(origin, 'failed', 'provider-mismatch');
            }

            const ses = await loadSes(env, rid, sid);
            if (!ses) return rewardCallbackPage(origin, 'failed', 'no-session');
            if ((ses.done || []).indexOf(i) !== -1) return rewardCallbackPage(origin, 'ok', 'already');

            const cp = r.checkpoints[i];
            // The nonce is single use. Without this, one provider postback
            // replayed with an edited step index would advance two steps.
            ses.nonces = ses.nonces || {};
            if (ses.nonces[i] !== n) return rewardCallbackPage(origin, 'failed', 'replayed');

            const clickId = pickClickId(url);
            const elapsedMs = ses.stepAt ? (now - ses.stepAt) : null;
            // confirmed is what the test provider's own button posts. Without
            // it reaching verifyProvider, the test provider could NEVER pass - the
            // flow was unrunnable end to end, and therefore untested.
            const verdict = await verifyProvider(cp, {
                clickId: clickId, ip: reqIp(request), elapsedMs: elapsedMs,
                confirmed: url.searchParams.get('confirmed') === '1'
            });

            if (!verdict.ok) {
                // NOT VERIFIED IS NOT THE SAME AS CHEATING.
                //
                // Every failure below used to be answered with a ban. The owner
                // found out the hard way: he pressed Verify on a checkpoint he
                // had already completed, was told he was bypassing the ad
                // steps, and lost two hours - on his IP, so his phone and every
                // other browser were locked out too.
                //
                // These are the two things an HONEST visitor hits most often:
                //
                //   no-click-id  the provider has not reported the click back
                //                YET. Every real provider is asynchronous; the
                //                postback can land seconds after the ad closes.
                //   too-fast      the visitor pressed Verify within the 4s
                //                dwell floor. That is what pressing a button
                //                quickly looks like, and nothing else.
                //
                // Neither is evidence of intent, and banning on them punishes
                // exactly the people the feature is supposed to serve. They now
                // get an honest page telling them to wait, and no penalty at
                // all. An ad blocker is the usual cause and the page says so.
                //
                // WHAT IS DELIBERATELY NOT IN THIS LIST:
                //
                //   not-confirmed  someone hit the callback URL without the
                //                  confirm parameter the Verify button adds -
                //                  i.e. they skipped the step. That IS the
                //                  bypass, and it still earns a strike.
                //   replayed       a single-use nonce presented twice, which is
                //                  a genuine tamper of a signed capability.
                //
                // Those two are what the anti-bypass feature is actually for.
                // Removing them would have turned "stop cheating" into "never
                // detect anything".
                const TRANSIENT = ['no-click-id', 'too-fast', 'lv-unreachable', 'wi-unreachable',
                    'll-unreachable', 'lv-api-', 'wi-not-confirmed', 'll-api-'];
                const isTransient = TRANSIENT.some(function (r) {
                    return verdict.reason === r || String(verdict.reason).indexOf(r) === 0;
                });

                // MISCONFIGURED IS THE OWNER'S PROBLEM, NOT THE VISITOR'S.
                if (verdict.reason === 'no-auth-token' || verdict.reason === 'no-api-key'
                    || verdict.reason === 'unknown-provider' || verdict.reason === 'unverifiable-provider') {
                    return rewardCallbackPage(origin, 'failed', verdict.reason);
                }

                if (isTransient && verdict.reason !== 'replayed') {
                    ctx.waitUntil(notifyTelemetry(env, {
                        event: 'reward.unverified', outcome: 'unverified', rid: rid,
                        reason: verdict.reason, provider: provider, at: now
                    }));
                    // No strike, no ban, no lockout. The visitor can retry, and
                    // so can their phone.
                    return rewardCallbackPage(origin, 'unverified', verdict.reason);
                }

                const entry = await blacklistAdd(env, ses.fp, '',
                    'checkpoint ' + (i + 1) + ' via ' + provider + ': ' + verdict.reason, rid);
                ctx.waitUntil(notifyTelemetry(env, {
                    event: 'reward.blocked', outcome: 'blocked', rid: rid,
                    reason: verdict.reason, provider: provider, at: now
                }));
                return rewardCallbackPage(origin, 'failed', verdict.reason, entry ? entry.until : 0);
            }

            ses.done = (ses.done || []).concat([i]);
            ses.stepIndex = -1;
            ses.stepAt = 0;
            const total = (r.checkpoints || []).length;
            if (ses.done.length >= total) ses.lastCompletion = now;
            cp.completed = (cp.completed || 0) + 1;
            const spent = elapsedMs ? elapsedMs / 1000 : 0;
            cp.avgTimeSec = cp.avgTimeSec ? (cp.avgTimeSec * 0.7 + spent * 0.3) : spent;
            await saveReward(env, r);
            await saveSes(env, ses);

            ctx.waitUntil(notifyTelemetry(env, {
                event: 'reward.step', outcome: 'ok', rid: rid,
                provider: provider, step: i, detail: verdict.detail, at: now
            }));
            return rewardCallbackPage(origin, 'ok', '', 0, total - ses.done.length);
        }

        // -----------------------------------------------------------------------
// A PROVIDER CLICK COMES BACK, AND THE VISITOR'S PAGE SUBMITS IT.
//
// This is the second half of the static postback above. The worker cannot finish
// the step by itself: the click says "this visitor clicked an ad", and only the
// visitor's own page knows WHICH reward session they opened. That page is on the
// static site, a different origin, holding the session id and the fingerprint -
// so it posts them here together with the click id it was handed.
//
//   POST /sh/reward/complete  { rid, sid, fp, clickId }
//
// Everything that decides whether this counts is still server-side. The client
// contributes identifiers, never a verdict.
// ---------------------------------------------------------------------------
if (url.pathname === '/sh/reward/complete' && request.method === 'POST') {
    const limited = rewardRate(request, url, 'reward-submit');
    if (limited) return limited;
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const rid = String(body.rid || '').slice(0, 40);
    // The client sends a session id. It is NOT trusted: the session is looked
    // up by the id DERIVED from the fingerprint, so a client cannot point at
    // somebody else's session. The value the client sends is only used to
    // notice that it disagrees.
    const clientSid = String(body.sid || '').slice(0, 40);
    const fp = String(body.fp || '').slice(0, 64);
    // clickId arrives either in the POST body or in the URL (postback redirects
    // to reward.html?...&resume=<clickId>)
    const clickId = String(body.clickId || url.searchParams.get('resume') || url.searchParams.get('clickId') || '').slice(0, 120);
    const now = Date.now();

    // clickId is optional: the signed step token is already valid proof of a
    // genuine visit. Providers that don't append click_id to the redirect
    // (Linkvertise without the dashboard macro, LootLabs, etc.) should still
    // be able to complete the checkpoint.
    if (!rid || !fp) return jsonResponse({ ok: false, error: 'bad request' }, 400);
    // A CLICK ID IS REQUIRED. ALWAYS.
    //
    // This endpoint used to treat a missing click id as proof:
    //
    //     if (!clickId) { verdict = { ok: true, detail: 'no-click-id (skipped)' }; }
    //
    // The comment claimed the signed step token was sufficient - but that is
    // the OTHER route. This one is the static postback path, and there is no
    // signed token in it at all. So the rule was: POST this endpoint with no
    // click id and the checkpoint completes, with no provider contacted, no
    // click watched, and no evidence of anything.
    //
    // Two requests per checkpoint, then a key. That is the whole bypass, and
    // it is what "calling the completion endpoint directly" means.
    if (!clickId) {
        return jsonResponse({
            ok: false, error: 'No click was reported by the provider, so there is nothing to count.'
        }, 400);
    }

    const r = await loadReward(env, rid);
    if (!r) return jsonResponse({ ok: false, error: 'unknown reward' }, 404);

    // The session is found by the DERIVED id, not by the one the client sent.
    // A client cannot point at somebody else's session.
    const secret = await grantSecret(env);
    const resolved = await resolveSes(env, rid, fp, reqIp(request), secret);
    const sid = resolved.sid;
    const ses = resolved.ses;
    if (!ses) return jsonResponse({ ok: false, error: 'no session' }, 404);
    if (clientSid && clientSid !== sid) {
        // Not fatal - the derived id wins - but recorded, because a client that
        // keeps sending a different one is not this browser's.
        S.events.push({ t: now, executor: 'reward-sid-mismatch' });
    }

    // The session belongs to the browser that opened it. Handing someone else's
    // sid must not transfer their progress - the same rule /sh/reward/start
    // applies, and it is checked before anything is spent.
    if (ses.fp && fp && ses.fp !== fp) {
        const stolen = await blacklistAdd(env, fp, '', 'reward session replayed from a different browser', rid);
        return jsonResponse({ ok: false, error: 'blacklisted', until: stolen ? stolen.until : now + REWARD_BLACKLIST_MS, strikes: stolen ? stolen.strikes : 1, reason: 'session replay' });
    }

    const bl = await blacklistGet(env, fp, reqIp(request));
    if (bl && bl.until > now) {
        return jsonResponse({ ok: false, error: 'blacklisted', until: bl.until, strikes: bl.strikes || 1, reason: bl.reason || '' });
    }

    const i = Number(ses.stepIndex);
    if (!Number.isInteger(i) || i < 0 || !(r.checkpoints || [])[i]) {
        // Nothing is open. Either they already finished it (the old signed path
        // recorded it) or the session expired. Either way this is not an attack,
        // so it is a plain error and never a strike.
        return jsonResponse({ ok: false, error: 'no open checkpoint' });
    }
    const cp = r.checkpoints[i];

    // THE CLICK MUST HAVE BEEN REPORTED BY THE PROVIDER, AND VERIFIED.
    //
    // The parked row is written by the worker itself, and only AFTER the
    // provider confirmed the click (see the static postback). It is the
    // evidence that this click is real, that it belongs to THIS reward and
    // THIS checkpoint, and - when the provider reports the clicker's IP -
    // that it came from the machine that is now asking for the reward.
    const pj = await readParkedClick(env, clickId);
    if (!pj) {
        return jsonResponse({ ok: false, error: 'That click was not reported by the provider. Watch the ad all the way through.' });
    }
    if (!pj.verified) {
        return jsonResponse({ ok: false, error: 'That click was not verified by the provider.' });
    }
    if (pj.spent) {
        return jsonResponse({ ok: false, error: 'That click has already been used.' });
    }
    if (pj.r !== rid || pj.i !== i) {
        return jsonResponse({ ok: false, error: 'That click belongs to a different checkpoint.' });
    }

    // THE IP THE PROVIDER SAW, AGAINST THE IP ASKING FOR THE REWARD.
    //
    // This is the strongest signal the providers actually give us, and
    // Luarmor says the same thing: they are "limited to the APIs provided by
    // advertiser platforms". LootLabs' postback carries the clicker's IP,
    // Work.Ink's confirm endpoint takes it, and the reward session is bound
    // to an IP too. A click made on one machine and claimed from another is
    // not a person who watched an ad.
    //
    // It REFUSES the completion, and it does NOT punish anybody. A phone that
    // changes network between the ad and the callback is a normal thing that
    // happens, and this repository has been bitten by exactly that before: a
    // penalty keyed on the address locked out a whole household, and a
    // two-hour ban for a misclick cost the owner an afternoon. Changing your
    // IP address is listed as something a visitor must never be punished for.
    //
    // So the click is refused - the reward is not paid out - and the refusal
    // is recorded, but no strike is added and nobody is banned.
    //
    // Only applied when the provider reported an IP. A provider that does not
    // send an IP is not a reason to refuse an honest visitor.
    const reqIpNow = reqIp(request);
    if (pj.ip && reqIpNow && pj.ip !== reqIpNow) {
        ctx.waitUntil(notifyTelemetry(env, {
            event: 'reward.rejected', outcome: 'rejected', rid: rid,
            reason: 'ip-mismatch', provider: cp.provider, step: i, at: now
        }));
        return jsonResponse({
            ok: false, error: 'That click was made on a different network, so it cannot be counted. '
                + 'No penalty has been added - try the ad again.'
        }, 400);
    }

    const elapsedMs = ses.stepAt ? (now - ses.stepAt) : null;

    // The provider was already asked, at the callback, and the answer is in
    // the parked row. It is NOT asked again here: Linkvertise's anti-bypass
    // token is only valid for seconds, so a second check would always fail
    // and every honest visitor would be told the checkpoint did not count.
    if (elapsedMs != null && elapsedMs < REWARD_MIN_DWELL_MS) {
        return jsonResponse({ ok: false, error: 'Not counted yet - too-fast', transient: true });
    }

    // THE CLICK IS SPENT ONLY NOW, AFTER EVERY CHECK HAS PASSED.
    //
    // It used to be deleted before the provider was asked, so a provider that
    // was briefly unreachable consumed the click and the visitor had to watch
    // the ad again. A transient failure must not cost the visitor the ad.
    await spendParkedClick(env, clickId);

    if ((ses.done || []).indexOf(i) !== -1) {
        return jsonResponse({ ok: true, done: ses.done.length, total: (r.checkpoints || []).length, keys: ses.issued || [], already: true });
    }

    // THE COMPLETION IS RECORDED UNDER THE SESSION LOCK, AND RE-READ AFTER.
    //
    // The write is a read-modify-write of one JSON blob, and the page's own
    // /sh/reward/start writes the same blob. Without the lock and the
    // re-read, one of the two writes wins and the completion is silently
    // gone - the visitor is back at 0/1 with a key they earned, watching the
    // ad again. That is the "the checkpoint progression sometimes does not
    // advance" bug, and it is a race, so it only shows up sometimes.
    const total = (r.checkpoints || []).length;
    let recorded = false;
    await withSesLock(env, rid, sid, async function () {
        const cur = await loadSes(env, rid, sid);
        if (!cur) return;
        if ((cur.done || []).indexOf(i) === -1) {
            cur.done = (cur.done || []).concat([i]);
            cur.stepIndex = -1;
            cur.stepAt = 0;
            if (cur.done.length >= total) cur.lastCompletion = now;
            await saveSes(env, cur);
        }
        // Read it back. If the completion is not there, another writer landed
        // after us - apply it again rather than lose it.
        const back = await loadSes(env, rid, sid);
        recorded = !!(back && (back.done || []).indexOf(i) !== -1);
        if (!recorded) {
            const again = await loadSes(env, rid, sid);
            if (again) {
                again.done = (again.done || []).concat([i]);
                again.stepIndex = -1;
                again.stepAt = 0;
                if (again.done.length >= total) again.lastCompletion = now;
                await saveSes(env, again);
                recorded = true;
            }
        }
    });
    if (!recorded) {
        return jsonResponse({ ok: false, error: 'The completion could not be recorded. Try again.', retryable: true }, 503);
    }

    // The counters live on the reward record, which is a SEPARATE blob from
    // the session, so a completion cannot roll back the owner's settings.
    cp.completed = (cp.completed || 0) + 1;
    const spent = elapsedMs ? elapsedMs / 1000 : 0;
    cp.avgTimeSec = cp.avgTimeSec ? (cp.avgTimeSec * 0.7 + spent * 0.3) : spent;
    await saveReward(env, r);

    ctx.waitUntil(notifyTelemetry(env, {
        event: 'reward.step', outcome: 'ok', rid: rid,
        provider: cp.provider, step: i, detail: pj.detail || 'verified', at: now
    }));
    const after = await loadSes(env, rid, sid);
    return jsonResponse({
        ok: true, done: (after && (after.done || []).length) || 0,
        total: total, keys: (after && after.issued) || []
    });
}

// THE PROVIDER'S SERVER-TO-SERVER POSTBACK.
//
// LootLabs' documented mechanism (help.lootlabs.gg, "Postback API"): every
// time a user completes a task, the provider sends a GET to the publisher's
// postback url with
//
//     click_id   identifies the link / the visitor
//     ip         the IP of the user who completed the task
//     unique_id  a unique id per completed task, for de-duplication
//
// There is no documented "ask LootLabs about this click" endpoint, so the
// postback IS the evidence - and it has to be AUTHENTICATED, or anyone could
// call the url and complete a checkpoint. The owner puts a secret in the
// postback url (the same API key they already paste for this provider) and
// the worker compares it in constant time.
//
// The click is parked with the IP the provider reported, and the visitor's
// own poll picks it up and counts it - that poll is bound to the visitor's
// IP, which is what ties the provider's click to a machine.
//
// The old implementation called lootlabs.com/api/lootlabs_postback with the
// key in a `status` parameter. That endpoint is not in LootLabs' docs, and
// an unverifiable call is worse than no call: it either fails for honest
// visitors or passes for everybody.
        if (url.pathname === '/sh/reward/postback') {
            const limited = rewardRate(request, url, 'reward-cb');
            if (limited) return limited;
            let body = {};
            if (request.method === 'POST') {
                try { body = await request.json(); } catch (e) { body = {}; }
            } else {
                // The documented shape: a GET with query parameters.
                body = {
                    rid: url.searchParams.get('rid') || '',
                    step: url.searchParams.get('step') || url.searchParams.get('i'),
                    click_id: url.searchParams.get('click_id') || url.searchParams.get('clickId') || '',
                    ip: url.searchParams.get('ip') || '',
                    unique_id: url.searchParams.get('unique_id') || url.searchParams.get('uniqueId') || '',
                    key: url.searchParams.get('key') || ''
                };
            }
            const rid = String(body.rid || '').slice(0, 40);
            const i = Number(body.step);
            if (!rid || !Number.isInteger(i)) return jsonResponse({ ok: false, error: 'bad request' }, 400);
            const r = await loadReward(env, rid);
            if (!r || !(r.checkpoints || [])[i]) return jsonResponse({ ok: false, error: 'unknown step' }, 400);
            const cp = r.checkpoints[i];
            const clickId = String(body.click_id || '').slice(0, 120);
            if (!clickId) return jsonResponse({ ok: false, error: 'No click_id - the provider did not report back.' }, 400);

            // THE SHARED SECRET. The owner pastes their provider key into the
            // postback url, and the provider sends it back. Without it this
            // route is an open door: anybody could post a click id and
            // complete a checkpoint.
            //
            // Either credential the provider uses will do - the API key for
            // LootLabs, the auth token for a provider that uses one - because
            // the owner already had to paste one of them for this checkpoint.
            const presented = String(body.key || '').slice(0, 200);
            const st = cp.settings || {};
            const expected = String(st.apiKey || st.authToken || '').slice(0, 200);
            if (!expected || !presented || !hashEqual(presented, expected)) {
                ctx.waitUntil(notifyTelemetry(env, {
                    event: 'reward.rejected', outcome: 'rejected', rid: rid,
                    reason: 'postback-unauthenticated', provider: cp.provider, step: i, at: Date.now()
                }));
                return jsonResponse({ ok: false, error: 'postback not authenticated' }, 403);
            }

            const verdict = await verifyProvider(cp, {
                clickId: clickId,
                ip: String(body.ip || '').slice(0, 64),
                elapsedMs: null,
                postback: true
            });
            if (!verdict.ok) {
                return jsonResponse({ ok: false, error: verdict.reason }, isTransientReason(verdict.reason) ? 202 : 400);
            }

            const parked = await parkClick(env, clickId, {
                r: rid, i: i, at: Date.now(),
                ip: String(body.ip || '').slice(0, 64),
                provider: cp.provider, verified: true, detail: verdict.detail
            });
            if (!parked.ok) {
                // The same click reported twice is not an error worth failing
                // loudly over: the first report already counted.
                return jsonResponse({ ok: true, already: true, reason: parked.reason });
            }
            return jsonResponse({ ok: true, rid: rid, step: i });
        }

        // =========================================================================
        // FILE DOWNLOAD - "Generate Obfuscated Code"
        // =========================================================================
        //
        // GET /sh/dl/<id>[?e=<unixSeconds>]
        //
        // Serves the stored artifact as a file attachment instead of as a
        // loadstring. Aegis does this; the difference is that a loadstring is
        // a bootstrap that FETCHES the code, while this IS the code.
        //
        // WHAT A DOWNLOAD IS, AND IS NOT
        //
        // The bytes are the same artifact an executor receives. There is no
        // server in front of a downloaded file, so this is a DIFFERENT product
        // from license-gated hosted delivery, not a second door into it. The
        // link is a bearer token for the artifact.
        //
        // THE EXPIRY MUST NOT TOUCH HOSTED DELIVERY
        //
        // `?e=` governs THIS ROUTE ONLY. The hosted path is a different route
        // with different state, so a download link dying cannot stop a
        // published script from running. That is asserted in
        // tools/download_test.mjs, because the obvious implementation - one
        // expiry flag read by both - takes working scripts offline every time
        // somebody's download lapses.
        // ------------------------------------------------------------------------
        {
            const dlMatch = url.pathname.match(/^\/sh\/dl\/(ScripterHub[0-9]{6,16})$/);
            if (dlMatch && (request.method === 'GET' || request.method === 'HEAD')) {
                const limited = await guardRate(env, 'download', rateIdentity(request, url));
                if (limited) return limited;

                const id = dlMatch[1];
                const meta = await scriptAuthz(env, id);
                if (!meta) return new Response('This download link is not valid.', { status: 404, headers: CORS_HEADERS });

                // ---- expiry, enforced HERE and nowhere else ----
                const expRaw = url.searchParams.get('e');
                let expiresAt = 0;
                if (expRaw) {
                    expiresAt = parseInt(expRaw, 10) || 0;
                    if (!Number.isFinite(expiresAt) || expiresAt <= 0) expiresAt = 0;
                    if (expiresAt && expiresAt < Math.floor(Date.now() / 1000)) {
                        return new Response('This download link has expired. Generate a new one from your ScripterHub dashboard.',
                            { status: 410, headers: CORS_HEADERS });
                    }
                }

                // ---- the bytes ----
                //
                // Only a keyless artifact is downloadable as-is. A key-required
                // script stores CIPHERTEXT (encrypted with the Special Key), and
                // handing that over as "your obfuscated script" produces a file
                // that cannot run and looks like a broken download. Refused here
                // with the reason, instead of discovered by whoever opens it.
                if (!meta.keyless) {
                    return new Response(
                        'This script is key-required, so its stored copy is encrypted and cannot be downloaded as a runnable file. '
                        + 'Key-required download support is not enabled on this deployment yet.',
                        { status: 501, headers: CORS_HEADERS });
                }

                const got = await getBlob(env, id, KV_PREFIX);
                if (got === null || got === '') {
                    return new Response('This script is not available for download.', { status: 404, headers: CORS_HEADERS });
                }

                // ---- filename ----
                //
                // SCRIPT NAMES ARE USER-CONTROLLED AND THIS GOES INTO A HEADER.
                //
                // CR or LF would inject headers; a double quote would truncate
                // filename="..." and let the rest of the name become arbitrary
                // header content. So this is a STRIP against a small allowlist,
                // not a replace-with-underscore, and the result is length-capped.
                //
                // The control-character class is written ESCAPED. It was first
                // written with literal control bytes, which put raw 0x00-0x1f
                // characters into worker.js itself - caught by the repo's own
                // control_chars gate, which is the only reason it was found.
                const rawName = String(meta.name || 'script');
                const clean = rawName
                    .replace(/[\u0000-\u001f\u007f]/g, '')
                    .replace(/[^A-Za-z0-9 _.-]/g, '')
                    .trim()
                    .replace(/\s+/g, ' ')
                    .slice(0, 60) || 'script';
                const num = (id.replace(/^ScripterHub/, '') || '').slice(0, 16);
                const filename = clean + '-ScripterHub(' + num + ').lua';

                const headers = {
                    'Content-Type': 'text/plain; charset=utf-8',
                    // ASCII fallback, plus RFC 5987 for non-ASCII that survives
                    // the allowlist above (today none does, but widening the
                    // allowlist must not silently corrupt every filename).
                    'Content-Disposition': 'attachment; filename="' + filename + '"; '
                        + "filename*=UTF-8''" + encodeURIComponent(filename),
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*'
                };
                if (expiresAt) headers['X-Download-Expires'] = String(expiresAt);

                ctx.waitUntil(notifyTelemetry(env, {
                    event: 'download.served', outcome: 'ok', scriptId: id,
                    bytes: got.length, expiresAt: expiresAt || 0, at: Date.now()
                }));
                return new Response(got, { status: 200, headers: headers });
            }
        }

        // ---------- POST /threat : record a blocked bypass attempt ----------

        // ---------- POST /threat : record a blocked bypass attempt ----------
        if (url.pathname === '/threat' && request.method === 'POST') {
            S.threatsBlocked++;
            return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
        }

        // ---------- POST /visitor : reward page visitor ----------
        if (url.pathname === '/visitor' && request.method === 'POST') {
            S.totalVisitors++;
            return new Response(JSON.stringify({ ok: true, visitors: S.totalVisitors }), { headers: CORS_HEADERS });
        }

        // ---------- GET /v3/realtime_stats : live chart data ----------
        if (url.pathname === '/v3/realtime_stats') {
            const now = Date.now();
            prune(now);
            const perExecutor = {};   // last 60s counts
            const last5s = {};        // last 5s counts (for per-second rate)
            for (const e of S.events) {
                const age = now - e.t;
                if (age < 60000) perExecutor[e.executor] = (perExecutor[e.executor] || 0) + 1;
                if (age < 5000) last5s[e.executor] = (last5s[e.executor] || 0) + 1;
            }
            const executors = {};
            for (const name in perExecutor) {
                executors[name] = {
                    perSecond: Math.round(((last5s[name] || 0) / 5) * 100) / 100,
                    lastMinute: perExecutor[name]
                };
            }
            // uptime sanity: a lost isolate used to report epoch-based
            // uptime (56+ years) - clamp to "just started" instead
            const startedAt = (typeof S.startedAt === 'number' && S.startedAt > 0 && S.startedAt <= now) ? S.startedAt : now;
            const out = {
                ok: true,
                endpoint: 'v3/realtime_stats',
                totalExecutions: S.totalExecutions,
                threatsBlocked: S.threatsBlocked,
                totalVisitors: S.totalVisitors,
                executors: executors,
                topScripts: S.perScript,
                uptimeSeconds: Math.floor((now - startedAt) / 1000),
                updatedAt: now
            };
            return new Response(JSON.stringify(out), { headers: CORS_HEADERS });
        }

        // ---------- GET / : status page ----------
        if (url.pathname === '/' || url.pathname === '') {
            const html = '<!DOCTYPE html><html><head><title>ScripterHub Stats Worker</title><style>body{background:#0a0a0f;color:#66ff66;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-size:22px;font-weight:700}</style></head><body>✅ ScripterHub Stats Worker is LIVE!<div style="position:fixed;bottom:16px;font-size:12px;color:#555">endpoint: /v3/realtime_stats</div></body></html>';
            return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404, headers: CORS_HEADERS });
}

function prune(now) {
    while (S.events.length && S.events[0].t < now - WINDOW_MS) S.events.shift();
}

function sniffExecutor(ua) {
    const m = ua.match(/Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta|Solara|Hydrogen|Abracadabra|Roblox/i);
    return m ? m[0] : 'Unknown';
}

async function sha256Hex(str) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ SPECIAL KEY HELPERS ============
// constant-time-ish hex compare
function hashEqual(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length || a.length === 0) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// ---------- BROWSER METADATA PAGE ----------
// PHASE 3 REPLACEMENT for the old "key page".
//
// The old page embedded the CIPHERTEXT plus a working decryptor in JS, so a
// visitor could type the Special Key and read the script in their browser.
// That is gate G03: the artifact was on the wire, in the HTML, to anyone who
// loaded the page.
//
// This page has no cipher, no key hash, and no decrypt box. It reports what
// the script IS (name, id, whether it needs a license) and how to run it, and
// that is genuinely all a browser can learn from it.
//
// This is a real feature removal, not a hardening tweak: "view the source in
// my browser by typing the Special Key" no longer works, because there is no
// longer anything to view. The owner's copy of the source is the original file
// they uploaded, which was never on the server in the first place.
function scriptPageResponse(id, script, base) {
    const name = String(script.name || 'Protected script').replace(/[<>&"]/g, '');
    const kind = script.authRequired ? 'License required' : 'Free script (account required)';
    const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    // The real loader line, with the real URL. The old page printed the bare
    // id in a loadstring(), which was not a runnable line and taught the
    // reader a shape the platform does not use. The URL is public by design
    // (D6) - it carries no authorization value on its own - so showing it
    // costs nothing, and the id stays on the page as well.
    const loader = shLoader(base, id);
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        + '<meta name="robots" content="noindex,nofollow">'
        + '<title>' + esc(name) + '</title>'
        + '<style>*{box-sizing:border-box}body{background:#0a0a0f;color:#fff;font-family:Segoe UI,Tahoma,sans-serif;'
        + 'display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px}'
        + '.box{padding:36px;border:2px solid rgba(108,59,255,0.35);border-radius:16px;'
        + 'background:rgba(20,20,35,0.85);text-align:center;max-width:520px;width:100%}'
        + 'h1{font-size:20px;margin:0 0 6px}p{color:#8888aa;font-size:13px;margin:0 0 14px;line-height:1.6}'
        + '.tag{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;'
        + 'background:rgba(108,59,255,0.18);color:#b79cff;border:1px solid rgba(108,59,255,0.35);margin-bottom:16px}'
        + 'code{display:block;background:#0a0a15;border:1px solid rgba(255,255,255,0.1);border-radius:10px;'
        + 'padding:12px;font-size:11px;color:#66ff66;text-align:left;word-break:break-all;margin-top:8px}'
        + '.foot{color:#555577;font-size:11px;margin-top:18px}</style></head><body><div class="box">'
        + '<h1>' + esc(name) + '</h1>'
        + '<div class="tag">' + kind + '</div>'
        + '<p>This link is a loader. It contains no script &mdash; the program is '
        + 'fetched at run time, only after the server verifies your license, '
        + 'and only for a single short-lived session.</p>'
        + '<p>Nothing here can be scraped, and opening this page in a browser '
        + 'reveals nothing about the protected program.</p>'
        + '<code>' + esc(loader) + '</code>'
        + '<div class="foot">id: ' + esc(id) + '<br>Protected by ScripterHub</div>'
        + '</div></body></html>';
    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow'
        }
    });
}

// ---------- THE INIT LAYER (executors) ----------
// PHASE 3 REPLACEMENT for luaBootstrap() / luaPartsBootstrap().
//
// This is L2 of three. The owner pastes L1 (one line, see shLoader), the
// executor fetches it, and this file comes back. It is the layer a
// deobfuscator reaches if it follows the URL, so it is deliberately
// READABLE - the same property Luarmor's init file has. A reader learns the
// protocol, which is public by design, and learns nothing about any
// particular artifact.
//
// THE THREE LAYERS
//
//   L1  loadstring(game:HttpGet(".../sh/<id>"))()   the pasteable line
//   L2  THIS FILE: _bsdata0 + the cdn link + the licensed handshake
//   L3  the artifact behind that link: the obfuscated program itself
//
// WHAT IS NOT IN HERE, and that is the entire point:
//
//   * no ciphertext
//   * no Special Key
//   * no split key
//   * no t0, chk or padded key
//   * nothing derived from the artifact at all
//
// This text is IDENTICAL for every script on the platform except for two
// substitutions: the script id and the base URL. A scraper who downloads this
// learns the protocol, which is public by design, and learns nothing about any
// particular artifact. There is no per-script secret embedded in a file that
// a browser can simply open.
//
// WHAT _bsdata0 IS
//
// It is the layer's own configuration, and it is LOAD-BEARING: the id, the
// base URL and the cdn link are read out of it, so deleting the table breaks
// the layer. Luarmor uses the same name for the same purpose - a data table
// the init layer hands to the layer behind it.
//
// It is NOT a place to hide a key. Every value in it is public by the time
// the layer is fetched.
//
// THE FLOW IT DRIVES
//
//   1. read the license from getgenv().ScripterHubKey (unchanged UX: the
//      user still sets one global before executing the loadstring)
//   2. POST /sh/session  { id, k, h }        -> "SHS <sid> <nonce> <exp>"
//   3. GET  /sh/v4_init/<id>.lua?s&n         -> "SHK\n<keyline>\n<blob>"
//                                         or "SHG <n> <root> <grant> ..." + parts
//   4. decrypt locally with the Special Key, exactly as before
//   5. run it, handing it the id as an argument
//
// WHY THE ARTIFACT IS NOT CACHED TO DISK HERE
//
// Luarmor's init file caches what it downloaded (writefile/readfile) so a
// re-run costs no network round trip. Copying that here would put the
// artifact on the user's disk, and for a free script that is the whole
// server-only layer: the split key is what keeps the artifact's last layer
// shut, and a cached envelope carries the key line with it. The re-run
// therefore costs one fetch, and the license is still checked on every single
// run - which is the property worth keeping.
//
// request() is preferred over game:HttpGet because it can set headers, and the
// header transport is the strong one: a 45s session and a credential that
// never appears in a URL. The HttpGet path is kept as a fallback and is
// deliberately the weaker of the two (15s, URL-borne), matching D5. Both are
// recorded server-side, so the share of traffic on the weak path stays visible
// instead of being silently averaged in.
function luaSessionBootstrap(id, base, keyless) {
    const KEYED = keyless ? 'false' : 'true';
    // The cdn link. It is a route on THIS worker, not on a third-party CDN:
    // the artifact must stay behind the same atomic gate (D12), so "cdn" here
    // means "the file-shaped address of the delivery route", not "a public
    // bucket anybody can fetch".
    const cdn = base + '/sh/v4_init_' + id + '.lua';
    // _bsdata0: the layer's configuration. Read, not decorative.
    const bsdata = '{["v"]=1'
        + ',["id"]=' + JSON.stringify(id)
        + ',["base"]=' + JSON.stringify(base)
        + ',["cdn"]=' + JSON.stringify(cdn)
        + ',["slot"]=' + JSON.stringify(id + '-ocmid')
        + '}';
    return '-- Do not save this file\n'
        + '-- Always use the loadstring\n'
        + '-- ScripterHub session loader (init layer) | ' + id + ' | no script material in this file\n'
        // Nothing above the code tells a FREE user to set anything. D1 required
        // an account for the keyless tier; making users paste their email into an
        // executor costs privacy and friction, and the gate ALSO demanded a signed
        // user token the loader had no way to carry - so it was not merely annoying,
        // a keyless script was undeliverable. The license line stays because a paid
        // script genuinely needs a key, and this whole header is a comment, so it
        // costs a keyless user nothing.
        + '-- 1. paid scripts only: set your license ONCE before running this:\n'
        + '--      getgenv().ScripterHubKey = "YOUR_LICENSE_KEY"\n'
        + '-- 2. run the loadstring. Free scripts need no key, no account, no email.\n'
        // _bsdata0: the layer's configuration, and the first thing a reader
        // sees. The id, the base URL and the cdn link are READ OUT of it, so it
        // is load-bearing rather than decorative - delete the table and the
        // layer stops working.
        + '_bsdata0=' + bsdata + ';\n'
        + 'local D=_bsdata0\n'
        + 'local ID=D["id"]\n'
        // The stub now calls loadstring(response)(ID), so `...` carries the id in.
        // The baked ID stays as the fallback: a user whose executor cached an OLDER
        // copy of the loader still works, because that copy passed no argument.
        // An attacker cannot use this to redirect the fetch - ID only ever names the
        // script to authenticate against, and a wrong id simply fails to authorize.
        + 'do local a=... if type(a)=="string" and a:match("^ScripterHub%d+$") then ID=a end end\n'
        + 'local BASE=D["base"]\n'
        // The cdn link. L3 lives behind it.
        + 'local CDN=D["cdn"]\n'
        + 'local KEYED=' + KEYED + '\n'
        + 'local G=(getgenv and getgenv()) or _G\n'
        + 'local function NT(t,d) pcall(function() game:GetService("StarterGui"):SetCore("SendNotification",'
        + '{Title="ScripterHub",Text=t,Duration=d or 5}) end) end\n'
        + 'local function DIE(t) NT(t,7) print("[ScripterHub] "..t) end\n'
        // A refusal the user can act on.
        //
        // "SHERR hidden" is a script the owner marked private, or a killswitch.
        // It used to also mean "a keyless script needs an account" - that reading
        // is gone with D1, and leaving it would have pointed users at an email that
        // now does nothing. Printing the raw code also tells the user nothing, and
        // the bug below made it worse: the check never fired, so refusals were
        // reported as "Bad response from the license server", which blames the
        // network for what is usually a refusal.
        + 'local function DENYMSG(r)\n'
        // Single quotes inside the Lua double-quoted string, deliberately: this
        // fragment lives inside a JS single-quoted string, where a backslash-
        // quote collapses to a bare quote and closes the Lua string early. The
        // first version shipped exactly that and every case failed to compile.
        + ' if r=="hidden" then return "This script is private. Only the author can run it." end\n'
        + ' if r=="gone" then return "Script cannot be loaded, doesnt exist or expired." end\n'
        // NOT a missing script. Saying so here cost real time: the script was on
        // the operator's PC the whole time, and the fault was one mismatched
        // secret. The user cannot fix it, but the operator reading the log or
        // asking the operator can.
        + ' if r=="storageauth" then return "The script is still stored, but the site cannot reach its storage. The owner needs to check the Storage Keeper is running and that SH_STORE_TOKEN matches it." end\n'
        // NOT a missing script. It was found and downloaded; it is simply too
        // large to send in one piece, and it was published whole so it cannot
        // be sent in pieces either. Saying "gone" here sends the user looking
        // for a deleted script instead of at the re-upload that fixes it.
        + ' if r=="toobig" then return "This script is too large to load in one piece and was stored whole. The owner needs to re-upload it so it is split into parts." end\n'
        + ' if r=="invalid" then return "That license key is not valid." end\n'
        + ' if r=="expired" then return "That license has expired." end\n'
        + ' if r=="banned" then return "That license has been banned." end\n'
        + ' if r=="hwid" then return "That license is locked to different hardware." end\n'
        // A project mismatch is a real, common, FIXABLE configuration state: the
        // key is valid, the script exists, and the owner simply bound them to
        // different projects. It used to fall through to the generic line below
        // and show the literal words
        //
        //     Denied: project
        //
        // which names an internal code instead of the problem, so the owner
        // could not tell a mis-bound key from a broken one. This is the message
        // the owner saw for "the script doesnt accept my key".
        + ' if r=="project" then return "This license is for a different project than this script. Make a key for this project, or bind the key to All projects." end\n'
        + ' if r=="killswitch" then return "The owner has disabled this script." end\n'
        + ' return "Denied: "..r\n'
        + 'end\n'
        // ---- transport
        //
        // request() is preferred: it can set headers, and the header transport
        // is the strong one (45s session, a credential that never reaches an
        // access log). game:HttpGet is the fallback and is deliberately the
        // weaker path, matching D5.
        //
        // The query is built ONCE and used by both, because /sh/session accepts
        // GET as well as POST. That matters: the HttpGet fallback cannot POST,
        // so a bootstrap that only ever spoke POST would silently fail on every
        // executor without `request`. The server records which transport was
        // used, so the weak path stays visible instead of being averaged in.
        + 'local function E(s) s=tostring(s or "") return (s:gsub("[^%w%-._~]",function(c) return string.format("%%%02X",string.byte(c)) end)) end\n'
        + 'local function QS(t) local o={} for k,v in pairs(t) do o[#o+1]=E(k).."="..E(v) end return table.concat(o,"&") end\n'
        + 'local function GET(url)\n'
        + ' if request then\n'
        + '  local ok,r=pcall(function() return request({Url=url,Method="GET",'
        // The executor User-Agent. A bare request() call sends none, and the
        // worker answers a request with no UA like a BROWSER - which means the
        // metadata page instead of the bytes, and loadstring() then fails on
        // perfectly good input. game:HttpGet stamps a genuine Roblox UA, but a
        // request() call does not, so the header is set here too. It is one
        // header and it is the difference between working and not.
        + 'Headers={["User-Agent"]="Roblox/570 Delta Executor",["X-SH-Transport"]="header"}}) end)\n'
        + '  if ok and type(r)=="table" and type(r.Body)=="string" and r.Body~="" then return r.Body end\n'
        + ' end\n'
        + ' if game and game.HttpGet then\n'
        + '  local ok,r=pcall(function() return game:HttpGet(url,true) end)\n'
        + '  if ok and type(r)=="string" and r~="" then return r end\n'
        + ' end\n'
        + ' return nil\n'
        + 'end\n'
        + 'local function CALL(path,q)\n'
        + ' local u=BASE..path..(q and ("?"..q) or "")\n'
        + ' if request then\n'
        + '  local ok,r=pcall(function() return request({Url=u,Method="POST",'
        + 'Headers={["Content-Type"]="application/json",["User-Agent"]="Roblox/570 Delta Executor",["X-SH-Transport"]="header"}}) end)\n'
        + '  if ok and type(r)=="table" and type(r.Body)=="string" and r.Body~="" then return r.Body end\n'
        + ' end\n'
        + ' return GET(u)\n'
        + 'end\n'
        // ---- 1. license + hardware fingerprint
        + 'local K=G and G.ScripterHubKey\n'
        + 'local HW=(G and G.ScripterHubHwid) or (identifyexecutor and (pcall(identifyexecutor) and identifyexecutor())) or "?"\n'
        + 'if KEYED and (type(K)~="string" or K=="") then\n'
        + ' DIE("License required: run getgenv().ScripterHubKey = \\"YOUR_KEY\\" then re-execute.")\n'
        + ' return\n'
        + 'end\n'
        // ---- 2. mint a session. proof, not payload.
        + 'local resp=CALL("/sh/session",QS({id=ID,k=K or "",h=tostring(HW),u=tostring(G.ScripterHubUser or "")}))\n'
        + 'if type(resp)~="string" then DIE("Could not reach the license server.") return end\n'
        + 'if resp:sub(1,6)=="SHERR " then DIE(DENYMSG(resp:sub(7):gsub("%s+$",""))) return end\n'
        + 'local S,N=resp:match("^SHS (%S+) (%S+) %S+")\n'
        + 'if not S or not N then DIE("Bad response from the license server.") return end\n'
        // ---- 3. spend it. one shot, this is where the bytes come from.
        //
        // A SPENT NONCE IS RECOVERED, NOT REPORTED.
        //
        // The nonce is single-use by design: presenting it twice is refused
        // with SHERR nonce. But the bootstrap's own GET helper tries request()
        // first and falls back to game:HttpGet, and a large script's first
        // request can be slow enough over a tunnel that request() comes back
        // empty - at which point the fallback fires a SECOND request carrying
        // the SAME nonce. The first one spent it, so the second is refused, and
        // the user saw:
        //
        //     [ScripterHub] Denied: nonce
        //
        // which names a security control rather than the timeout that caused
        // it. Reporting it is worse than useless: the script exists, the key is
        // valid, and retrying the loadstring is the correct user action, but
        // nothing in that message says so.
        //
        // So a spent nonce mints a FRESH session and spends that instead, once.
        // This cannot be abused: the caller already proved it may have a
        // session, and the retry is bounded at one extra session.
        + 'local body=GET(CDN.."?s="..S.."&n="..N)\n'
        // Matched, not sliced. The first draft used body:sub(1,10)=="SHERR
        // nonce", and "SHERR nonce" is ELEVEN characters - so the recovery
        // never fired and the test caught it. An off-by-one in a security
        // recovery path is exactly the kind of thing a substring check hides.
        + 'local rsn=(type(body)=="string") and body:match("^SHERR (%S+)") or nil\n'
        + 'if rsn=="nonce" then\n'
        + '  local r2=CALL("/sh/session",QS({id=ID,k=K or "",h=tostring(HW),u=tostring(G.ScripterHubUser or "")}))\n'
        // NOT `local S2,N2 = (cond) and r2:match(...) or nil`.
        //
        // Lua's `and` truncates a multiple-value expression to ONE value, so
        // that form assigned the first capture to S2 and left N2 nil forever -
        // the retry never fired and the guard was dead code. A direct
        // `local a,b = s:match(...)` does propagate both. The first mint a few
        // lines up is written that way for exactly this reason.
        + '  local S2,N2=nil,nil\n'
        + '  if type(r2)=="string" then S2,N2=r2:match("^SHS (%S+) (%S+) %S+") end\n'
        + '  if S2 and N2 then S,N=S2,N2; body=GET(CDN.."?s="..S.."&n="..N) end\n'
        + 'end\n'
        + 'if type(body)~="string" then DIE("Delivery failed.") return end\n'
        + 'if body:sub(1,6)=="SHERR " then DIE(DENYMSG(body:sub(7):gsub("%s+$",""))) return end\n'
        // ---- 4. assemble the payload
        + 'local SK, B\n'
        // CH marks a chained delivery. Its parts are stored as plain obfuscated
        // code and cannot be licence-encrypted per visitor at this size, so the
        // session grant on each part is the gate there - the same gate a keyless
        // script has. The inline path stays licence-encrypted.
        + 'local CH=false\n'
        + 'if body:sub(1,4)=="SHL\\n" then\n'
        + '  B=body:sub(5)                      -- keyless, no server-only layer\n'
        // SHX: keyless, WITH a server-only layer.
        //
        // Same shape as SHK - a key line, then a body - but the body is plain
        // Lua, not ciphertext, because there is no Special Key to decrypt it
        // with on a free script. So SK is captured and B is taken verbatim, and
        // the KEYED branch below stays out of it.
        //
        // This is what makes a free script require the server. The artifact's
        // last layer is encrypted with the padded key, those bytes are not in
        // the file, and the only copy is behind a single-use session grant. An
        // injected or guessed global fails the t0/chk comparison the file bakes
        // in, so this cannot be forged from the client side.
        + 'elseif body:sub(1,4)=="SHX\\n" then\n'
        + '  local nl=body:find("\\n",5)\n'
        + '  if not nl then DIE("Malformed delivery - no key line.") return end\n'
        + '  SK=body:sub(5,nl-1)                -- "t0 chk k1 k2 k3..."\n'
        + '  B=body:sub(nl+1)                   -- plain Lua, NOT ciphertext\n'
        + 'elseif body:sub(1,4)=="SHK\\n" then\n'
        + '  local nl=body:find("\\n",5)\n'
        + '  if not nl then DIE("Malformed delivery - no key line.") return end\n'
        + '  SK=body:sub(5,nl-1)                -- "t0 chk k1 k2 k3..."\n'
        + '  B=body:sub(nl+1)                   -- the ciphertext\n'
        + 'elseif body:sub(1,4)=="SHG " then\n'
        + '  CH=true local n,root,g=body:match("^SHG (%d+) (%S+) (%S+)")\n'
        + '  local nl=body:find("\\n")\n'
        // Same class of fault as the SHK branch: an unterminated header made
        // body:sub(nl+1) do arithmetic on nil, which kills the chunk with a
        // bare Lua error instead of a message the user can act on.
        + '  if not nl then DIE("Malformed chain header.") return end\n'
        + '  local rel=body:sub(nl+1)\n'
        + '  local s2=rel:find("\\n")\n'
        + '  if s2 then SK=rel:sub(1,s2-1) end\n'
        + '  if not n or not g then DIE("Bad chain header.") return end\n'
        + '  local P={}\n'
        + '  for i=0,tonumber(n)-1 do\n'
        + '   local u=root.."/"..i.."?g="..g.."&s="..S\n'
        + '   local ok,part=pcall(function() return game:HttpGet(u,true) end)\n'
        + '   if not ok or type(part)~="string" or #part==0 then DIE("Part "..i.." failed.") return end\n'
        + '   P[#P+1]=part\n'
        + '  end\n'
        + '  B=table.concat(P)\n'
        + 'else\n'
        + '  DIE("Unrecognised delivery format.") return\n'
        + 'end\n'
                // ===========================================================================
        // 5. DECRYPT LOCALLY WITH THE LICENCE KEY
        //
        // The body arrives base64-ENCODED (shEncryptForLoader returns btoa), so
        // the bytes on the wire are base64 CHARACTERS. Decoding has to come
        // first: string.byte on the raw body yields the ASCII of A, B, C...
        //
        // THE THREE SETS OF SHIFTS. Every one of these was wrong at some point,
        // and the wrong ones did not raise - they returned the wrong bytes,
        // which is worse than refusing:
        //
        //   4 chars = 24 bits = 3 bytes : c>>16, (c>>8)&0xFF, c&0xFF  -> /65536 /256
        //   3 chars = 18 bits = 2 bytes : c>>10, (c>>2)&0xFF           -> /1024  /4
        //   2 chars = 12 bits = 1 byte  : c>>4                         -> /16
        //
        // 4096 and 16 for the 18-bit case are the 24-bit shifts, so they read the
        // wrong bits silently. 262144, 4096 and 64 are the base64 SHIFT constants
        // 64^3, 64^2, 64^1 used as if they were byte divisors. And the group
        // offset was s:sub(1+j,1+j), reading from position 1 of the whole string
        // - correct for the first group, garbage after it.
        //
        // A one-character remainder is not valid base64; it cannot occur for this
        // worker's own output, and ignoring it truncated the artifact by a byte
        // while the SHOK magic still matched at the front.
        //
        // tools/keyed_lua_roundtrip_test.mjs runs this Lua against the shipped
        // encryptor at eight plaintext lengths, which is the only kind of test
        // that could have found any of it: the seed function always matched, so
        // every test that compared the two implementations in isolation stayed
        // green while no keyed script could run.
        // ===========================================================================


        + 'local function BX(a,b) a=a%4294967296 b=b%4294967296 local r,p=0.0,1.0 for _=1,32 do '
        + 'local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end\n'
        + 'local function SD(k,i) local h=5381.0+i*7 for j=1,#k do local c=string.byte(k,j) '
        + 'h=(h*33+c)%4294967296 end return h end\n'
        + 'local function NX(s) local x=s[1] x=BX(x,(x*8192)%4294967296) x=BX(x,math.floor(x/131072)) '
        + 'x=BX(x,(x*32)%4294967296) s[1]=s[2] s[2]=s[3] s[3]=s[4] s[4]=x return x end\n'
+ 'local function DEC(k) local a,b,c,d=SD(k,0),SD(k,1),SD(k,2),SD(k,3)\n'
+ ' if a==0 then a=1 end if b==0 then b=2 end if c==0 then c=3 end if d==0 then d=4 end\n'
+ ' local function _b64dec(s)\n'
+ '  local T="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"\n'
+ '  local M={} for i=1,64 do M[T:sub(i,i)]=i-1 end\n'
+ '  s=tostring(s or ""):gsub("[^A-Za-z0-9+/]","")\n'
+ '  local n=#s local o={} local i=1\n'
+ '  while i+3<=n do\n'
+ '   local c=0\n'
+ '   for j=0,3 do local v=M[s:sub(i+j,i+j)] if v then c=c*64+v end end\n'
+ '   o[#o+1]=string.char(math.floor(c/65536),math.floor(c/256)%256,c%256)\n'
+ '   i=i+4\n'
+ '  end\n'
+ '  local rem=n-i+1\n'
+ '  if rem==1 then return nil end\n'
+ '  if rem==2 then\n'
+ '   local c=0\n'
+ '   for j=0,1 do local v=M[s:sub(i+j,i+j)] if v then c=c*64+v end end\n'
+ '   o[#o+1]=string.char(math.floor(c/16)%256)\n'
+ '  elseif rem==3 then\n'
+ '   local c=0\n'
+ '   for j=0,2 do local v=M[s:sub(i+j,i+j)] if v then c=c*64+v end end\n'
+ '   o[#o+1]=string.char(math.floor(c/1024)%256,math.floor(c/4)%256)\n'
+ '  end\n'
+ '  return table.concat(o)\n'
+ ' end\n'
+ ' if type(B)~="string" then return nil end\n'
+ ' local BD=(B:match("^[A-Za-z0-9+/=]+$")) and _b64dec(B) or B\n'
+ ' if #BD==0 then return nil end\n'
+ ' local s={a,b,c,d} local o={} for i=1,#BD do local x=NX(s) o[i]=string.char(BX(string.byte(BD,i),x%256)) end\n'
+ ' local t=table.concat(o) if t:sub(1,4)~="SHOK" then return nil end return t:sub(5) end\n'
        + 'local src=B\n'
        + 'if KEYED and not CH then\n'
        + ' if type(SK)~="string" or SK=="" then DIE("Missing key material.") return end\n'
        + ' src=DEC(K)\n'
        + ' if not src then DIE("Wrong Special Key, or the delivery was tampered with.") return end\n'
        + 'end\n'
        + 'local LS=loadstring or load\n'
        // ---- HAND THE SPLIT KEY TO THE ARTIFACT ----
        // The gate already returned this build's key line and charged the
        // session for it. Handing it over here means the obfuscated file's
        // baked chunk does NOT need a second, weaker HTTP round trip to
        // /sh/k, which is what forced the compatibility window open.
        //
        // This is not a way to forge a key. The chunk still verifies t0 and
        // chk against values baked into the file itself, and the padded key
        // bytes are not in the file — so an injected value that is wrong
        // fails the comparison and the payload never unlocks. The global
        // changes where the bytes come from, not whether they are correct.
        + 'if type(SK)=="string" and SK~="" then G[' + JSON.stringify(SPLITKEY_GENV) + ']=SK end\n'
        // Surface WHY the compile failed, not just that it did.
        //
        // `loadstring` returns (function, error). The error was discarded, so
        // every cause below reported the same useless line:
        //
        //   - the artifact was truncated in transit (src short or empty)
        //   - the executor hit a parser limit on a large payload - the bytes
        //     are VALID and the executor simply gave up, which looks exactly
        //     like a syntax error unless the error text is shown
        //   - the artifact is genuinely not Lua
        //   - the executor has neither loadstring nor load
        //
        // Those need four different fixes and the old message separated none
        // of them. Byte count and emptiness come first because they split the
        // space in half before anyone reads the error.
        //
        // NO BACKTICKS in this comment. The test harness brace-matches
        // luaSessionBootstrap out of this file and treats a backtick as a string
        // delimiter, so one here would put the matcher into string mode
        // permanently. A comment is not a safe place to be clever.
        // Two statements, not one. `(LS and LS(src)) or nil` looks equivalent
        // and is not: `or` truncates to a single value, so the compile error
        // is discarded and the trailing `,nil` hard-assigns it away. That is
        // the original bug re-introduced while fixing the original bug.
        // `LS(src)` in tail position yields both returns on its own.
        + 'local fn,ferr=nil,nil\n'
        + 'if LS then fn,ferr=LS(src) end\n'
        + 'if not fn then\n'
        + ' local why=tostring(ferr or "loadstring returned no function and no error")\n'
        + ' local size=(type(src)=="string") and #src or -1\n'
        + ' DIE("Load failed: the delivered source is "..size.." bytes and did not compile. "..why)\n'
        + ' return\n'
        + 'end\n'
        // Surface payload errors instead of swallowing them.
        //
        // This used to be pcall(function() fn() end) with the result thrown
        // away, so a script that failed anywhere in its own body produced NO
        // output at all - no print, no error, nothing. That is the worst
        // possible failure mode: a user cannot tell a broken script from a
        // broken platform, and the owner has nothing to go on.
        //
        // NOTE: no backticks in this comment. tools/bootstrap_exec_test.mjs
        // brace-matches luaSessionBootstrap out of this file, and it treats a
        // backtick as a string delimiter - so a comment containing one puts the
        // matcher into string mode and it never comes back out. A comment is not
        // a safe place to be clever.
        //
        // The delivery is already fully validated by this point (session spent,
        // envelope parsed, payload decrypted), so an error here is the SCRIPT's
        // error and the user needs to see it verbatim.
        //
        // The id is handed to the payload as an ARGUMENT, which is the Luarmor
        // shape: loadstring(response)(id). The artifact ignores it - it is
        // self-contained - but the shape is what makes the layer identical for
        // every script except the id, and it is the same exposure Luarmor has
        // and accepts.
        + 'local ran,perr=pcall(fn,ID)\n'
        + 'if not ran then DIE("The script itself failed: "..tostring(perr)) end\n'
        + 'return true\n';
}

// ===========================================================================
// NAMED EXPORTS - FOR THE TEST SUITE ONLY
//
// Cloudflare Workers use the default export above and ignore these entirely.
// They exist because tools/atomic_state_test.mjs and
// tools/artifact_crypto_test.mjs test the state layer and the at-rest crypto
// directly. Reaching them through HTTP would assert on the routing rather
// than on the SQL, and 35 atomicity checks are worth more than one round
// trip each.
//
// They were imported from server/*.js before those files were inlined back
// into this one, which is why they are re-exported rather than deleted.
// ===========================================================================
export {
    createState, changesOf, SESSION_TTL_CEILING_MS, DEFAULT_SESSION_TTL_MS, windowStart,
    encryptAtRest, decryptAtRest, tryDecryptAtRest, isEncrypted, kekConfigured, _resetKekCache
};
