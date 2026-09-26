// ===========================================================================
// ATOMIC STATE LAYER (Phase 2)
// ===========================================================================
// Everything here exists because of one property that Cloudflare KV cannot
// provide: a single-step validate-and-consume.
//
// The naive implementation is a read followed by a write:
//
//     row = SELECT ... WHERE nonce = ?          // "is it spent?"
//     if (!row.consumed) UPDATE ... SET consumed = 1
//
// Two concurrent requests both read "not spent", both decide to proceed, and
// both receive the artifact. That is a TOCTOU hole sitting directly on the
// property this whole system exists to provide, so it is not acceptable at any
// level of "good enough".
//
// The pattern used throughout instead is ONE conditional UPDATE with every
// precondition in the WHERE clause, where success is defined by
// `changes() === 1`:
//
//     UPDATE sessions SET consumed_at = :now
//      WHERE sid = :sid AND nonce = :nonce
//        AND consumed_at IS NULL AND expires_at > :now AND revoked = 0
//
// A single conditional UPDATE is atomic on its own. There is no read-then-write
// window, so no TOCTOU, and it needs no explicit transaction — which means it
// behaves identically on D1, on the local SQLite used by the tests, and on
// whatever backend comes later.
//
// SEE ALSO: docs/DECISIONS.md D3 (why D1 and not KV) and D4 (why the session
// row is the single authority for one-time use).
//
// This module takes a `db` handle rather than `env`, so it can be exercised
// against real SQLite (see D8) as well as D1 in production.
// ===========================================================================

export const SESSION_TTL_MAX_MS = 60000;   // enforced by a trigger in the schema too

// Opaque, unguessable identifiers. crypto.getRandomValues, not Math.random:
// these are bearer credentials.
function randomId(bytes) {
    const b = new Uint8Array(bytes);
    crypto.getRandomValues(b);
    let hex = '';
    for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
    return hex;
}

export function newSessionId() { return randomId(24); }   // 192 bits
export function newNonce() { return randomId(24); }        // 192 bits

function nowMs() { return Date.now(); }

// ---------------------------------------------------------------------------
// SESSIONS
// ---------------------------------------------------------------------------

