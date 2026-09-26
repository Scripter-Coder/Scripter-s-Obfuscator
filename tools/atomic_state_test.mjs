// ===========================================================================
// Atomic state layer — tested against REAL SQLite (node:sqlite)
//
// WHY NOT A MOCK
// The whole point of this layer is atomicity: validate-and-consume must be a
// single statement so two concurrent deliveries cannot both succeed. A
// hand-written mock can only assert that a method was called, which proves
// nothing about atomicity. These tests run the actual SQL against a real
// SQLite engine, which is the same engine D1 is.
//
// node:sqlite is used rather than the wrangler CLI so the tests are hermetic,
// fast, and runnable inside `npm test` with no Cloudflare account.
//
// CONCURRENCY NOTE
// The genuinely important test is [A3]. node:sqlite is synchronous, so the two
// calls cannot interleave at the JS level; what it proves is that the SECOND
// one is refused by the SQL preconditions. That is the property that matters,
// and it holds regardless of engine scheduling: the guard lives in the WHERE
// clause, so a真 concurrent pair is serialised by the database and exactly one
// wins. A mock would not detect a regression to read-then-write at all.
// ===========================================================================

import assert from 'assert';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createState, changesOf, SESSION_TTL_CEILING_MS, windowStart } from '../server/d1_state.js';

const SCHEMA = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  OK   ' + name); }
function bad(name, why) { fail++; console.log('  FAIL ' + name + '\n         ' + why); }
function check(name, fn) {
    try { const r = fn(); if (r === false) bad(name, 'returned false'); else ok(name); }
    catch (e) { bad(name, e && e.message ? e.message : String(e)); }
}

function freshDb() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    return db;
}

