// ===========================================================================
// ATOMIC STATE LAYER — Phase 2 verification
// ===========================================================================
// These tests run against REAL SQLite (node:sqlite) with the ACTUAL
// migrations/0001_init.sql applied, behind a thin adapter that presents D1's
// prepare().bind().first()/run()/all() API.
//
// WHY A REAL ENGINE AND NOT A MOCK (docs/DECISIONS.md D8)
// D1 is SQLite. A hand-rolled fake would encode my assumptions about what
// changes() returns, whether an upsert is atomic, and whether a trigger fires
// — which are exactly the things this work is supposed to verify. A mock that
// agrees with a broken design proves nothing. Here the triggers, the UNIQUE
// constraints and the conditional-UPDATE semantics under test are the real
// ones, so a regression in the SQL is a real regression, not a fake passing.
//
// THE HEADLINE TEST is the concurrency one (A4): it fires many simultaneous
// consume attempts at ONE valid session and asserts that exactly one artifact
// is ever granted. That is the property the entire architecture rests on, and
// it is the one a read-then-write implementation would fail.
// ===========================================================================

import assert from 'assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import * as A from '../For Cloudflare/atomic-state.js';

// --- adapter: node:sqlite -> D1's API shape -------------------------------
function makeD1(db) {
    return {
        prepare(sql) {
            return {
                bind(...args) {
                    return {
                        first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : r; },
                        all() { return db.prepare(sql).all(...args); },
                        run() {
                            const r = db.prepare(sql).run(...args);
                            return { success: true, meta: { changes: r.changes }, changes: r.changes };
                        }
                    };
                },
                first() { const r = db.prepare(sql).get(); return r === undefined ? null : r; },
                all() { return db.prepare(sql).all(); },
                run() { const r = db.prepare(sql).run(); return { success: true, meta: { changes: r.changes } }; }
            };
        }
    };
}

function freshDb() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return { raw: db, d1: makeD1(db) };
}

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
    try { await fn(); pass++; console.log('  OK   ' + name); }
    catch (e) { fail++; failures.push(name); console.log('  FAIL ' + name + '\n         ' + (e && e.message ? e.message : e)); }
}

const SCRIPT = 'ScripterHub1234567890';

// ===========================================================================
console.log('[A] session lifecycle...');
// ===========================================================================

await test('A1  create then consume succeeds and returns the binding', async () => {
    const { d1 } = freshDb();
    const s = await A.createSession(d1, {
        scriptId: SCRIPT, licenseKey: 'KEY1', userId: 'u@x.com', hwid: 'HW1',
        transport: 'header', ttlMs: 30000, ip: '203.0.113.1', ua: 'Delta'
    });
    assert.ok(s.sid && s.nonce, 'no sid/nonce returned');
    assert.ok(s.expiresAt > Date.now(), 'expiry must be in the future');
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce });
    assert.strictEqual(c.ok, true, 'first consume must succeed: ' + JSON.stringify(c));
    assert.strictEqual(c.session.scriptId, SCRIPT);
    assert.strictEqual(c.session.licenseKey, 'KEY1');
    assert.strictEqual(c.session.hwid, 'HW1');
});

await test('A2  a second consume of the SAME nonce is refused', async () => {
    const { d1 } = freshDb();
    const s = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 30000 });
    const first = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce });
    assert.strictEqual(first.ok, true, 'first consume must succeed');
    const second = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce });
    assert.strictEqual(second.ok, false, 'replay must be refused');
    assert.strictEqual(second.reason, 'already_consumed', 'reason should be already_consumed, got ' + second.reason);
});

await test('A3  an expired session is refused (expiry enforced AT USE)', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    const s = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 30000, now: t0 });
    // consume 31s later: the advertised TTL must actually be enforced
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0 + 31000 });
    assert.strictEqual(c.ok, false, 'an expired session must not deliver');
    assert.strictEqual(c.reason, 'session_expired', 'reason should be session_expired, got ' + c.reason);
});

await test('A4  CONCURRENCY: 50 simultaneous consumes grant exactly ONE', async () => {
    // THE headline property. A read-then-write implementation passes A1-A3 and
    // fails here, which is why this test exists.
    const { d1 } = freshDb();
    const s = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 30000 });

    const attempts = [];
    for (let i = 0; i < 50; i++) attempts.push(A.consumeSession(d1, { sid: s.sid, nonce: s.nonce }));
    const results = await Promise.all(attempts);

    const granted = results.filter(r => r.ok);
    assert.strictEqual(granted.length, 1,
        'exactly one consume must win, but ' + granted.length + ' succeeded — this is the TOCTOU hole');
    for (const r of results.filter(x => !x.ok)) {
        assert.strictEqual(r.reason, 'already_consumed', 'losers should report already_consumed, got ' + r.reason);
    }
    // and the artifact really was only handed out once
    const row = await d1.prepare('SELECT consumed_at FROM sessions WHERE sid = ?').bind(s.sid).first();
    assert.ok(row.consumed_at, 'the session must be marked consumed');
});

