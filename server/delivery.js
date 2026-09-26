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
import { changesOf, run, one } from './d1_state.js';

// A session is short by design. 45s is long enough for an executor to
// authenticate, fetch, decrypt and start, and short enough that a captured
// pair is worthless almost immediately.
export const SESSION_TTL_MS = 45000;// The URL fallback (game:HttpGet cannot set headers) is strictly weaker: the
// credential rides in a URL that can reach access logs. It gets a shorter life
// and is counted separately, so its share of traffic stays visible instead of
// being averaged into the strong path's numbers.
export const URL_SESSION_TTL_MS = 15000;

// A multi-part chain is a long crawl by construction — an executor pulling
// 10GB of parts needs minutes, not seconds. So the chain window is generous
// compared to a single delivery, and the guarantee comes from the forward-only
// cursor rather than from the clock. One-time-ness of each PART is what
// matters; the window only bounds how long a partial crawl can be resumed.
export const CHAIN_GRANT_TTL_MS = 15 * 60 * 1000;

// Artifacts at or below this are returned INLINE by the single delivery gate:
// one atomic consume, one response, nothing left to fetch. That is the strong
// case and it is the normal one.
export const INLINE_DELIVERY_LIMIT = 2 * 1024 * 1024;

// Refusal reasons. Returned to the loader as `SHERR <reason>` so the in-game
// UX can say something useful, and written to the audit log. Deliberately
// coarse: a client that can tell "expired" from "wrong hardware" learns
// something about the keyspace, and it gains nothing operationally either way.
export const DENY = {
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

export async function hmacHex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(String(secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// grant = base64url({sid, scriptId, exp}) + "." + hmac
export async function signGrant(secret, sid, scriptId, expiresAt) {
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
export async function verifyGrant(secret, token, now) {
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
export function classifyAuthorization(o) {
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
export async function deliver(state, o) {
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
export async function openChain(state, sid, total, expiresAt, now) {
    const r = await run(state._db,
        `UPDATE sessions SET parts_total = ?, parts_served = 0, grant_expires_at = ?
          WHERE sid = ? AND consumed_at IS NOT NULL AND revoked = 0
            AND grant_expires_at IS NULL`,
        total, expiresAt, sid);
    return changesOf(r) === 1;
}

// One step of the chain. See the schema comment in 0001_init.sql for why
// `parts_served = ?` must equal the requested index.
export async function advancePart(state, sid, index, total, now) {
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
export async function peekChain(state, sid) {
    return one(state._db,
        'SELECT parts_total, parts_served, grant_expires_at, consumed_at FROM sessions WHERE sid = ?',
        sid);
}