// Create a session: one grant, one delivery, one nonce.
//
// The caller must have already authenticated. This function does NOT decide
// whether the caller is allowed one — that is classifyLicense() and the
// ownership/visibility checks, which are the caller's job. Its only job is to
// record that a grant was issued.
export async function createSession(db, spec) {
    const now = spec.now || nowMs();
    const ttl = Math.max(1000, Math.min(Number(spec.ttlMs) || 30000, SESSION_TTL_MAX_MS));
    const sid = newSessionId();
    const nonce = newNonce();
    const expiresAt = now + ttl;

    await db.prepare(`
        INSERT INTO sessions
            (sid, script_id, license_key, user_id, hwid, transport,
             nonce, created_at, expires_at, ip, ua)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        sid,
        String(spec.scriptId || ''),
        spec.licenseKey || null,
        spec.userId || null,
        spec.hwid || null,
        spec.transport === 'url' ? 'url' : 'header',
        nonce,
        now,
        expiresAt,
        spec.ip || null,
        spec.ua ? String(spec.ua).slice(0, 200) : null
    ).run();

    // Audit row for the issued nonce. This is a RECORD, not the authority —
    // see D4. A failure here must not roll back the session.
    try {
        await db.prepare(`
            INSERT INTO nonces (nonce, session_id, script_id, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind(nonce, sid, String(spec.scriptId || ''), now, expiresAt).run();
    } catch (e) { /* forensics only; the session is still authoritative */ }

    return { ok: true, sid, nonce, expiresAt, ttlMs: ttl, transport: spec.transport === 'url' ? 'url' : 'header' };
}

// THE critical operation. Atomically validate and consume a session+nonce pair.
//
// Every precondition lives in the WHERE clause, so the database itself decides
// the winner. Returns the session row on success, or a reason on refusal.
//
// requireLicense: when the session is bound to a license, the license's
// validity and its revocation are checked INSIDE the same statement, via
// subqueries. That matters: doing a separate "is the license still valid?"
// read first and then consuming leaves a window in which a ban landing between
// the two still results in a delivered artifact. Folding the predicates into
// the UPDATE closes that window, which is the whole point of this layer.
// The audit's G06 (a banned key still receiving the split key at delivery) was
// exactly this hole.
//
// Reasons are specific on purpose: a caller that cannot distinguish "expired"
// from "already used" learns less, and the distinction is needed by the
// telemetry and the tests.
export async function consumeSession(db, spec) {
    const now = spec.now || nowMs();
    const sid = String(spec.sid || '');
    const nonce = String(spec.nonce || '');
    if (!sid || !nonce) return { ok: false, reason: 'missing' };

    // Step 1: the single atomic statement. Exactly one concurrent caller can
    // observe changes() === 1; every other concurrent caller matches zero rows
    // because consumed_at is no longer NULL.
    // NOTE ON THE HWID PREDICATE: it was missing in the first version of this
    // guard, and the F7 test caught it. Checking only revocation and expiry
    // meant that re-locking a key to different hardware while a session was
    // outstanding still delivered the artifact to the old session — the exact
    // class of bug this layer exists to prevent. A license is usable when it is
    // unrevoked, unexpired, AND either not yet locked to any hardware or locked
    // to the same hardware the session was issued for.
    const licenseGuard = spec.requireLicense ? `
           AND (SELECT COUNT(*) FROM revocations
                 WHERE subject = 'license' AND subject_id = sessions.license_key) = 0
           AND (SELECT COUNT(*) FROM licenses
                 WHERE \`key\` = sessions.license_key
                   AND revoked_at IS NULL
                   AND (expires_at IS NULL OR expires_at = 0 OR expires_at > ?)
                   AND (hwid IS NULL OR hwid = '' OR hwid = sessions.hwid)) = 1` : '';

    const args = spec.requireLicense
        ? [now, sid, nonce, now, now]
        : [now, sid, nonce, now];

    const res = await db.prepare(`
        UPDATE sessions
           SET consumed_at = ?
         WHERE sid = ?
           AND nonce = ?
           AND consumed_at IS NULL
           AND expires_at > ?
           AND revoked = 0${licenseGuard}
    `).bind(...args).run();

    const changed = Number((res && (res.meta ? res.meta.changes : res.changes)) || 0);
    if (changed !== 1) {
        // Diagnose WHY, for telemetry and for honest error messages. This read
        // happens only after the atomic attempt failed, so it cannot introduce
        // a race: it is reporting a decision that has already been made.
        const row = await db.prepare(`
            SELECT s.consumed_at, s.expires_at, s.revoked, s.license_key,
                   (SELECT COUNT(*) FROM revocations
                     WHERE subject='license' AND subject_id = s.license_key) AS revoked_count,
                   (SELECT COUNT(*) FROM licenses
                     WHERE \`key\` = s.license_key AND revoked_at IS NULL
                       AND (expires_at IS NULL OR expires_at = 0 OR expires_at > ?)
                       AND (hwid IS NULL OR hwid = '' OR hwid = s.hwid)) AS license_ok
              FROM sessions s WHERE s.sid = ?
        `).bind(now, sid).first();
        if (!row) return { ok: false, reason: 'unknown_session' };
        if (row.revoked) return { ok: false, reason: 'session_revoked' };
        if (row.consumed_at !== null && row.consumed_at !== undefined) {
            return { ok: false, reason: 'already_consumed' };
        }
        if (Number(row.expires_at) <= now) return { ok: false, reason: 'session_expired' };
        if (spec.requireLicense) {
            if (Number(row.revoked_count) > 0) return { ok: false, reason: 'license_revoked' };
            if (Number(row.license_ok) === 0) return { ok: false, reason: 'license_invalid_or_expired' };
        }
        return { ok: false, reason: 'nonce_mismatch' };
    }

    // Step 2: the write landed, so this caller owns the delivery. Record the
    // consumption in the audit trail and read back the binding.
    const row = await db.prepare(`
        SELECT sid, script_id, license_key, user_id, hwid, transport, created_at, expires_at
          FROM sessions WHERE sid = ?
    `).bind(sid).first();

    try {
        await db.prepare('UPDATE nonces SET consumed_at = ? WHERE nonce = ?').bind(now, nonce).run();
    } catch (e) { /* forensics only */ }

    return {
        ok: true,
        consumedAt: now,
        session: row ? {
            sid: row.sid,
            scriptId: row.script_id,
            licenseKey: row.license_key,
            userId: row.user_id,
            hwid: row.hwid,
            transport: row.transport,
            createdAt: Number(row.created_at),
            expiresAt: Number(row.expires_at)
        } : null
    };
}

// ---------------------------------------------------------------------------
// LICENSES  (moved into the atomic layer so the consume guard can join on it)
// ---------------------------------------------------------------------------

export async function upsertLicense(db, rec, now) {
    const t = now || nowMs();
    await db.prepare(`
        INSERT INTO licenses (key, script_id, owner_id, hwid, expires_at,
                              revoked_at, revoke_reason, executions, last_auth_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            hwid = excluded.hwid,
            expires_at = excluded.expires_at,
            revoked_at = excluded.revoked_at,
            revoke_reason = excluded.revoke_reason,
            executions = excluded.executions,
            last_auth_at = excluded.last_auth_at
    `).bind(
        String(rec.key), String(rec.scriptId || ''), String(rec.ownerId || ''),
        rec.hwid || null,
        rec.expiresAt ? Number(rec.expiresAt) : null,
        rec.revokedAt ? Number(rec.revokedAt) : null,
        rec.revokeReason || null,
        Number(rec.executions) || 0,
        rec.lastAuthAt ? Number(rec.lastAuthAt) : null,
        t
    ).run();
    return { ok: true };
}

// Classification mirrors the worker's KV-era classifyLicense so behaviour does
// not change when the store moves: invalid / banned / expired / hwid-mismatch.
export async function classifyLicense(db, key, hwid, now) {
    const row = await db.prepare('SELECT * FROM licenses WHERE key = ?').bind(String(key || '')).first();
    if (!row) return { code: 'invalid' };
    if (row.revoked_at) return { code: 'banned', reason: row.revoke_reason };
    if (row.expires_at && Number(row.expires_at) <= (now || nowMs())) return { code: 'expired' };
    if (row.hwid && row.hwid !== hwid) return { code: 'hwid' };
    return { code: 'ok', rec: row };
}

// Mark a session revoked before it is spent. Used when a license is banned
// while a session is outstanding.
export async function revokeSession(db, sid, now) {
    const t = now || nowMs();
    const res = await db.prepare('UPDATE sessions SET revoked = 1 WHERE sid = ?').bind(String(sid)).run();
    return { ok: true, revoked: Number((res && res.meta ? res.meta.changes : 0) || 0) > 0 };
}

// Housekeeping: drop rows that can no longer do anything. Safe to call often.
export async function sweepExpired(db, now) {
    const t = now || nowMs();
    const s = await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t - 10 * 60 * 1000).run();
    const n = await db.prepare('DELETE FROM nonces WHERE expires_at < ?').bind(t - 10 * 60 * 1000).run();
    return { sessions: Number((s && s.meta ? s.meta.changes : 0) || 0), nonces: Number((n && n.meta ? n.meta.changes : 0) || 0) };
}