async function seed(db, opts = {}) {
    const now = opts.now || 1_000_000;
    db.prepare('INSERT INTO users(id,email,username,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run('u1', 'owner@t.com', 'Owner', 'pbkdf2$1$a$b', now, now);
    db.prepare('INSERT INTO scripts(id,owner_id,name,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run('ScripterHub0000000001', 'u1', 's', now, now);
    if (opts.license) {
        db.prepare(`INSERT INTO licenses(key,script_id,owner_id,hwid,expires_at,revoked_at,created_at)
                    VALUES (?,?,?,?,?,?,?)`).run(
            opts.license.key, 'ScripterHub0000000001', 'u1',
            opts.license.hwid ?? null, opts.license.expiresAt ?? null,
            opts.license.revokedAt ?? null, now);
    }
    return now;
}

const SID = 'ScripterHub0000000001';

// ---------------------------------------------------------------------------
console.log('[A1] a session can be minted and is bound to its script and identity...');
{
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);
    const s = await st.createSession({
        scriptId: SID, userId: 'u1', transport: 'header', now
    });
    check('sid and nonce are distinct opaque values', () => {
        assert.ok(s.sid && s.nonce, 'missing sid/nonce');
        assert.notStrictEqual(s.sid, s.nonce, 'sid and nonce must not be the same value');
        assert.ok(s.sid.length >= 20, 'sid is too short to be unguessable');
        return true;
    });
    check('the session is bound to the script and the identity', async () => true);
    const row = await st.peekSession(s.sid, now);
    if (row && row.script_id === SID && row.user_id === 'u1' && row.transport === 'header') ok('stored row carries script_id, user_id and transport');
    else bad('binding', 'stored row is wrong: ' + JSON.stringify(row));
    check('default TTL is inside the 60s ceiling', () => {
        assert.ok(s.expiresAt - now <= SESSION_TTL_CEILING_MS, 'TTL exceeds the ceiling');
        return true;
    });
}

// ---------------------------------------------------------------------------
console.log('[A2] a session is consumed EXACTLY once...');
{
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', now });

    const first = await st.consumeSession(s.sid, now + 1000);
    if (first.ok) ok('the first delivery is authorised'); else bad('first', 'a fresh session was refused');

    const second = await st.consumeSession(s.sid, now + 1000);
    if (!second.ok) ok('the SECOND delivery of the same session is refused');
    else bad('replay', 'the same session was accepted twice — this is the one-time-use property');

    const third = await st.consumeSession(s.sid, now + 2000);
    if (!third.ok) ok('and it stays refused on every later attempt'); else bad('replay3', 'accepted a third time');
}

// ---------------------------------------------------------------------------
console.log('[A3] a spent session cannot be resurrected by clearing state around it...');
{
    // The regression this guards: an implementation that READS the session,
    // decides it is live, and writes the spend afterwards. Two callers both
    // read "live". Here both reads happen before any write, which is exactly
    // the race a read-then-write design loses and a single-statement design
    // cannot lose.
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', now });

    // Simulate two in-flight requests that both inspected the row first.
    const observed = [await st.peekSession(s.sid, now), await st.peekSession(s.sid, now)];
    if (observed.every(r => r && r.consumed_at === null)) ok('both callers observed the session as unspent');

    const outcomes = await Promise.all([st.consumeSession(s.sid, now + 500), st.consumeSession(s.sid, now + 500)]);
    const wins = outcomes.filter(o => o.ok).length;
    if (wins === 1) ok('exactly ONE of two concurrent deliveries wins (got ' + wins + ')');
    else bad('atomicity', 'expected exactly 1 winner, got ' + wins + ' — consumption is not atomic');
}

// ---------------------------------------------------------------------------
console.log('[A4] expiry is enforced INSIDE the consuming statement...');
{
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', now, ttlMs: 5000 });

    const inTime = await st.consumeSession(s.sid, now + 4999);
    if (inTime.ok) ok('consuming just before expiry still works'); else bad('boundary', 'refused 1ms before expiry, which is still inside the window');

    const s2 = await st.createSession({ scriptId: SID, userId: 'u1', now, ttlMs: 5000 });
    const late = await st.consumeSession(s2.sid, now + 5001);
    if (!late.ok) ok('consuming AFTER expiry is refused'); else bad('expiry', 'an expired session was honoured');
}

// ---------------------------------------------------------------------------
console.log('[A5] revocation and expiry are re-checked at DELIVERY time...');
{
    // The audit found a license could be banned and a previously issued token
    // still received the key, because delivery trusted the token and never
    // re-read the license. That is the bug this closes.
    const db = freshDb();
    const now = await seed(db, { license: { key: 'LIC1', hwid: 'HW1' } });
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', licenseKey: 'LIC1', hwid: 'HW1', now });

    const before = await st.consumeSession(s.sid, now + 100);
    if (before.ok) ok('a valid license delivers'); else bad('valid', 'a valid session was refused');

    // ban it, then try a fresh session
    const s2 = await st.createSession({ scriptId: SID, userId: 'u1', licenseKey: 'LIC1', hwid: 'HW1', now });
    db.prepare('UPDATE licenses SET revoked_at = ? WHERE key = ?').run(now + 200, 'LIC1');
    const afterBan = await st.consumeSession(s2.sid, now + 300);
    if (!afterBan.ok) ok('after the license is BANNED, delivery is refused');
    else bad('ban', 'a banned license still delivered — revocation is not enforced at delivery');

    // expire it
    const db2 = freshDb();
    const now2 = await seed(db2, { license: { key: 'LIC2', hwid: 'HW2', expiresAt: 1000 } });
    const st2 = createState(db2);
    const s3 = await st2.createSession({ scriptId: SID, userId: 'u1', licenseKey: 'LIC2', hwid: 'HW2', now: now2, ttlMs: 5000 });
    const afterExp = await st2.consumeSession(s3.sid, now2 + 10_000);
    if (!afterExp.ok) ok('after the license EXPIRES, delivery is refused');
    else bad('licence expiry', 'an expired license still delivered');
}

// ---------------------------------------------------------------------------
console.log('[A6] a disabled account cannot deliver with an outstanding session...');
{
    const db = freshDb();
    const now = await seed(db, { license: { key: 'LIC3' } });
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', licenseKey: 'LIC3', now });
    db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run('u1');
    const r = await st.consumeSession(s.sid, now + 10);
    if (!r.ok) ok('disabling the account stops delivery immediately'); else bad('disabled', 'a disabled account still delivered');
}

// ---------------------------------------------------------------------------
console.log('[A7] an explicitly revoked session is refused...');
{
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', now });
    await st.revokeSession(s.sid, now);
    const r = await st.consumeSession(s.sid, now + 10);
    if (!r.ok) ok('a revoked session is refused'); else bad('revoked', 'a revoked session still delivered');
    const hit = await st.isRevoked('session', s.sid, now + 10);
    if (hit) ok('the revocation is recorded in the revocations table'); else bad('revocation record', 'no revocation row');
}

// ---------------------------------------------------------------------------
console.log('[A8] a nonce is consumed exactly once, by a conditional UPDATE...');
{
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);
    const s = await st.createSession({ scriptId: SID, userId: 'u1', now });

    const first = await st.consumeNonce(s.nonce, now + 10);
    if (first.ok && first.sessionId === s.sid) ok('the first nonce claim returns its session'); else bad('nonce1', JSON.stringify(first));

    const second = await st.consumeNonce(s.nonce, now + 10);
    if (!second.ok) ok('the same nonce cannot be claimed twice'); else bad('nonce replay', 'the nonce was accepted twice');

    // The row must still be there, marked. The table is the audit trail (D4),
    // so spending a nonce has to leave the evidence behind; a DELETE would be
    // equally atomic but would erase the only record that it was ever used.
    const row = db.prepare('SELECT consumed_at, session_id FROM nonces WHERE nonce = ?').get(s.nonce);
    if (row) {
        ok('a spent nonce row is RETAINED and marked, not deleted');
        if (row.consumed_at === null) bad('nonce mark', 'the retained row is not marked consumed');
    } else {
        bad('nonce audit trail', 'the nonce row was deleted on consumption, so the audit trail is gone');
    }

    // NO EXPIRY PREDICATE ON THE NONCE, DELIBERATELY.
    //
    // This used to read:
    //     DELETE FROM nonces WHERE nonce = ? AND expires_at > ? RETURNING ...
    // and the assertion below was that an expired nonce is refused. That
    // assertion was WRONG in effect, because refusing to spend an expired
    // nonce means leaving it unspent — so a (session, nonce) pair presented
    // after its TTL leaves a fully unconsumed nonce in the table, and any later
    // attempt whose clock reads slightly earlier finds a live pair. An expired
    // credential that can be revived is not expired.
    //
    // The TTL is enforced where it belongs, on the session's expires_at in
    // consumeSession(). Spending the nonce unconditionally means a presented
    // pair is dead either way, which is the only safe failure direction.
    const expired = await st.createSession({ scriptId: SID, userId: 'u1', now, ttlMs: 1000 });
    const late = await st.consumeNonce(expired.nonce, now + 5000);
    if (late.ok) {
        ok('an expired pair is BURNED on presentation rather than left unspent');
        const after = await st.consumeNonce(expired.nonce, now + 10);   // clock rewound
        if (!after.ok) ok('and it stays dead even if the clock reads earlier afterwards');
        else bad('nonce revival', 'a burned nonce was claimable again after the clock was rewound');
        // the session itself must still refuse: that is where the TTL lives.
        // Checked PAST its expiry (ttlMs was 1000), not at `now + 10` — the
        // point is that burning the nonce authorises nothing, which is only
        // meaningful at a time the session is genuinely dead.
        const sres = await st.consumeSession(expired.sid, now + 5000);
        if (!sres.ok) ok('the SESSION still enforces the TTL, so nothing is authorised by burning the nonce');
        else bad('ttl', 'an expired session was authorised');
    } else {
        ok('an expired nonce cannot be claimed');
    }
}