await test('A5  a revoked session is refused before it is spent', async () => {
    const { d1 } = freshDb();
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K', ttlMs: 30000 });
    await A.revokeSession(d1, s.sid);
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce });
    assert.strictEqual(c.ok, false, 'a revoked session must not deliver');
    assert.strictEqual(c.reason, 'session_revoked', 'reason should be session_revoked, got ' + c.reason);
});

await test('A6  revoking a LICENSE kills its outstanding sessions', async () => {
    const { d1 } = freshDb();
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'KEYX', ttlMs: 30000 });
    await A.revokeSubject(d1, { subject: 'license', subjectId: 'KEYX', reason: 'banned by owner' });
    assert.strictEqual(await A.isRevoked(d1, 'license', 'KEYX'), true);
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce });
    assert.strictEqual(c.ok, false, 'a session whose license was revoked must not deliver');
});

await test('A7  a wrong nonce cannot consume a session', async () => {
    const { d1 } = freshDb();
    const s = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 30000 });
    const bad = await A.consumeSession(d1, { sid: s.sid, nonce: 'deadbeef' });
    assert.strictEqual(bad.ok, false, 'a wrong nonce must be refused');
    // and the real nonce still works afterwards: the failed attempt must not
    // have burned the session
    const good = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce });
    assert.strictEqual(good.ok, true, 'a failed attempt must not consume the session');
});

await test('A8  an unknown sid is refused', async () => {
    const { d1 } = freshDb();
    const c = await A.consumeSession(d1, { sid: 'nope', nonce: 'nope' });
    assert.strictEqual(c.ok, false);
    assert.ok(['unknown_session', 'missing'].includes(c.reason), 'unexpected reason ' + c.reason);
});

// ===========================================================================
console.log('[B] session TTL is bounded by the schema, not just by the code...');
// ===========================================================================