// ---------------------------------------------------------------------------
// RATE LIMITS  (durable — the in-memory version resets with the isolate)
// ---------------------------------------------------------------------------

// One atomic upsert. The row key is (bucket, window_start) so a fixed window is
// a single row and the increment cannot interleave.
export async function hitRateLimit(db, spec) {
    const now = spec.now || nowMs();
    const windowMs = Math.max(1000, Number(spec.windowMs) || 60000);
    const limit = Math.max(1, Number(spec.limit) || 30);
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const bucket = String(spec.bucket || 'default') + '|' + String(spec.identity || 'anon');

    const res = await db.prepare(`
        INSERT INTO rate_limits (bucket, window_start, count)
        VALUES (?, ?, 1)
        ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1
        RETURNING count
    `).bind(bucket, windowStart).first();

    const count = Number((res && res.count) || 0);
    const allowed = count <= limit;
    const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    return { allowed, count, limit, retryAfterSec, windowStart };
}

// Peek without consuming — used by the tests to prove the increment is real.
export async function peekRateLimit(db, spec) {
    const windowMs = Math.max(1000, Number(spec.windowMs) || 60000);
    const windowStart = Math.floor((spec.now || nowMs()) / windowMs) * windowMs;
    const bucket = String(spec.bucket || 'default') + '|' + String(spec.identity || 'anon');
    const row = await db.prepare('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?')
        .bind(bucket, windowStart).first();
    return Number((row && row.count) || 0);
}