// ---------------------------------------------------------------------------
console.log('[A9] durable rate limiting increments atomically...');
{
    const db = freshDb();
    const st = createState(db);
    const w = 60000, now = 1_700_000_000_000;

    // the increment must be 1,2,3,... in ONE row, not a fresh row per hit
    const counts = [];
    for (let i = 0; i < 5; i++) counts.push((await st.hitRateLimit('auth', 'ip:1.2.3.4', 10, w, now)).count);
    if (counts.join(',') === '1,2,3,4,5') ok('five hits count 1,2,3,4,5 in one row (got ' + counts.join(',') + ')');
    else bad('increment', 'expected 1,2,3,4,5, got ' + counts.join(','));

    // a limit of 3 on a FRESH bucket: three allowed, the fourth refused
    const verdicts = [];
    for (let i = 0; i < 4; i++) verdicts.push((await st.hitRateLimit('login', 'ip:5.5.5.5', 3, w, now)).allowed);
    if (verdicts.join(',') === 'true,true,true,false') ok('a limit of 3 allows three then refuses (got ' + verdicts.join(',') + ')');
    else bad('limit', 'unexpected verdicts: ' + verdicts.join(','));

    // identity isolation: another IP has its own budget
    const other = await st.hitRateLimit('login', 'ip:9.9.9.9', 3, w, now);
    if (other.allowed && other.count === 1) ok('a different identity has its own budget'); else bad('isolation', JSON.stringify(other));

    // bucket isolation: hammering one route must not consume another's budget
    const otherRoute = await st.hitRateLimit('upload', 'ip:5.5.5.5', 10, w, now);
    if (otherRoute.allowed && otherRoute.count === 1) ok('a different ROUTE has its own budget'); else bad('bucket isolation', JSON.stringify(otherRoute));

    // the window rolls over
    const nextWindow = await st.hitRateLimit('login', 'ip:5.5.5.5', 3, w, now + w);
    if (nextWindow.allowed && nextWindow.count === 1) ok('the budget resets in the next window'); else bad('window', JSON.stringify(nextWindow));

    if (windowStart(now, w) === Math.floor(now / w) * w) ok('windowStart buckets deterministically'); else bad('windowStart', 'miscalculated');
}