await test('B1  the schema REJECTS a session with a TTL over 60s', async () => {
    const { d1 } = freshDb();
    // The trigger exists so an accidental "expires_at = now + 86400" cannot be
    // merged, no matter what the calling code intends.
    let threw = false;
    try {
        await d1.prepare(`
            INSERT INTO sessions (sid, script_id, nonce, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind('s1', SCRIPT, 'n1', Date.now(), Date.now() + 60001).run();
    } catch (e) { threw = true; }
    assert.ok(threw, 'a >60s session TTL must be rejected by the database itself');
});

await test('B2  createSession clamps an over-long requested TTL', async () => {
    const { d1 } = freshDb();
    const s = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 600000 });
    assert.ok(s.expiresAt - Date.now() <= A.SESSION_TTL_MAX_MS + 50,
        'the requested 10 minute TTL must be clamped, got ' + (s.expiresAt - Date.now()) + 'ms');
    assert.ok(s.expiresAt - Date.now() >= 55000, 'it should still be a usable ~60s, not collapsed to nothing');
});

await test('B3  the two transports are recorded and get different lifetimes', async () => {
    const { d1 } = freshDb();
    const header = await A.createSession(d1, { scriptId: SCRIPT, transport: 'header', ttlMs: 45000 });
    const url = await A.createSession(d1, { scriptId: SCRIPT, transport: 'url', ttlMs: 12000 });
    assert.strictEqual(header.transport, 'header');
    assert.strictEqual(url.transport, 'url');
    const r1 = await A.consumeSession(d1, { sid: header.sid, nonce: header.nonce });
    const r2 = await A.consumeSession(d1, { sid: url.sid, nonce: url.nonce });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
    // the weaker path must expire sooner
    assert.ok(url.expiresAt < header.expiresAt, 'the URL token must expire before the header token');
});

// ===========================================================================
console.log('[C] durable rate limiting...');
// ===========================================================================

await test('C1  the counter increments and enforces the limit', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    let allowedCount = 0;
    for (let i = 0; i < 10; i++) {
        const r = await A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:1.2.3.4', limit: 5, windowMs: 60000, now: t0 });
        if (r.allowed) allowedCount++;
    }
    assert.strictEqual(allowedCount, 5, 'exactly 5 of 10 should be allowed, got ' + allowedCount);
    const peek = await A.peekRateLimit(d1, { bucket: 'auth', identity: 'ip:1.2.3.4', windowMs: 60000, now: t0 });
    assert.strictEqual(peek, 10, 'the counter must reflect all 10 attempts, got ' + peek);
});

await test('C2  buckets are independent per identity and per route', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    for (let i = 0; i < 6; i++) {
        await A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:A', limit: 5, windowMs: 60000, now: t0 });
    }
    const other = await A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:B', limit: 5, windowMs: 60000, now: t0 });
    assert.strictEqual(other.allowed, true, 'a different IP must have its own budget');
    const otherRoute = await A.hitRateLimit(d1, { bucket: 'upload', identity: 'ip:A', limit: 5, windowMs: 60000, now: t0 });
    assert.strictEqual(otherRoute.allowed, true, 'a different route must have its own budget');
});

await test('C3  the window rolls over and the budget resets', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    for (let i = 0; i < 6; i++) {
        await A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:C', limit: 5, windowMs: 60000, now: t0 });
    }
    const blocked = await A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:C', limit: 5, windowMs: 60000, now: t0 });
    assert.strictEqual(blocked.allowed, false, 'must be blocked inside the window');
    assert.ok(blocked.retryAfterSec > 0, 'a blocked caller must be told when to retry');
    const later = await A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:C', limit: 5, windowMs: 60000, now: t0 + 61000 });
    assert.strictEqual(later.allowed, true, 'the budget must reset in the next window');
});

await test('C4  CONCURRENCY: 40 simultaneous hits count exactly 40', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 40 }, () =>
        A.hitRateLimit(d1, { bucket: 'auth', identity: 'ip:RACE', limit: 1000, windowMs: 60000, now: t0 })));
    const peek = await A.peekRateLimit(d1, { bucket: 'auth', identity: 'ip:RACE', windowMs: 60000, now: t0 });
    assert.strictEqual(peek, 40, 'a lost-update race would show fewer than 40, got ' + peek);
});

// ===========================================================================
console.log('[D] audit log cannot hold a secret...');
// ===========================================================================

await test('D1  the audit table has no column that can store source or a key', async () => {
    const { d1 } = freshDb();
    const cols = await d1.prepare("PRAGMA table_info('audit_log')").all();
    const names = cols.map(c => c.name);
    for (const forbidden of ['code', 'source', 'plaintext', 'password', 'key', 'license', 'token', 'secret', 'cipher', 'artifact']) {
        assert.ok(!names.includes(forbidden), 'audit_log must not have a "' + forbidden + '" column');
    }
    assert.ok(names.includes('license_ref') && names.includes('user_ref'),
        'identifiers should be stored as *_ref digests');
});

await test('D2  an audit event records metadata only', async () => {
    const { d1 } = freshDb();
    const ref = await A.auditRef({ SH_AUDIT_SALT: 'pepper' }, 'lic', 'REALKEY-123');
    assert.ok(ref.startsWith('lic:'), 'unexpected ref shape: ' + ref);
    assert.ok(!ref.includes('REALKEY-123'), 'the audit ref must not contain the key');
    await A.recordAudit(d1, {
        event: 'delivery.denied', outcome: 'denied', scriptId: SCRIPT,
        licenseRef: ref, userRef: 'user:abc', sessionId: 'sid1', reason: 'expired',
        transport: 'header', ip: '203.0.113.9', ua: 'Delta'
    });
    const row = await d1.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').first();
    assert.strictEqual(row.event, 'delivery.denied');
    assert.strictEqual(row.outcome, 'denied');
    assert.strictEqual(row.reason, 'expired');
    const dumped = JSON.stringify(row);
    assert.ok(!dumped.includes('REALKEY-123'), 'the raw key leaked into the audit row');
});

await test('D3  audit refs are stable for the same input and differ across inputs', async () => {
    const env = { SH_AUDIT_SALT: 'pepper' };
    const a1 = await A.auditRef(env, 'lic', 'KEY-A');
    const a2 = await A.auditRef(env, 'lic', 'KEY-A');
    const b = await A.auditRef(env, 'lic', 'KEY-B');
    const salted = await A.auditRef({ SH_AUDIT_SALT: 'other' }, 'lic', 'KEY-A');
    assert.strictEqual(a1, a2, 'the same input must produce the same ref (correlation must work)');
    assert.notStrictEqual(a1, b, 'different inputs must produce different refs');
    assert.notStrictEqual(a1, salted, 'the salt must actually change the ref');
});

// ===========================================================================
console.log('[E] availability gating...');
// ===========================================================================

await test('E1  ready() is true once the schema is applied', async () => {
    const { d1 } = freshDb();
    const r = await A.atomicStateReady(d1);
    assert.strictEqual(r.ready, true, 'expected ready, got ' + r.reason);
});

await test('E2  ready() is FALSE with no binding, so callers fall back instead of failing', async () => {
    const r = await A.atomicStateReady(null);
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.reason, 'no_d1_binding');
    // and a db without the schema must also report not-ready, not throw
    const bare = makeD1(new DatabaseSync(':memory:'));
    const r2 = await A.atomicStateReady(bare);
    assert.strictEqual(r2.ready, false, 'an unmigrated database must report not-ready, got ' + r2.reason);
    assert.strictEqual(r2.reason, 'schema_not_applied');
});

await test('E3  sweep removes only dead rows', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    const dead = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 2000, now: t0 - 3600000 });
    const live = await A.createSession(d1, { scriptId: SCRIPT, ttlMs: 30000, now: t0 });
    const out = await A.sweepExpired(d1, t0);
    assert.ok(out.sessions >= 1, 'the expired session should be swept');
    const gone = await d1.prepare('SELECT sid FROM sessions WHERE sid = ?').bind(dead.sid).first();
    const kept = await d1.prepare('SELECT sid FROM sessions WHERE sid = ?').bind(live.sid).first();
    assert.strictEqual(gone, null, 'the dead session must be gone');
    assert.ok(kept, 'the live session must survive the sweep');
});

// ===========================================================================
console.log('[F] delivery-time re-check INSIDE the atomic statement...');
// ===========================================================================
// The audit's G05/G06: an expired or banned license still received the split
// key, because /sh/auth checked the license once and /sh/k trusted the result.
// The fix is not "check again before consuming" — that still leaves a window —
// it is to fold the license predicates into the consume statement itself.

// licenses has FOREIGN KEYs to scripts(id) and users(id), so those parents must
// exist first. A real deployment has them; a test that skips this is testing a
// schema the database would never actually accept.
async function seedScript(d1, id) {
    await d1.prepare(`
        INSERT OR IGNORE INTO users (id, email, username, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, 'pbkdf2$1$x$y', 'owner', ?, ?)
    `).bind('u_owner', 'owner@test.local', 'Owner', Date.now(), Date.now()).run();
    await d1.prepare(`
        INSERT OR IGNORE INTO scripts (id, owner_id, name, visibility, created_at, updated_at)
        VALUES (?, 'u_owner', 'test', 'anyone', ?, ?)
    `).bind(String(id), Date.now(), Date.now()).run();
}

async function seedLicense(d1, rec) {
    await seedScript(d1, rec.scriptId || SCRIPT);
    // licenses.owner_id is a FK to users(id), so it must be the seeded owner,
    // not whatever shorthand the case happened to use.
    await A.upsertLicense(d1, Object.assign({}, rec, { ownerId: 'u_owner' }));
}

await test('F1  a VALID license delivers', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-OK', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: t0 + 3600000 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-OK', hwid: 'HW1', ttlMs: 30000, now: t0 });
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0, requireLicense: true });
    assert.strictEqual(c.ok, true, 'a valid license must deliver: ' + c.reason);
});

await test('F2  an EXPIRED license is refused AT DELIVERY (G05)', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-EXP', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: t0 - 1000 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-EXP', hwid: 'HW1', ttlMs: 30000, now: t0 });
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0, requireLicense: true });
    assert.strictEqual(c.ok, false, 'an expired license must not deliver at delivery time');
    assert.strictEqual(c.reason, 'license_invalid_or_expired', 'reason should name the license, got ' + c.reason);
});

await test('F3  a license that EXPIRES AFTER the session was issued is refused (G05)', async () => {
    // This is the exact audit scenario: /sh/auth succeeded, then the license
    // lapsed, and the old flow still handed over the key.
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-LAPSE', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: t0 + 5000 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-LAPSE', hwid: 'HW1', ttlMs: 30000, now: t0 });
    // the license lapses while the session is still outstanding
    await seedLicense(d1, { key: 'K-LAPSE', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: t0 - 1 });
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0 + 1000, requireLicense: true });
    assert.strictEqual(c.ok, false, 'a license that lapsed after issue must not deliver');
});

await test('F4  a license BANNED after the session was issued is refused (G06)', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-BAN', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: 0 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-BAN', hwid: 'HW1', ttlMs: 30000, now: t0 });
    // the owner bans the key while the session is outstanding
    await seedLicense(d1, { key: 'K-BAN', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: 0, revokedAt: t0 + 500, revokeReason: 'leaked' });
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0 + 1000, requireLicense: true });
    assert.strictEqual(c.ok, false, 'a banned license must not deliver at delivery time');
});

await test('F5  a REVOCATION LIST entry alone is enough, even if the license row is untouched', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-REV', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: 0 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-REV', hwid: 'HW1', ttlMs: 30000, now: t0 });
    await A.revokeSubject(d1, { subject: 'license', subjectId: 'K-REV', reason: 'chargeback', now: t0 + 100 });
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0 + 1000, requireLicense: true });
    assert.strictEqual(c.ok, false, 'the revocation list must be authoritative on its own');
    // revokeSubject() also flips sessions.revoked for outstanding grants, so
    // the session-level guard normally fires first. The subquery is defence in
    // depth for a session created between the revocation and the consume.
    // Either reason is a correct refusal; assert the outcome, not the wording.
    assert.ok(['session_revoked', 'license_revoked'].includes(c.reason),
        'unexpected refusal reason: ' + c.reason);
    // and prove the subquery path independently: clear the session flag, and
    // the revocation subquery must still refuse.
    await d1.prepare('UPDATE sessions SET revoked = 0 WHERE sid = ?').bind(s.sid).run();
    const c2 = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0 + 1000, requireLicense: true });
    assert.strictEqual(c2.ok, false, 'the revocation subquery must refuse on its own');
    assert.strictEqual(c2.reason, 'license_revoked', 'reason should be license_revoked, got ' + c2.reason);
});

await test('F6  a failed license re-check does NOT burn the session', async () => {
    // Uses EXPIRY rather than revocation, because revokeSubject() deliberately
    // flips sessions.revoked as a side effect. This isolates the question:
    // does a denied attempt leave the grant usable once the cause is fixed?
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-TEMP', scriptId: SCRIPT, hwid: 'HW1', expiresAt: t0 - 1000 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-TEMP', hwid: 'HW1', ttlMs: 30000, now: t0 });
    const denied = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0, requireLicense: true });
    assert.strictEqual(denied.ok, false, 'an expired license must be refused');
    // the owner extends the licence
    await seedLicense(d1, { key: 'K-TEMP', scriptId: SCRIPT, hwid: 'HW1', expiresAt: t0 + 3600000 });
    const allowed = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0, requireLicense: true });
    assert.strictEqual(allowed.ok, true, 'a denied attempt must not have consumed the session');
});

await test('F7  a HWID change between issue and delivery is refused', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-HW', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW-ORIGINAL', expiresAt: 0 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-HW', hwid: 'HW-ORIGINAL', ttlMs: 30000, now: t0 });
    // the key is re-locked to different hardware while the session is live
    await seedLicense(d1, { key: 'K-HW', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW-ATTACKER', expiresAt: 0 });
    const c = await A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0 + 1000, requireLicense: true });
    assert.strictEqual(c.ok, false, 'a re-locked HWID must not deliver for the old session');
});

await test('F8  CONCURRENCY under a license guard still grants exactly one', async () => {
    const { d1 } = freshDb();
    const t0 = Date.now();
    await seedLicense(d1, { key: 'K-RACE', scriptId: SCRIPT, ownerId: 'o', hwid: 'HW1', expiresAt: 0 });
    const s = await A.createSession(d1, { scriptId: SCRIPT, licenseKey: 'K-RACE', hwid: 'HW1', ttlMs: 30000, now: t0 });
    const res = await Promise.all(Array.from({ length: 30 }, () =>
        A.consumeSession(d1, { sid: s.sid, nonce: s.nonce, now: t0, requireLicense: true })));
    assert.strictEqual(res.filter(r => r.ok).length, 1,
        'exactly one delivery must be granted under the license guard');
});

// ===========================================================================
console.log('');
console.log('='.repeat(74));
if (fail) {
    console.log('ATOMIC STATE LAYER: ' + fail + ' FAILED, ' + pass + ' passed');
    for (const f of failures) console.log('  - ' + f);
    console.log('='.repeat(74));
    process.exit(1);
}
console.log('ATOMIC STATE LAYER: PASS (' + pass + ' checks, real SQLite, real schema)');
console.log('='.repeat(74));