// ---------------------------------------------------------------------------
// REVOCATION
// ---------------------------------------------------------------------------

export async function revokeSubject(db, spec) {
    const now = spec.now || nowMs();
    await db.prepare(`
        INSERT INTO revocations (subject, subject_id, reason, actor, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).bind(
        String(spec.subject || ''), String(spec.subjectId || ''),
        spec.reason ? String(spec.reason).slice(0, 200) : null,
        spec.actor ? String(spec.actor).slice(0, 120) : null,
        now
    ).run();
    // A revoked license must also stop outstanding sessions for that script.
    if (spec.subject === 'license') {
        try {
            await db.prepare(`
                UPDATE sessions SET revoked = 1
                 WHERE license_key = ? AND consumed_at IS NULL
            `).bind(String(spec.subjectId || '')).run();
        } catch (e) { /* best effort; the delivery re-check is the real control */ }
    }
    return { ok: true };
}

export async function isRevoked(db, subject, subjectId) {
    const row = await db.prepare(
        'SELECT id FROM revocations WHERE subject = ? AND subject_id = ? LIMIT 1'
    ).bind(String(subject || ''), String(subjectId || '')).first();
    return !!row;
}

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

// There is deliberately no parameter that can carry source code, a license key,
// a Special Key or artifact bytes. Identifiers are stored as short salted
// digests, so the log supports correlation ("this key failed 40 times") without
// being a credential store in its own right.
export async function recordAudit(db, ev) {
    const now = ev.at || nowMs();
    await db.prepare(`
        INSERT INTO audit_log
            (at, event, outcome, script_id, license_ref, user_ref, session_id,
             nonce_ref, reason, transport, ip, ua)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        now,
        String(ev.event || 'unknown').slice(0, 60),
        String(ev.outcome || 'ok').slice(0, 20),
        ev.scriptId || null,
        ev.licenseRef || null,
        ev.userRef || null,
        ev.sessionId || null,
        ev.nonceRef || null,
        ev.reason ? String(ev.reason).slice(0, 120) : null,
        ev.transport || null,
        ev.ip || null,
        ev.ua ? String(ev.ua).slice(0, 200) : null
    ).run();
    return { ok: true };
}

// Short, stable, non-reversible reference for an identifier we must correlate
// on but must not disclose.
export async function auditRef(env, kind, value) {
    if (!value) return null;
    const enc = new TextEncoder();
    const salt = (env && env.SH_AUDIT_SALT) ? String(env.SH_AUDIT_SALT) : 'sh-audit';
    const d = await crypto.subtle.digest('SHA-256', enc.encode('SHREF::' + salt + '::' + kind + '::' + String(value)));
    // subtle.digest resolves to an ArrayBuffer, which is NOT indexable. Wrap it
    // before reading bytes out of it.
    const bytes = new Uint8Array(d);
    let hex = '';
    for (let i = 0; i < 12 && i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return kind + ':' + hex;
}

// ---------------------------------------------------------------------------
// AVAILABILITY
// ---------------------------------------------------------------------------

// Phase 2 features are only usable once D1 is bound AND migrated. Until then
// the worker must keep serving on the KV path rather than failing closed on
// every request, so callers check this first.
//
// Returns { ready, reason }.
export async function atomicStateReady(db) {
    if (!db) return { ready: false, reason: 'no_d1_binding' };
    try {
        const row = await db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        ).first();
        if (!row) return { ready: false, reason: 'schema_not_applied' };
        return { ready: true, reason: '' };
    } catch (e) {
        return { ready: false, reason: 'query_failed' };
    }
}