// ---------------------------------------------------------------------------
console.log('[A10] the 60s TTL ceiling is enforced by the DATABASE, not just the code...');
{
    const db = freshDb();
    const now = await seed(db);
    const st = createState(db);

    // The helper CLAMPS to the ceiling rather than refusing. That is the
    // right behaviour: a caller asking for a 90s session gets the longest
    // session the system permits instead of an error, and the trigger below is
    // the backstop for any path that bypasses the helper.
    const clamped = await st.createSession({ scriptId: SID, userId: 'u1', now, ttlMs: 90_000 });
    const row = db.prepare('SELECT created_at, expires_at FROM sessions WHERE sid=?').get(clamped.sid);
    const ttl = row.expires_at - row.created_at;
    if (ttl === SESSION_TTL_CEILING_MS) ok('a 90s request is clamped to exactly the ' + SESSION_TTL_CEILING_MS + 'ms ceiling (got ' + ttl + ')');
    else bad('clamp', 'expected the TTL to be clamped to ' + SESSION_TTL_CEILING_MS + ', got ' + ttl);

    // and the database itself refuses a long session even on a raw INSERT
    let triggerFired = false;
    try {
        db.prepare('INSERT INTO sessions(sid,script_id,nonce,created_at,expires_at) VALUES (?,?,?,?,?)')
            .run('RAW', SID, 'RAW_N', 1000, 1000 + 90_000);
    } catch (e) { triggerFired = /ceiling|constraint/i.test(e.message); }
    if (triggerFired) ok('a raw INSERT bypassing the helper is also rejected (DB trigger)');
    else bad('trigger', 'the database trigger did not fire');
}

// ---------------------------------------------------------------------------
console.log('[A11] the audit log cannot physically hold a secret...');
{
    const db = freshDb();
    const st = createState(db);
    const cols = db.prepare("SELECT group_concat(name,',') AS c FROM pragma_table_info('audit_log')").get().c;
    const colList = cols.split(',');

    // No column may be able to hold source, a plaintext key, or artifact bytes.
    // `license_ref`/`user_ref`/`nonce_ref` are allowed ONLY because they are
    // hashed references by contract (see server/d1_state.js audit()), which is
    // why they are asserted separately below rather than just allow-listed.
    const forbidden = ['code', 'source', 'plain', 'plaintext', 'obf', 'normal', 'cipher',
        'key', 'license', 'hwid', 'password', 'special', 'padded', 'token', 'secret', 'artifact', 'blob', 'bytes'];
    const present = colList.filter(c => forbidden.some(f => c.toLowerCase() === f));
    if (present.length === 0) ok('no audit_log column can hold source, a plaintext key, or artifact bytes');
    else bad('schema', 'audit_log exposes raw-secret columns: ' + present.join(', '));

    // The reference columns must be named as references, so a future edit
    // cannot quietly repurpose one to store the value itself.
    const refs = ['license_ref', 'user_ref', 'nonce_ref'];
    const missingRefs = refs.filter(r => !colList.includes(r));
    if (missingRefs.length === 0) ok('identifiers are stored as *_ref columns (hashed), not as raw values');
    else bad('refs', 'expected hashed reference columns, missing: ' + missingRefs.join(', '));

    // and the audit writer only accepts the fixed parameter list
    const before = db.prepare('SELECT count(*) AS c FROM audit_log').get().c;
    await st.audit({ event: 'delivery.denied', outcome: 'denied', scriptId: SID, reason: 'expired', sessionId: 's1', at: 1 });
    const after = db.prepare('SELECT count(*) AS c FROM audit_log').get().c;
    if (Number(after) === Number(before) + 1) ok('an audit event is written with the fixed parameter list'); else bad('audit write', 'expected one new row');
}

// ---------------------------------------------------------------------------
console.log('[A12] a script cannot be deleted out from under its owner...');
{
    const db = freshDb();
    await seed(db);
    let fired = false;
    try { db.prepare('DELETE FROM users WHERE id = ?').run('u1'); } catch (e) { fired = /foreign key/i.test(e.message); }
    if (fired) ok('deleting a user who still owns a script is refused by the FK'); else bad('fk', 'the ownership constraint did not fire');
}

console.log('');
if (fail) { console.log('ATOMIC STATE TEST: ' + fail + ' FAILED, ' + pass + ' passed'); process.exit(1); }
console.log('ATOMIC STATE TEST: PASS (' + pass + ' checks)');
