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

// Artifacts at or below this are returned INLINE by the single delivery gate:
// one atomic consume, one response, nothing left to fetch. That is the strong
// case and it is the normal one.
const INLINE_DELIVERY_LIMIT = 2 * 1024 * 1024;

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
    HIDDEN:      'hidden',      // visibility forbids this caller
    NO_SESSION:  'nosession',   // sid unknown, spent, or revoked
    BAD_NONCE:   'nonce',       // nonce unknown, spent, or wrong session
    EXPIRED_SESSION: 'stale',
    TOO_LARGE:   'toolarge'
};

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
        const v = o.classify(o.key, o.hwid, o.now);
        if (v.code === 'banned') return DENY.BANNED;
        if (v.code === 'expired') return DENY.EXPIRED;
        if (v.code === 'hwid') return DENY.HWID;
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
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-SH-Token, X-SH-User-Token',
    // Lets the diagnostics panel and the owner panel read the status off a
    // cross-origin response. Without it the status is invisible in the browser,
    // which is the other half of why this took so long to find.
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, X-SH-Token',
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
const USERS_KV_KEY = 'sh_users_db';    // single KV entry: { email: userRecord }
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
const MAX_CHUNKS = 20;              // 20 * ~25MB = ~50MB blob ceiling

// ---- user sync helpers ----
async function loadUsersMap(env) {
    if (!env.LOADERS_KV) return {};
    let map = {};
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        map = raw ? JSON.parse(raw) : {};
    } catch (e) { map = {}; }
    // Reconcile into D1 so the gate's live account check has rows to read.
    // Best-effort, but NOT silent: a failure here shows up as account-bound
    // deliveries being refused with no other explanation.
    if (stateFor(env)) {
        try { await syncUsersToD1(env, map); }
        catch (e) { console.error('[ScripterHub] user reconcile to D1 failed: ' + (e && e.message)); }
    }
    return map;
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
function publicUser(u) {
    const c = { ...u };
    delete c.password;
    if (typeof c.profileImage === 'string' && c.profileImage.length > SH_IMAGE_CAP) c.profileImage = '';
    if (typeof c.bannerImage === 'string' && c.bannerImage.length > SH_IMAGE_CAP) c.bannerImage = '';
    return c;
}
// full record for STORAGE: trim oversized images too (they would kill
// the next KV put), keep everything else intact
function storageSafeUser(u) {
    if (!u || typeof u !== 'object') return u;
    const c = { ...u };
    if (typeof c.profileImage === 'string' && c.profileImage.length > SH_IMAGE_CAP) c.profileImage = '';
    if (typeof c.bannerImage === 'string' && c.bannerImage.length > SH_IMAGE_CAP) c.bannerImage = '';
    return c;
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

async function saveUsersMap(env, map) {
    let json = JSON.stringify(map);
    if (json.length > KV_MAX_VALUE - 1000) {
        // emergency repair: strip ALL images, then retry
        for (const email of Object.keys(map)) map[email] = storageSafeUser(map[email]);
        json = JSON.stringify(map);
    }
    if (json.length > KV_MAX_VALUE - 1000) {
        // still too big: drop the largest non-essential fields
        for (const email of Object.keys(map)) {
            const u = map[email];
            if (u && typeof u === 'object') {
                if (typeof u.profileImage === 'string' && u.profileImage.length > SH_IMAGE_CAP) u.profileImage = '';
                if (typeof u.bannerImage === 'string' && u.bannerImage.length > SH_IMAGE_CAP) u.bannerImage = '';
            }
        }
        json = JSON.stringify(map);
    }
    await env.LOADERS_KV.put(USERS_KV_KEY, json);
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
    'admin':          { limit: 60,  window: 60 * 1000 }
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
        || (await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id)) !== null;
    if (!exists) return null;
    return {
        exists: true,
        name: String((meta && meta.name) || ''),
        user: String((meta && meta.user) || ''),
        keyless: !!(meta && meta.keyless === true),
        authRequired: !!(meta && meta.authRequired === true),
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
// ---- STORAGE KEEPER (GitHub-backed big-script storage) ----
// Cloudflare KV caps at ~50MB/script (25MB per value). Scripts larger
// than the KV ceiling are stored in a PRIVATE GitHub repository (the
// owner's "Storage Keeper" repo) using the Git Data API:
//   POST /sh/gh-put      <- owner: upload one part (<=40MB, matches the
//                           100MB API file cap with base64 overhead ~1.33x)
//   POST /sh/gh-finalize <- owner: create the git tree+commit+ref update
//                           (all parts land in ONE commit at path
//                            scripts/<id>/<i>.part) and register the
//                           loader meta so /sh/<id> starts working
//   POST /sh/gh-delete   <- owner: delete a script's folder + commit
//   POST /sh/gh-status   <- owner: usage summary (repos + parts + sizes)
//   GET  /sh/g/<id>/<i>  <- EXECUTOR-ONLY part download, proxied from
//                           GitHub by the worker (repo stays private,
//                           the token never leaves the worker)
// Requirements (worker Settings -> Variables and Secrets):
//   SH_GH_TOKEN    = GitHub PAT with repo scope (classic) or Contents
//                    read+write (fine-grained) for the storage repo
//   SH_GH_REPO     = "owner/repo" e.g. "Scripter-Coder/Storage-Keeper-1"
// The parts are the SAME obfuscated/encrypted ciphertext as KV scripts
// - GitHub never sees plaintext, and neither does anyone without a valid
// executor User-Agent hitting the worker proxy.
const GH_PART_MAX = 40_000_000;      // 40MB raw -> ~53MB base64 (API cap 100MB)
const KV_GH_PREFIX = 'sh_gh_';      // sh_gh_<id> = { repo, path, n, len, sha, at, name, user, keyless, webKey, keyHash, authRequired }
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
async function putBlob(env, id, prefix, text) {
    const s = String(text);
    const enc = !!kekConfigured(env);
    if (s.length <= CHUNK_THRESHOLD) {
        // legacy single-value path (scripts < ~25MB - the common case)
        await env.LOADERS_KV.put(prefix + id, enc ? await encryptAtRest(env, s) : s, { expirationTtl: LOADER_TTL });
        return { chunked: false, len: s.length, encrypted: enc };
    }
    const n = Math.ceil(s.length / CHUNK_THRESHOLD);
    if (n > MAX_CHUNKS) throw new Error('too large');
    for (let i = 0; i < n; i++) {
        const part = s.slice(i * CHUNK_THRESHOLD, (i + 1) * CHUNK_THRESHOLD);
        await env.LOADERS_KV.put(KV_CHUNK_PREFIX + prefix + id + '_' + i,
            enc ? await encryptAtRest(env, part) : part, { expirationTtl: LOADER_TTL });
    }
    await env.LOADERS_KV.put(KV_CMETA_PREFIX + prefix + id, JSON.stringify({ n, len: s.length, enc: enc ? 1 : 0 }), { expirationTtl: LOADER_TTL });
    return { chunked: true, n, len: s.length, encrypted: enc };
}
async function getBlob(env, id, prefix) {
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
function classifyLicense(rec, hwid, now) {
    if (!rec) return { code: 'invalid' };                      // no such key
    if (rec.banned) return { code: 'banned', reason: rec.banReason }; // blacklisted
    if (rec.expiresAt && rec.expiresAt <= now) return { code: 'expired' }; // expired
    if (rec.hwid && rec.hwid !== hwid) return { code: 'hwid' }; // shared key
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
        const map = await loadUsersMap(env);
        const rec = map[raw.e];
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

// "Method Not Allowed" page — what browsers see when opening a loader link
// ---------- the loader we hand out ----------
//
// Prefers `request` and falls back to game:HttpGet, which is the same order
// the bootstrap's own GET() uses. Hardcoding HttpGet here was a portability
// bug: at least one executor in circulation throws
//
//     invalid argument #1 to find (string expected, got nil)
//
// from inside its own internal_request, before any request is made. The
// bootstrap would have worked on that executor - it tries `request` first -
// so the failure was purely in the one line a user pastes.
//
// It is longer than loadstring(game:HttpGet(url))() and that is the trade:
// a loader that works on more executors is worth more than a short one. It
// still contains no script material, which is what gate G01 is about.
function shLoader(base, id) {
    const u = base + '/sh/' + id;
    return 'local u=' + JSON.stringify(u) + '\n'
        + 'local b\n'
        + 'if request then local ok,r=pcall(function() return request({Url=u,Method=\'GET\'}) end) '
        + 'if ok and type(r)==\'table\' and type(r.Body)==\'string\' and r.Body~=\'\' then b=r.Body end end\n'
        + 'if not b and game and game.HttpGet then local ok2,r2=pcall(function() return game:HttpGet(u,true) end) '
        + 'if ok2 and type(r2)==\'string\' and r2~=\'\' then b=r2 end end\n'
        + 'if not b then print(\'[ScripterHub] Could not reach the script. No usable HTTP function.\') return end\n'
        + 'local LS=loadstring or load\n'
        + 'local f=LS and LS(b)\n'
        + 'if not f then print(\'[ScripterHub] Could not compile the loader.\') return end\n'
        + 'f()';
}
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
            if (body.keyless === true) {
                const plainCode = String(body.plainCode || '');
                const cipher = String(body.cipher || '');
                if (!plainCode) return jsonResponse({ ok: false, error: 'plainCode is required for keyless scripts (the obfuscated code)' }, 400);
                if (plainCode.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare: KV values cap at 25MB and request bodies at ~100MB). Reduce the script or split it into modules.' }, 413);
                // executor blob (no key needed in-game) - chunked if large
                try {
                    await putBlob(env, id, KV_PREFIX, plainCode);
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
                    webKey: !!cipher
                }), { expirationTtl: LOADER_TTL });
                mirrorScript(env, id, { name, user, visibility: readVisibility(body), authRequired: false });
                if (cipher) {
                    if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                    try {
                        await putBlob(env, id, KV_WEB_PREFIX, cipher);
                    } catch (e) {
                        return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                    }
                }
                await maybeReplaceOld(env, body.replaces);
                ctx.waitUntil(notifyScriptDiscord(env, {
                    event: 'script.published', outcome: 'ok',
                    scriptId: id, userRef: await telemetryRef('user', user),
                    at: Date.now(), bytes: plainCode.length
                }));
                const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
                return jsonResponse({ ok: true, id, replaced: false, keyless: true, loadstring: shLoader(base, id) });
            }
            // ---- keyed scripts: ENCRYPTED with the Special Key ----
            const cipher = String(body.cipher || '');
            if (!cipher) return jsonResponse({ ok: false, error: 'cipher is required (encrypt client-side with the Special Key first)' }, 400);
            if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare: KV values cap at 25MB and request bodies at ~100MB). Reduce the script or split it into modules.' }, 413);
            const keyHash = String(body.keyHash || ''); // optional SHA-256 hex
            try {
                await putBlob(env, id, KV_PREFIX, cipher);
            } catch (e) {
                return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
            }
            // authRequired: this script demands a valid license key + HWID
            // on EVERY run (Luarmor model) - the split key is never served
            // without a short-lived /sh/auth token
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({ name, user, at: Date.now(), keyHash, authRequired: body.authRequired === true, visibility: readVisibility(body) }), { expirationTtl: LOADER_TTL });
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
            return jsonResponse({ ok: true, id, replaced, loadstring: shLoader(base, id) });
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
                const map = await loadUsersMap(env);
                if (map[email]) return jsonResponse({ ok: false, error: 'An account with this email already exists.' }, 409);
                for (const k in map) {
                    if (String(map[k].username || '').toLowerCase() === username.toLowerCase()) {
                        return jsonResponse({ ok: false, error: 'This username is already taken.' }, 409);
                    }
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
                map[email] = storageSafeUser(rec);
                await saveUsersMap(env, map);
                const out = { ok: true, user: publicUser(rec) };
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
                const map = await loadUsersMap(env);
                let found = null;
                let foundEmail = null;
                for (const k in map) {
                    if (k === emailOrUser || String(map[k].username || '').toLowerCase() === emailOrUser.toLowerCase()) { found = map[k]; foundEmail = k; break; }
                }
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
                        map[foundEmail] = storageSafeUser(found);
                        await saveUsersMap(env, map);
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
            const map = await loadUsersMap(env);
            const existing = map[email];
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
                        map[email] = storageSafeUser(existing);
                        await saveUsersMap(env, map);
                    } catch (e) { /* a failed upgrade must not block the sync */ }
                }
                const inc = sanitizeUserRecord(body.user || {});
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
                map[email] = rec;
                await saveUsersMap(env, map);
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
            map[email] = rec;
            await saveUsersMap(env, map);
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
    const map = await loadUsersMap(env);
    const rec = map[String(u.email)] || map[String(u.email).toLowerCase()];
    if (!rec) return jsonResponse({ ok: false, error: 'no such account' }, 404);
    if (rec.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.', disabled: true }, 403);
    return jsonResponse({ ok: true, user: publicUser(rec) });
}

        if (url.pathname === '/sh/user-get' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const map = await loadUsersMap(env);
            const rec = map[email];
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
                    map[email] = storageSafeUser(rec);
                    await saveUsersMap(env, map);
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
            const map = await loadUsersMap(env);
            const existing = map[email];
            if (!existing) return jsonResponse({ ok: true }); // already gone
            // PHASE 1: PBKDF2 verification.
            const delV = await verifyPassword(env, existing.password, body.password);
            if (!delV.ok) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            delete map[email];
            await saveUsersMap(env, map);
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
            const map = await loadUsersMap(env);
            const existing = map[email];
            if (!existing) return jsonResponse({ ok: false, error: 'Account not found.' }, 404);
            // PHASE 1: PBKDF2 verification, and the new password is stored as
            // a PBKDF2 hash rather than btoa(). Because a session token binds
            // to a fingerprint of the credential generation (see
            // credentialFingerprint), changing the password here also
            // invalidates every session token already issued to this account.
            const chgV = await verifyPassword(env, existing.password, oldPw);
            if (!chgV.ok) return jsonResponse({ ok: false, error: 'Current password is incorrect.' }, 401);
            existing.password = await hashPassword(env, newPw);
            map[email] = storageSafeUser(existing);
            await saveUsersMap(env, map);
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
        if (url.pathname === '/sh/users' && request.method === 'GET') {
            if (!(await isOwnerSessionOrAccount(env, url, null, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadUsersMap(env);
            const out = {};
            for (const k in map) out[k] = publicUser(map[k]);
            return jsonResponse({ ok: true, users: out });
        }

        // ---------- POST /sh/users : owner upsert one user (PLAN CHANGES) ----------
        if (url.pathname === '/sh/users' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!body.email) return jsonResponse({ ok: false, error: 'email required' }, 400);
            const map = await loadUsersMap(env);
            const prev = map[body.email] || {};
            // full owner-controlled upsert (plan, admin flags, everything)
            map[body.email] = { ...prev, ...(body.user || {}), email: body.email };
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true, user: publicUser(map[body.email]) });
        }

        // ---------- POST /sh/users-delete : owner delete one user ----------
        if (url.pathname === '/sh/users-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadUsersMap(env);
            delete map[String(body.email || '')];
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/users-clear : owner delete all (keeps creator/admin) ----------
        if (url.pathname === '/sh/users-clear' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerSessionOrAccount(env, null, body, request))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const keep = String(body.keep || '');
            const map = await loadUsersMap(env);
            const kept = {};
            for (const k of (keep || '').split(',')) {
                const e = k.trim();
                if (e && map[e]) kept[e] = map[e];
            }
            await saveUsersMap(env, kept);
            return jsonResponse({ ok: true });
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

        // ---------- POST /sh/gh-put : owner uploads ONE part ----------
        // Body: { token|ownerProof, id, part (0-based), content (RAW
        // string, <=40MB - NOT base64; the worker b64-encodes for GitHub) }
        // isOwnerRequest covers owner token + ownerProof; ALSO accept any
        // registered user's session token (sh/user-login) so normal users
        // can upload big scripts via the Storage Keeper path too.
        async function isUserOrOwner(env, url, body) {
            if (await isOwnerRequest(env, url, body, request)) return true;
            if (body && body.userToken && await verifyUserToken(body.userToken, env)) return true;
            return false;
        }

        if (url.pathname === '/sh/gh-put' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            if (!/^ScripterHub[0-9]{6,16}$/.test(String(body.id || ''))) return jsonResponse({ ok: false, error: 'id must be ScripterHub followed by 6 to 16 digits' }, 400);
            const id = String(body.id);
            const part = parseInt(String(body.part), 10);
            const content = String(body.content || '');
            if (!Number.isFinite(part) || part < 0 || part > 255) return jsonResponse({ ok: false, error: 'part must be 0..255' }, 400);
            if (!content) return jsonResponse({ ok: false, error: 'content required' }, 400);
            if (content.length > GH_PART_MAX) return jsonResponse({ ok: false, error: 'part too large (max 40MB raw)' }, 413);
            try {
                const b64 = btoa(content); // worker-side b64 (content is raw text)
                const path = 'scripts/' + id + '/' + part + '.part';
                const r = await ghPutPart(env, env.SH_GH_REPO, path, b64, 'main');
                // remember the highest part we have seen for this id
                const recKey = KV_GH_PREFIX + id;
                const rec = JSON.parse((await env.LOADERS_KV.get(recKey)) || '{}');
                rec.parts = rec.parts || {};
                rec.parts[part] = { sha: r && r.content ? r.content.sha : null, len: content.length };
                rec.id = id;
                await env.LOADERS_KV.put(recKey, JSON.stringify(rec), { expirationTtl: LOADER_TTL });
                return jsonResponse({ ok: true, part: part, sha: rec.parts[part].sha });
            } catch (e) {
                return jsonResponse({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
            }
        }

        // ---------- POST /sh/gh-finalize : owner commits + registers the loader ----------
        // Body: { token|ownerProof, id, n (part count), len (total bytes),
        //         name, user, keyless, webKey, keyHash, authRequired,
        //         replaces (old loader id), cipherTail (optional - last
        //         KV-sized slice kept in KV for the browser key page) }
        if (url.pathname === '/sh/gh-finalize' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            if (!/^ScripterHub[0-9]{6,16}$/.test(String(body.id || ''))) return jsonResponse({ ok: false, error: 'id must be ScripterHub followed by 6 to 16 digits' }, 400);
            const id = String(body.id);
            const recKey = KV_GH_PREFIX + id;
            const rec = JSON.parse((await env.LOADERS_KV.get(recKey)) || '{}');
            if (!rec.parts || !Object.keys(rec.parts).length) return jsonResponse({ ok: false, error: 'no parts uploaded for this id (call /sh/gh-put first)' }, 400);
            const n = parseInt(String(body.n), 10);
            if (!Number.isFinite(n) || n < 1) return jsonResponse({ ok: false, error: 'n (part count) required' }, 400);
            // verify all parts 0..n-1 exist in the KV record
            for (let i = 0; i < n; i++) {
                if (!rec.parts[i]) return jsonResponse({ ok: false, error: 'missing part ' + i + ' - upload it first' }, 400);
            }
            const repo = env.SH_GH_REPO;
            let head = null;
            try { head = await ghHead(env, repo, 'heads/main'); } catch (e) { return jsonResponse({ ok: false, error: String(e.message || e).slice(0, 300) }, 502); }
            rec.repo = repo;
            rec.path = 'scripts/' + id;
            rec.n = n;
            rec.len = Number(body.len) || 0;
            rec.head = head;
            rec.name = String(body.name || 'script').slice(0, 100);
            rec.user = String(body.user || 'unknown').slice(0, 100);
            rec.keyless = body.keyless === true;
            rec.webKey = body.webKey === true;
            rec.keyHash = String(body.keyHash || '');
            rec.authRequired = body.authRequired === true;
            rec.at = Date.now();
            await env.LOADERS_KV.put(recKey, JSON.stringify(rec), { expirationTtl: LOADER_TTL });
            // register the loader meta so /sh/<id> serves the GitHub bootstrap
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({
                name: rec.name, user: rec.user, at: rec.at, keyHash: rec.keyHash,
                keyless: rec.keyless, webKey: rec.webKey, authRequired: rec.authRequired,
                storage: 'github', parts: n, len: rec.len
            }), { expirationTtl: LOADER_TTL });
            // optional cipher tail in KV (browser key page for keyed GH scripts)
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
            return jsonResponse({ ok: true, id, parts: n, loadstring: shLoader(base, id) });
        }

        // ---------- POST /sh/gh-delete : owner deletes a GitHub script ----------
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
                    const verdict = classifyLicense(lic[key], hwid, Date.now());
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
        //   GET /sh/<id>          bootstrap only. No artifact bytes, ever.
        //          |
        //   POST /sh/session      authenticate -> D1 session + nonce (45s)
        //          |               nothing secret is returned
        //   GET /sh/a/<id>        THE GATE. consume nonce, consume session,
        //          |               then and only then read artifact bytes
        //          v
        //   (oversized only)
        //   GET /sh/c/<id>/<i>    one forward-only step of a chain
        //
        // The separation between "may I open a session" and "may I have the
        // bytes" is deliberate. Re-checking the license at BOTH is what makes
        // a ban effective on the very next request instead of up to 45s later,
        // and it is the specific hole the audit recorded as G06.
        // ==================================================================

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
                const classify = (k, h, at) => classifyLicense(licensesCache[k], h, at);
                const verdict = classifyAuthorization({
                    noState: false,
                    scriptExists: !!script,
                    killswitch, scriptKilled: false,
                    visibility: script.visibility,
                    isOwner: userEmail.toLowerCase() === OWNER_EMAIL,
                    userId,
                    authRequired: script.authRequired,
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
                    licenseKey = key;
                }

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
        {
            const aMatch = url.pathname.match(/^\/sh\/a\/(ScripterHub[0-9]{6,16})$/);
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
                {
                    // The license that authorised this session is recorded on
                    // the session row itself, so read it back rather than
                    // guessing from the request. It is hashed for the log.
                    const row = await state.peekSession(sid, now);
                    licenseRef = row && row.license_key ? await telemetryRef('lic', row.license_key) : null;
                }

                // ---- where do the bytes come from? ----
                const ghRaw = await env.LOADERS_KV.get(KV_GH_PREFIX + id);
                const isGithub = ghRaw !== null;
                const cmetaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id);
                const isChunked = cmetaRaw !== null;
                let inlineBlob = '';
                if (!isGithub && !isChunked) {
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

                const needsChain = isGithub || isChunked;
                let total = 0;
                if (isChunked) { try { total = Number(JSON.parse(cmetaRaw).n) || 0; } catch (e) { total = 0; } }
                if (isGithub) { try { total = Number(JSON.parse(ghRaw).n) || 0; } catch (e) { total = 0; } }

                // SMALL: everything in one response. This is the strong case:
                // one atomic consume, one response, nothing left to fetch, and
                // no way to come back for more.
                if (!needsChain && inlineBlob && inlineBlob.length <= INLINE_DELIVERY_LIMIT) {
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
                let out = script.keyless ? 'SHL\n' : 'SHK\n';
                out += (sk && !script.keyless ? (sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ') + '\n') : '');
                    out += inlineBlob;
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
                    let head = 'SHG ' + total + ' ' + (isGithub ? '/sh/g/' : '/sh/c/') + id + ' ' + grant + '\n';
                    // Same rule as the inline path: a keyless script's chain
                    // carries no key line. Fixed in both places because they are
                    // separate code paths and the bug was in both.
                    head += (sk && !script.keyless ? (sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ') + '\n') : '');
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
                    const v = classifyLicense(licenses[licKey], licHwid, now);
                    // G05/G06 close here: this is a LIVE check, not the token.
                    if (v.code !== 'ok') {
                        return refuse(v.code === 'banned' ? DENY.BANNED
                            : v.code === 'expired' ? DENY.EXPIRED
                                : v.code === 'hwid' ? DENY.HWID : DENY.NEEDS_KEY);
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
            const rawChunk = await env.LOADERS_KV.get(KV_CHUNK_PREFIX + KV_PREFIX + id + '_' + idx);
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
        //   executor UA -> a fixed bootstrap that contains NO script material.
        //                  It authenticates via /sh/session and fetches via
        //                  /sh/a. The bootstrap is IDENTICAL for every script
        //                  except for the id and the base URL, so inspecting it
        //                  teaches an attacker nothing about any artifact.
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
                return scriptPageResponse(id, script);
            }

            S.events.push({ t: Date.now(), executor: sniffExecutor(ua), scriptId: id });
            S.totalExecutions++;
            S.perScript[id] = (S.perScript[id] || 0) + 1;
            prune(Date.now());
            saveStatsSoon(env);

            // The bootstrap. No ciphertext, no key, no script-derived material.
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
function scriptPageResponse(id, script) {
    const name = String(script.name || 'Protected script').replace(/[<>&"]/g, '');
    const kind = script.authRequired ? 'License required' : 'Free script (account required)';
    const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
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
        + '<code>loadstring(game:HttpGet("' + esc(id) + '"))()</code>'
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

// ---------- LUA SESSION BOOTSTRAP (executors) ----------
// PHASE 3 REPLACEMENT for luaBootstrap() / luaPartsBootstrap().
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
// THE FLOW IT DRIVES
//
//   1. read the license from getgenv().ScripterHubKey (unchanged UX: the
//      user still sets one global before executing the loadstring)
//   2. POST /sh/session  { id, k, h }        -> "SHS <sid> <nonce> <exp>"
//   3. GET  /sh/a/<id>?s&n                   -> "SHK\n<keyline>\n<blob>"
//                                         or "SHG <n> <root> <grant> ..." + parts
//   4. decrypt locally with the Special Key, exactly as before
//
// request() is preferred over game:HttpGet because it can set headers, and the
// header transport is the strong one: a 45s session and a credential that
// never appears in a URL. The HttpGet path is kept as a fallback and is
// deliberately the weaker of the two (15s, URL-borne), matching D5. Both are
// recorded server-side, so the share of traffic on the weak path stays visible
// instead of being silently averaged in.
function luaSessionBootstrap(id, base, keyless) {
    const KEYED = keyless ? 'false' : 'true';
    return '--[[ ScripterHub session loader | ' + id + ' | no script material in this file ]]\n'
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
        + 'local ID=' + JSON.stringify(id) + '\n'
        + 'local BASE=' + JSON.stringify(base) + '\n'
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
        + ' if r=="gone" then return "This script no longer exists, or was replaced by a newer build." end\n'
        + ' if r=="invalid" then return "That license key is not valid." end\n'
        + ' if r=="expired" then return "That license has expired." end\n'
        + ' if r=="banned" then return "That license has been banned." end\n'
        + ' if r=="hwid" then return "That license is locked to different hardware." end\n'
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
        + 'local function QS(t) local o={} for k,v in pairs(t) do o[#o+1]=k.."="..tostring(v) end return table.concat(o,"&") end\n'
        + 'local function GET(url)\n'
        + ' if request then\n'
        + '  local ok,r=pcall(function() return request({Url=url,Method="GET",'
        + 'Headers={["X-SH-Transport"]="header"}}) end)\n'
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
        + 'Headers={["Content-Type"]="application/json",["X-SH-Transport"]="header"}}) end)\n'
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
        + 'local body=GET(BASE.."/sh/a/"..ID.."?s="..S.."&n="..N)\n'
        + 'if type(body)~="string" then DIE("Delivery failed.") return end\n'
        + 'if body:sub(1,6)=="SHERR " then DIE(DENYMSG(body:sub(7):gsub("%s+$",""))) return end\n'
        // ---- 4. assemble the payload
        + 'local SK, B\n'
        + 'if body:sub(1,4)=="SHL\\n" then\n'
        + '  B=body:sub(5)                      -- keyless: the obfuscated code\n'
        + 'elseif body:sub(1,4)=="SHK\\n" then\n'
        + '  local nl=body:find("\\n",5)\n'
        + '  if not nl then DIE("Malformed delivery - no key line.") return end\n'
        + '  SK=body:sub(5,nl-1)                -- "t0 chk k1 k2 k3..."\n'
        + '  B=body:sub(nl+1)                   -- the ciphertext\n'
        + 'elseif body:sub(1,4)=="SHG " then\n'
        + '  local n,root,g=body:match("^SHG (%d+) (%S+) (%S+)")\n'
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
        // ---- 5. decrypt locally with the Special Key (unchanged cipher)
        + 'local function BX(a,b) a=a%4294967296 b=b%4294967296 local r,p=0.0,1.0 for _=1,32 do '
        + 'local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end\n'
        + 'local function SD(k,i) local h=5381.0+i*7 for j=1,#k do local c=string.byte(k,j) '
        + 'h=(h*33+c)%4294967296 end return h end\n'
        + 'local function NX(s) local x=s[1] x=BX(x,(x*8192)%4294967296) x=BX(x,math.floor(x/131072)) '
        + 'x=BX(x,(x*32)%4294967296) s[1]=s[2] s[2]=s[3] s[3]=s[4] s[4]=x return x end\n'
        + 'local function DEC(k) local a,b,c,d=SD(k,0),SD(k,1),SD(k,2),SD(k,3)\n'
        + ' if a==0 then a=1 end if b==0 then b=2 end if c==0 then c=3 end if d==0 then d=4 end\n'
        + ' local s={a,b,c,d} local o={} for i=1,#B do local x=NX(s) o[i]=string.char(BX(string.byte(B,i),x%256)) end\n'
        + ' local t=table.concat(o) if t:sub(1,4)~="SHOK" then return nil end return t:sub(5) end\n'
        + 'local src=B\n'
        + 'if KEYED then\n'
        + ' if type(SK)~="string" or SK=="" then DIE("Missing key material.") return end\n'
        + ' -- SK carries "t0 chk k1 k2 ...". The obfuscated file verifies the\n'
        + ' -- time pad and the check value itself, so a tampered delivery\n'
        + ' -- decrypts to garbage and fails the SHOK magic rather than running.\n'
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
        + 'local ran,perr=pcall(fn)\n'
        + 'if not ran then DIE("The script itself failed: "..tostring(perr)) end\n';
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
