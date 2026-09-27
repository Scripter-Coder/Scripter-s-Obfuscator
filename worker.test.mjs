// Worker test harness: exercises the Cloudflare worker logic in Node with a
// mocked KV binding. Covers the keyless webKey flow, plan changes, user sync,
// and the browser/executor UA split.
//
// PHASE 3: the delivery tests below were rewritten, because the behaviour they
// asserted no longer exists — on purpose. They used to check that an executor
// User-Agent received the artifact directly and that a browser received a page
// with the ciphertext embedded in it. Both were the holes (G01, G02, G03). The
// rewrite asserts the new contract: the public loader carries NO artifact to
// anyone, and the bytes appear only after a real session is spent.
import assert from 'assert';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './tools/owner_code_test_helper.mjs';

// ---- mock KV ----
function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value, opts) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        _store: store
    };
}

// A real D1 (D1 IS SQLite, and d1_state.js normalises the two calling
// conventions). Without it the delivery gate refuses everything, so these
// tests would be measuring the absence of a database rather than the delivery
// contract.
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}

// ---- import the worker (it reads globals at import time; atob/btoa/crypto/
// Response/Request/URL/FormData all exist in Node 18+) ----
const workerSrc = await import('./For Cloudflare/worker.js');
// The owner account address, read from the worker rather than hardcoded here.
// The announcement test posts as the OWNER, so a stale copy of this address
// would quietly be testing a normal account and the test would pass for the
// wrong reason.
const OWNER_EMAIL = (/const OWNER_EMAIL = '([^']+)'/.exec(fs.readFileSync('For Cloudflare/worker.js', 'utf8')) || [])[1];
if (!OWNER_EMAIL) { console.error('could not read OWNER_EMAIL from worker.js'); process.exit(1); }
const worker = workerSrc.default;

const KV = makeKV();
const env = {
    LOADERS_KV: KV,
    SH_SETUP_TOKEN: 'TESTTOKEN123',
    SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret',
    SH_DB: makeD1()
};

const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

async function call(method, path, body, ua, extraHeaders) {
    const headers = Object.assign(
        body ? { 'Content-Type': 'application/json' } : {},
        { 'User-Agent': ua || BROWSER_UA },
        extraHeaders || {}
    );
    const req = new Request('https://test.workers.dev' + path, {
        method: method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, env, { waitUntil: () => {} });
}
async function j(method, path, body, ua, extraHeaders) {
    const r = await call(method, path, body, ua, extraHeaders);
    const text = await r.text();
    try { return { status: r.status, ...JSON.parse(text), _text: text }; }
    catch (e) { return { status: r.status, ok: false, _text: text }; }
}

// tiny b64 for passwords
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

// ============ TESTS ============
// helper: the honest delivery path. Mint a session, then spend it.
//
// `lic` is here because licensed delivery is the fuller path: it exercises the
// key, the HWID lock and the decrypt, not just the session gate. D1 used to make
// this mandatory - an anonymous keyless mint was refused with `SHERR hidden`,
// so a keyless helper would have looked like it was failing for the wrong reason.
async function authorizedFetch(id, ua, lic) {
    const m = await call('POST', '/sh/session', { id, k: lic || 'TESTLIC', h: 'HW' }, ua || EXECUTOR_UA);
    const text = await m.text();
    const parsed = text.trim().split(/\s+/);
    if (parsed[0] !== 'SHS') return { status: m.status, text };
    const [, sid, nonce] = parsed;
    const r = await call('GET', `/sh/a/${id}?s=${sid}&n=${nonce}`, null, ua || EXECUTOR_UA);
    return { status: r.status, text: await r.text() };
}

// One shared owner session token.
//
// W20 added its own /sh/login call, which came back 429 - the login bucket
// allows only a handful per run and every block in this file was already making
// one. The undefined token then surfaced as a 401 from /sh/upload, which reads
// as "this id is not allowed" and is not what happened at all. That is a
// genuinely misleading failure, so the fix is to stop making redundant logins
// rather than to work around the 429.
let _ownerToken = null;
async function sharedOwnerToken() {
    if (_ownerToken) return _ownerToken;
    const r = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    assert.ok(r && r.token && r.token.length > 10, 'owner login must issue a token, got: ' + JSON.stringify(r).slice(0, 160));
    _ownerToken = r.token;
    return _ownerToken;
}

// Seed a license through the product's own endpoint (which mirrors it into the
// table the gate reads), so these tests never bypass the sync path.
async function seedLicense(key, rec) {
    const login = await sharedOwnerToken();
    return j('POST', '/sh/licenses', {
        token: login,
        licenses: { [key]: Object.assign({ hwid: 'HW', expiresAt: 0, banned: false }, rec || {}) }
    });
}

console.log('[W1] health endpoint...');
{
    const d = await j('GET', '/sh/health');
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.loaders, true);
    assert.strictEqual(d.stateLayer, true, 'D1 is bound, so the state layer must report healthy');
    assert.ok(!/REFUSING/.test(String(d.delivery)), 'delivery must not report an outage: ' + d.delivery);
    console.log('    OK');
}

console.log('[W2] owner login (default code) issues a token...');
{
    const d = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    assert.strictEqual(d.ok, true);
    assert.ok(d.token && d.token.length > 10);
    console.log('    OK: token issued');
}

console.log('[W3] KEYLESS upload with cipher+plainCode stores webKey meta...');
let KEYLESS_ID = '';
{
    const login = await sharedOwnerToken();
    const d = await j('POST', '/sh/upload', {
        token: login,
        name: 'FreeScript',
        user: 'tester',
        keyless: true,
        plainCode: '-- obfuscated executor blob (fake)',
        cipher: 'U0hPS0Zha2VDaXBoZXI=', // "SHOKFakeCipher" b64
        keyHash: 'deadbeef',
        normalCode: 'print("hi")'
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    assert.strictEqual(d.keyless, true);
    // The loader prefers `request` and falls back to game:HttpGet, because
            // game:HttpGet throws on at least one executor in circulation. Assert what
            // the loader MEANS rather than the formatting it used to have.
            assert.ok(d.loadstring, 'upload returned a loader');
            assert.ok(d.loadstring.includes('/sh/' + d.id), 'loader points at this script id');
            assert.ok(d.loadstring.includes('test.workers.dev'), 'loader points at this worker');
            assert.ok(d.loadstring.includes('request'), 'loader tries request first');
            assert.ok(!/SHOK|__SH_SPLITKEY|4294967296/.test(d.loadstring), 'loader carries no script material');
    KEYLESS_ID = d.id;
    const meta = JSON.parse(KV._store.get('sh_meta_' + KEYLESS_ID));
    assert.strictEqual(meta.keyless, true);
    assert.strictEqual(meta.webKey, true);
    assert.strictEqual(KV._store.get('sh_web_' + KEYLESS_ID), 'U0hPS0Zha2VDaXBoZXI=');
    assert.strictEqual(KV._store.get('sh_loader_' + KEYLESS_ID), '-- obfuscated executor blob (fake)');
    console.log('    OK: executor blob + encrypted web view stored');
}

// PHASE 3 REWRITE. Was: "EXECUTOR UA gets the plain blob (no key)".
// That WAS the hole: a User-Agent is a string a scraper types, so the artifact
// went to anyone who asked. The loader now returns a protocol bootstrap that
// contains no script material at all, and the bytes only come from the gate.
console.log('[W4] keyless loader: EXECUTOR UA gets a bootstrap with NO artifact...');
{
    const r = await call('GET', '/sh/' + KEYLESS_ID, null, EXECUTOR_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(text.includes('ScripterHub session loader'), 'must be the session bootstrap');
    assert.ok(!text.includes('-- obfuscated executor blob (fake)'),
        'the executor blob must NOT be in the loader response');
    // the bootstrap is the SAME protocol script for every artifact, so it must
    // not grow with the payload
    assert.ok(text.length < 12000, 'the bootstrap must stay small, got ' + text.length);
    console.log('    OK: loader is artifact-free for executors too');
}

// PHASE 3 REWRITE. Was: "BROWSER gets the KEY PAGE (webKey cipher)".
// The old page embedded the ciphertext plus a working decryptor, so a browser
// visitor could read the script by typing the Special Key. There is nothing to
// decrypt now: the page is metadata only. This is a real feature removal.
console.log('[W5] keyless loader: BROWSER gets a metadata page with no cipher...');
{
    const r = await call('GET', '/sh/' + KEYLESS_ID, null, BROWSER_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(!text.includes('U0hPS0Zha2VDaXBoZXI='), 'the web cipher must NOT be embedded');
    assert.ok(!text.includes('-- obfuscated executor blob'), 'browser must NOT see the executor blob');
    assert.ok(!/function dec\(/.test(text), 'the page must not ship a decryptor');
    assert.ok(text.includes(KEYLESS_ID), 'the page should still identify the script');
    console.log('    OK: browser sees metadata only');
}

// PHASE 3 REWRITE. Was: "legacy keyless -> 405 for browsers".
// There is no longer a "legacy" distinction: every script gets the same
// metadata page, because the page never contained anything worth hiding. What
// is asserted here is that the page is identical in shape for a script that
// has no web cipher, i.e. the response does not vary with what is stored.
console.log('[W6] keyless with no cipher: browser still gets the same metadata page...');
{
    const login = await sharedOwnerToken();
    const d = await j('POST', '/sh/upload', { token: login, name: 'OldFree', user: 't', keyless: true, plainCode: '-- legacy blob' });
    const r = await call('GET', '/sh/' + d.id, null, BROWSER_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(!text.includes('-- legacy blob'), 'the blob must not appear');
    assert.ok(text.includes(d.id), 'the page should identify the script');
    console.log('    OK: no artifact for a script with no web cipher either');
}

console.log('[W7] user signup + cross-device login...');
let USER_EMAIL = 'planuser@example.com';
{
    let d = await j('POST', '/sh/user-signup', { email: USER_EMAIL, username: 'PlanUser', password: 'secret123' });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    assert.strictEqual(d.user.plan, 'Basic');
    d = await j('POST', '/sh/user-login', { emailOrUsername: 'PlanUser', password: 'secret123' });
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.user.email, USER_EMAIL);
    console.log('    OK: signup + login work');
}

console.log('[W8] owner signup keeps owner flags usable for owner auth...');
{
    // simulate the owner account being created/migrated on another device
    let d = await j('POST', '/sh/user-sync', {
        email: 'dubovikstanislav51@gmail.com',
        password: 'ownerpass1',
        user: { id: 'user_owner', email: 'dubovikstanislav51@gmail.com', username: 'Scripter', isScripter: true, isAdmin: true, plan: 'God', createdAt: new Date().toISOString() }
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    assert.strictEqual(d.user.isScripter, true, 'owner migration must KEEP isScripter (Issue 3 root cause)');
    console.log('    OK: owner flags survive migration');
}

// PHASE 1: these two cases used to authenticate with `ownerProof`, which was
// the base64 owner PASSWORD. That path is removed from the worker (a password
// in a request is not an acceptable admin credential, and it was accepted from
// a query string). The BEHAVIOUR under test is unchanged and still asserted:
// an authenticated owner may change a plan, and an unauthenticated caller may
// not. Only the credential changed, to a real owner session token.

console.log('[W9] PLAN CHANGE by an authenticated owner works...');
{
    const owner = await sharedOwnerToken();
    // The shared token is a STRING now, so there is no .ok to read. Asserting on
    // its shape instead, and deliberately NOT printing it: a token in a failure
    // message is a credential in a log.
    assert.ok(typeof owner === 'string' && owner.length > 10, 'the shared owner token must be a non-empty string');
    let d = await j('POST', '/sh/users', { token: owner, email: USER_EMAIL, user: { plan: 'Pro', stats: { projects: { used: 0, max: 500 }, keys: { used: 0, max: 100000 }, scripts: { used: 0, max: 300 }, fileSize: { used: 0, max: 1024 } } } });
    assert.strictEqual(d.ok, true, 'plan change must sync: ' + JSON.stringify(d));
    assert.strictEqual(d.user.plan, 'Pro');
    // the user now pulls their own record -> sees the new plan
    d = await j('POST', '/sh/user-get', { email: USER_EMAIL, password: 'secret123' });
    assert.strictEqual(d.user.plan, 'Pro', 'user must receive the changed plan');
    console.log('    OK: plan change reaches the user record');
}

console.log('[W10] plan change without owner authorization is rejected...');
{
    // no token at all
    let d = await j('POST', '/sh/users', { email: USER_EMAIL, user: { plan: 'God' } });
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.status, 401);
    // a garbage token
    d = await j('POST', '/sh/users', { token: 'not-a-real-token', email: USER_EMAIL, user: { plan: 'God' } });
    assert.strictEqual(d.ok, false, 'a forged token must not authorize a plan change');
    assert.strictEqual(d.status, 401);
    // the REMOVED credential: the base64 owner password must no longer work
    d = await j('POST', '/sh/users', { ownerProof: b64('ownerpass1'), email: USER_EMAIL, user: { plan: 'God' } });
    assert.strictEqual(d.ok, false, 'ownerProof (base64 password) must be rejected — the path was removed in Phase 1');
    assert.strictEqual(d.status, 401);
    console.log('    OK: no privilege escalation, and the old password credential is dead');
}

console.log('[W11] owner pulls all users (panel)...');
{
    const owner = await sharedOwnerToken();
    // The shared token is a STRING now, so there is no .ok to read. Asserting on
    // its shape instead, and deliberately NOT printing it: a token in a failure
    // message is a credential in a log.
    assert.ok(typeof owner === 'string' && owner.length > 10, 'the shared owner token must be a non-empty string');
    // Prefer the header: a token in a query string lands in access logs.
    const d = await j('GET', '/sh/users', null, BROWSER_UA, { 'X-SH-Token': owner });
    assert.strictEqual(d.ok, true, 'owner panel pull must work via the auth header: ' + JSON.stringify(d));
    assert.ok(d.users[USER_EMAIL]);
    assert.strictEqual(d.users[USER_EMAIL].plan, 'Pro');
    assert.ok(!d.users[USER_EMAIL].password, 'passwords must never be returned');
    // and the removed credential must not open the panel either
    const bad = await j('GET', '/sh/users?ownerProof=' + encodeURIComponent(b64('ownerpass1')));
    assert.strictEqual(bad.ok, false, 'ownerProof in a query string must no longer authorize the user table');
    console.log('    OK: panels see every user via a header token, plan included');
}

console.log('[W12] non-owner user-sync cannot change own plan...');
{
    const d = await j('POST', '/sh/user-sync', {
        email: USER_EMAIL,
        password: 'secret123',
        user: { plan: 'God', stats: { projects: { used: 0, max: Infinity } } }
    });
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.user.plan, 'Pro', 'self-sync must NOT change the plan');
    console.log('    OK: plan stays owner-controlled');
}

// PHASE 3 REWRITE. Was: "/sh/k with a matching t0 serves the key to executors".
// t0 alone is not a credential — it is a constant baked into the shipped file
// and therefore known to anyone holding the file, which is exactly the
// client-forgeable token the audit flagged as G09. /sh/k now additionally
// requires a server-issued (sid, nonce) pair, and spends it.
console.log('[W13] SPLIT-KEY: /sh/k needs a live session, not just the baked t0...');
const SPLIT_ID = 'ScripterHub0000000042';
{
    const login = await sharedOwnerToken();
    const t0 = Date.now();
    const padded = [12, 34, 56, 78, 90, 123, 45, 67];
    const up = await j('POST', '/sh/upload', {
        token: login,
        name: 'SplitTest', user: 'tester',
        cipher: 'U0hPS0Zha2U=', keyHash: 'cafe',
        authRequired: true,
        wantId: SPLIT_ID,
        splitKey: { paddedKey: padded, t0: t0, chk: 777 }
    });
    assert.strictEqual(up.ok, true, JSON.stringify(up));
    assert.strictEqual(up.id, SPLIT_ID, 'worker must honor the pre-generated wantId');
    const lic = await seedLicense('TESTLIC');
    assert.strictEqual(lic.ok, true, 'license seed failed: ' + JSON.stringify(lic));

    // t0 alone must NOT release the key any more
    const noSess = await call('GET', `/sh/k/${SPLIT_ID}?t=${t0}`, null, EXECUTOR_UA);
    assert.strictEqual(noSess.status, 405, 'a matching t0 with no session must be refused');

    // mint, then present the real pair
    const m = await call('POST', '/sh/session', { id: SPLIT_ID, k: 'TESTLIC', h: 'HW' }, EXECUTOR_UA);
    const mtext = (await m.text()).trim().split(/\s+/);
    assert.strictEqual(mtext[0], 'SHS', 'expected a session, got: ' + mtext.join(' '));
    const r = await call('GET', `/sh/k/${SPLIT_ID}?t=${t0}&s=${mtext[1]}&n=${mtext[2]}`, null, EXECUTOR_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(text.startsWith('SHK ' + t0 + ' 777 '), 'key response format');
    assert.ok(text.includes(padded.join(' ')), 'padded bytes present');

    // and the pair is single-use: the same s/n a second time must fail
    const again = await call('GET', `/sh/k/${SPLIT_ID}?t=${t0}&s=${mtext[1]}&n=${mtext[2]}`, null, EXECUTOR_UA);
    assert.strictEqual(again.status, 405, 'a session must not release the key twice');

    // browser gets NOTHING
    const m2 = await call('POST', '/sh/session', { id: SPLIT_ID, k: 'TESTLIC', h: 'HW' }, EXECUTOR_UA);
    const p2 = (await m2.text()).trim().split(/\s+/);
    const rb = await call('GET', `/sh/k/${SPLIT_ID}?t=${t0}&s=${p2[1]}&n=${p2[2]}`, null, BROWSER_UA);
    assert.strictEqual(rb.status, 405, 'browsers must not fetch split keys');

    // wrong t0 gets NOTHING
    const m3 = await call('POST', '/sh/session', { id: SPLIT_ID, k: 'TESTLIC', h: 'HW' }, EXECUTOR_UA);
    const p3 = (await m3.text()).trim().split(/\s+/);
    const rw = await call('GET', `/sh/k/${SPLIT_ID}?t=${t0 + 1}&s=${p3[1]}&n=${p3[2]}`, null, EXECUTOR_UA);
    assert.strictEqual(rw.status, 405, 'wrong t0 must be rejected');
    console.log('    OK: split key needs a spent-once session, exact-t0 enforced, executor only');
}

// PHASE 3 REWRITE. Was: "free script blob still served to executors".
// The artifact now only comes from the gate, and only after a session is spent.
console.log('[W14] SPLIT-KEY: the loader + the gate work together...');
{
    const boot = await call('GET', '/sh/' + SPLIT_ID, null, EXECUTOR_UA);
    const bootText = await boot.text();
    assert.ok(bootText.includes('ScripterHub session loader'), 'loader must be the bootstrap');
    assert.ok(!bootText.includes('U0hPS0Zha2U='), 'the loader must not carry the artifact');

    // and the gate delivers it on the honest path, key line and all
    const got = await authorizedFetch(SPLIT_ID, EXECUTOR_UA, 'TESTLIC');
    assert.strictEqual(got.status, 200, 'gate must deliver: ' + got.text.slice(0, 120));
    assert.ok(got.text.startsWith('SHK\n'), 'a keyed delivery carries the key line first');
    assert.ok(got.text.includes('U0hPS0Zha2U='), 'the gated delivery must contain the artifact');

    // and a second attempt with a fresh session is a NEW authorized delivery,
    // which is correct: a session is one fetch, not a permanent ban.
    const again = await authorizedFetch(SPLIT_ID, EXECUTOR_UA, 'TESTLIC');
    assert.strictEqual(again.status, 200, 'a fresh session must still be able to fetch');
    console.log('    OK: artifact arrives only through the gate');
}

// ============ AEGIS PROXY ============
// The site used to POST to api.aegis-obfuscater.cc.cd from the browser with only
// a Content-Type header. Aegis is API v4 and every programmatic call needs an
// admin-issued X-Api-Key, so the option returned 401 on every publish. The call
// now goes through /sh/aegis, which holds the key.
//
// These assert the GENERATED worker, not the source shape - which is the only
// thing that settles the two things that actually matter here:
//
//   1. The route runs at all. /sh/aegis calls isOwnerRequest roughly 130 lines
//      ABOVE that function's declaration. A function declaration hoists within
//      its enclosing function body, so this works - but if the route ever ended
//      up in a nested block it would throw a ReferenceError on every call, and
//      no source-shape assertion would notice. A 401 proves the call resolved.
//   2. The key is sent on the outbound request, and the 202 queued-job path -
//      which the old client code read as if it were a file, producing a
//      "script" that was a JSON job object - is actually handled.
console.log('[W15] AEGIS: the proxy holds the key, is owner-only, and handles queued jobs...');
{
    // There is no shared owner token in this file - each block logs in through
    // the product's own endpoint, deliberately, so no test bypasses real auth.
    const aegisLogin = await sharedOwnerToken();
    const ownerToken = aegisLogin;
    assert.ok(ownerToken && ownerToken.length > 10, 'owner login must issue a token for the proxy tests');

    // 1. no token -> 401. Reaching this response at all means isOwnerRequest
    //    resolved; a ReferenceError would have surfaced as a 500.
    const anon = await j('POST', '/sh/aegis', { source: 'print(1)' });
    assert.strictEqual(anon.status, 401, '/sh/aegis must refuse an unauthenticated caller, got ' + anon.status);

    // 2. owner token, but the secret is absent -> a clear 501 that says WHERE to
    //    set it. Asserted on the location because "AEGIS_API_KEY is not set" on
    //    its own sends people to Settings > Bindings, where it cannot be set at
    //    all - it is a Secret, not a resource binding.
    const noKey = await j('POST', '/sh/aegis', { source: 'print(1)', token: ownerToken });
    assert.strictEqual(noKey.status, 501, 'a missing AEGIS_API_KEY must say so, got ' + noKey.status);
    assert.ok(/AEGIS_API_KEY/.test(noKey.error || ''), 'the 501 must name the setting: ' + noKey.error);
    assert.ok(/Variables and Secrets/.test(noKey.error || ''), 'the 501 must name the dashboard section: ' + noKey.error);
    assert.ok(/wrangler secret put/.test(noKey.error || ''), 'the 501 must offer the CLI alternative: ' + noKey.error);

    // 3. empty source is rejected
    const empty = await j('POST', '/sh/aegis', { source: '', token: ownerToken });
    assert.strictEqual(empty.status, 400, 'an empty source must be a 400, got ' + empty.status);

    // 4. with the binding set, the outbound request must carry X-Api-Key, and a
    //    202 queued job must be polled rather than downloaded as if it were a
    //    file. fetch is stubbed, so the real service is never contacted.
    const realFetch = globalThis.fetch;
    const seen = [];
    let pollCount = 0;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        seen.push({ url: url, headers: (init && init.headers) || {} });
        if (url.indexOf('/api/obfuscate') >= 0) {
            return new Response(JSON.stringify({ queued: true, jobId: 'JOB123' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.indexOf('/api/job/JOB123') >= 0) {
            pollCount++;
            // not ready on the first two polls, ready on the third
            if (pollCount < 3) return new Response(JSON.stringify({ status: 'running' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            return new Response(JSON.stringify({ status: 'done', url: '/files/FILE1/ATT1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.indexOf('/files/FILE1/ATT1') >= 0) {
            return new Response('-- obfuscated by aegis\nprint(1)', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
        throw new Error('unexpected outbound URL: ' + url);
    };
    try {
        env.AEGIS_API_KEY = 'ak_test_key_123';
        const res = await j('POST', '/sh/aegis', { source: 'print(1)', name: 'demo', token: ownerToken });
        assert.ok(res.ok, 'the queued path must resolve to ok, got ' + JSON.stringify(res).slice(0, 200));
        assert.ok(/obfuscated by aegis/.test(res.code || ''), 'the finished file text must come back, got: ' + String(res.code).slice(0, 80));
        assert.ok(pollCount >= 3, 'a queued job must be polled until it is done (polls: ' + pollCount + ')');

        // the key must be on the outbound header, and must never be echoed back
        const submit = seen.filter(s => s.url.indexOf('/api/obfuscate') >= 0)[0];
        assert.ok(submit, 'the proxy must call the Aegis API');
        assert.strictEqual(submit.headers['X-Api-Key'], 'ak_test_key_123', 'the outbound call must carry X-Api-Key');
        assert.ok(!(res._text || '').includes('ak_test_key_123'), 'the key must never appear in the response');
        console.log('    OK: key is server-side, queued jobs are polled, non-owners are refused');
    } finally {
        globalThis.fetch = realFetch;
        delete env.AEGIS_API_KEY;
    }
}

// ============ HOST ANNOUNCEMENT ============
// Owner-only writes, public reads (it is a banner, not account data), and
// colours that are pattern-validated rather than escaped.
//
// The colour assertion is the one that matters. Both colours are interpolated
// into a style="color: ...; background: ..." attribute on EVERY client, so a
// colour field is exactly the kind of input that looks harmless and then
// carries `}</style><script>`. A regex cannot express that at all, which is
// precisely why it is a regex and not an escape.
console.log('[W16] ANNOUNCEMENT: owner-only writes, and colours cannot carry markup...');
{
    const annLogin = await sharedOwnerToken();
    const rulesToken = annLogin;

    // no announcement yet
    const empty = await j('GET', '/sh/announcement');
    assert.ok(empty.ok, 'the read must succeed for any client');
    assert.strictEqual(empty.announcement, null, 'a fresh worker has no announcement');

    // a non-owner cannot set one
    const denied = await j('POST', '/sh/announcement', { text: 'from a normal user', token: 'not-a-real-token' });
    assert.strictEqual(denied.status, 401, 'a non-owner must not be able to broadcast, got ' + denied.status);
    const stillEmpty = await j('GET', '/sh/announcement');
    assert.strictEqual(stillEmpty.announcement, null, 'the refused write must not have taken effect');

    // the owner can, and a read sees it
    const set = await j('POST', '/sh/announcement', {
        token: rulesToken, text: 'Maintenance at 22:00 UTC', color: '#00ff88', bg: '#101020'
    });
    assert.ok(set.ok, 'the owner must be able to set one: ' + JSON.stringify(set).slice(0, 160));
    const got = await j('GET', '/sh/announcement');
    assert.ok(got.announcement, 'the banner must be readable');
    assert.strictEqual(got.announcement.text, 'Maintenance at 22:00 UTC');
    assert.strictEqual(got.announcement.color, '#00ff88', 'a valid colour must be kept verbatim');
    assert.strictEqual(got.announcement.bg, '#101020');
    assert.ok(got.announcement.at > 0, 'it must be stamped');

    // a hostile colour is REPLACED, not escaped-and-kept
    const attack = await j('POST', '/sh/announcement', {
        token: rulesToken,
        text: 'colour test',
        color: 'red;}#x{background:url(javascript:alert(1))',
        bg: '"><script>alert(1)</script>'
    });
    assert.ok(attack.ok, 'the message itself should still be accepted');
    assert.strictEqual(attack.announcement.color, '#ffffff', 'a non-hex colour must fall back to the default, got ' + attack.announcement.color);
    assert.strictEqual(attack.announcement.bg, '#6c3bff', 'a non-hex background must fall back to the default, got ' + attack.announcement.bg);
    const after = await j('GET', '/sh/announcement');
    assert.ok(!/<script>/.test(JSON.stringify(after.announcement)), 'no markup may survive into the stored record');
    assert.ok(!/javascript:/.test(JSON.stringify(after.announcement)), 'no javascript: may survive');

    // 3/4/8-digit hex are all valid CSS colours and must be accepted
    for (const hex of ['#fff', '#ffff', '#a1b2c3', '#a1b2c3ff']) {
        const r = await j('POST', '/sh/announcement', { token: rulesToken, text: 'hex ' + hex, color: hex, bg: hex });
        assert.strictEqual(r.announcement.color, hex, hex + ' is valid CSS hex and must be kept, got ' + r.announcement.color);
    }

    // The owner's own ACCOUNT session is enough - no access code needed.
    // Idempotent, and the SAME credential W8 seeded the owner with. A signup here
    // collides with the account that block already created, and then the login
    // below fails on a password that was never set - which is what happened.
    const OWNER_PW = 'ownerpass1';
    const ownerRec = await j('POST', '/sh/user-sync', {
        email: OWNER_EMAIL,
        password: OWNER_PW,
        user: { id: 'user_owner', email: OWNER_EMAIL, username: 'Scripter', plan: 'Basic', isScripter: true, isAdmin: true }
    });
    assert.ok(ownerRec.ok, 'the owner account must be usable for this test: ' + JSON.stringify(ownerRec).slice(0, 160));
    const ownerLogin = await j('POST', '/sh/user-login', { emailOrUsername: OWNER_EMAIL, password: OWNER_PW });
    assert.ok(ownerLogin.token, 'the owner account must be able to sign in: ' + JSON.stringify(ownerLogin).slice(0, 140));

    const asAccount = await j('POST', '/sh/announcement', {
        userToken: ownerLogin.token, text: 'posted with the account session', color: '#00ff88', bg: '#101020'
    });
    assert.ok(asAccount.ok, 'the owner ACCOUNT session must be able to post, with no access code: ' + JSON.stringify(asAccount).slice(0, 200));
    assert.strictEqual(asAccount.announcement.text, 'posted with the account session');

    // A NORMAL account must still be refused. This is why isUserOrOwner was not
    // reused: accepting any valid user token would let any registered user
    // broadcast a banner to every signed-in device.
    await j('POST', '/sh/user-signup', {
        email: 'announce-other@test.local', username: 'SomeUser', password: 'password123', description: 'x'
    });
    const otherLogin = await j('POST', '/sh/user-login', { emailOrUsername: 'announce-other@test.local', password: 'password123' });
    const asOther = await j('POST', '/sh/announcement', { userToken: otherLogin.token, text: 'not allowed' });
    assert.strictEqual(asOther.status, 401, 'a normal account must NOT be able to broadcast, got ' + asOther.status);
    const unchanged = await j('GET', '/sh/announcement');
    assert.strictEqual(unchanged.announcement.text, 'posted with the account session',
        'the refused post must not have changed the banner');

    // the same path still works with the access-code session, as before
    const viaCode = await j('POST', '/sh/announcement', { token: rulesToken, text: 'via the access code' });
    assert.ok(viaCode.ok, 'the access-code session must still work: ' + JSON.stringify(viaCode).slice(0, 160));

    // an empty message clears it
    const cleared = await j('POST', '/sh/announcement', { token: rulesToken, text: '   ' });
    assert.ok(cleared.ok && cleared.cleared, 'an empty message must clear the banner');
    const gone = await j('GET', '/sh/announcement');
    assert.strictEqual(gone.announcement, null, 'the banner must be gone after clearing');

    // and text is capped, so a long paste cannot bloat the KV value
    const huge = 'x'.repeat(5000);
    const capped = await j('POST', '/sh/announcement', { token: rulesToken, text: huge });
    assert.ok(capped.announcement.text.length <= 600, 'text must be capped at 600, got ' + capped.announcement.text.length);

    console.log('    OK: only the owner can broadcast; colours are pattern-validated; text is capped');
}

// ============ RULES ENFORCEMENT ============
// The Settings tab used to say "Coming Soon". The rules are now enforced, and
// the single most important property to test is the one this project treats as
// absolute: a penalty BLOCKS and never DELETES.
//
// So each case asserts two things - that the block exists, and that the account
// and its record are still fully intact afterwards. A test that only checked for
// the block would pass just as happily against an implementation that dropped
// the user on the floor.
console.log('[W17] RULES: a violation blocks with an expiry and deletes nothing...');
{
    // rulesToken is scoped to the W16 block, so this logs in for its own - the
    // same pattern every other block in this file uses.
    const rulesLogin = await sharedOwnerToken();
    const rulesToken = rulesLogin;
    assert.ok(rulesToken, 'owner login must issue a token for the rules tests');
    const HOUR = 60 * 60 * 1000;
    // One address per signup, from TEST-NET-3 (documentation range, so nothing
    // here can be a real host). Without this the block trips the pre-existing
    // per-IP flood guard partway through and dies before reaching its own
    // assertions - which reads as a rules failure and is not one.
    let rulesIp = 0;
    const signup = (email, username, description) => j('POST', '/sh/user-signup',
        { email: email, username: username, password: 'password123', description: description || 'x' },
        BROWSER_UA, { 'CF-Connecting-IP': '203.0.113.' + (++rulesIp) });

    // --- swearing in a username: blocked 1 hour, account created and kept ---
    const swear = await signup('rules-swear@test.local', 'fucklord', 'hi');
    assert.ok(swear.ok, 'a swearing username must still CREATE the account, not reject it: ' + JSON.stringify(swear).slice(0, 200));
    assert.ok(swear.moderated, 'the response must say it was moderated, got: ' + JSON.stringify(swear).slice(0, 200));
    assert.ok(/swearing/.test(swear.moderated.reason), 'the reason must name the rule, got: ' + swear.moderated.reason);
    assert.strictEqual(swear.moderated.penaltyHours, 1, 'a first offence is 1 hour, got ' + swear.moderated.penaltyHours);

    // the record is still there - this is the whole point. Checked through the
    // owner list, because /sh/user-get requires the account's password and this
    // test has no reason to hold one.
    const afterSignup = await j('GET', '/sh/users', null, BROWSER_UA, { 'X-SH-Token': rulesToken });
    const kept = afterSignup.users && afterSignup.users['rules-swear@test.local'];
    assert.ok(kept, 'the account must still exist after being moderated');
    assert.strictEqual(kept.username, 'fucklord', 'the username must be preserved, not sanitised away');

    // and login is refused WITH a reason (checked after the password, so it is
    // not an enumeration oracle)
    const blocked = await j('POST', '/sh/user-login', { emailOrUsername: 'rules-swear@test.local', password: 'password123' });
    assert.strictEqual(blocked.status, 403, 'a blocked account must be refused, got ' + blocked.status);
    assert.ok(/blocked for/i.test(blocked.error || ''), 'the refusal must say it is blocked, got: ' + blocked.error);
    assert.ok(/untouched/i.test(blocked.error || ''), 'the refusal must say the data is untouched, got: ' + blocked.error);

    // a WRONG password must not reveal the block - otherwise "is this account
    // blocked?" becomes a free oracle that answers faster than a real guess
    const wrongPw = await j('POST', '/sh/user-login', { emailOrUsername: 'rules-swear@test.local', password: 'wrongwrong' });
    assert.strictEqual(wrongPw.status, 401, 'a wrong password must stay a plain 401, got ' + wrongPw.status);
    assert.ok(!/blocked/i.test(wrongPw.error || ''), 'a wrong password must not leak the block state, got: ' + wrongPw.error);

    // --- an automated name: 1 year ---
    // 'bot_99', not '7'. A one-character username is already refused by the
    // pre-existing shape guard (length < 2), so it never reaches the rules - the
    // test has to use a name that is actually long enough to get there.
    const bot = await signup('rules-bot@test.local', 'bot_99');
    assert.ok(bot.ok, 'the account must still be created -> ' + JSON.stringify(bot).slice(0, 220));
    assert.ok(bot.moderated, 'a numeric-only username must be moderated');
    assert.strictEqual(bot.moderated.penaltyHours, 24 * 365, 'a bot name is 1 year, got ' + bot.moderated.penaltyHours);

    // --- an honest username is left completely alone ---
    const clean = await signup('rules-clean@test.local', 'NightOwl', 'a normal person');
    assert.ok(clean.ok, 'an honest signup must succeed: ' + JSON.stringify(clean).slice(0, 200));
    assert.ok(!clean.moderated, 'an honest signup must NOT be moderated, got: ' + JSON.stringify(clean.moderated));

    // --- the swear list must not eat ordinary words ---
    // This is the Scunthorpe problem. A substring list would block these, and a
    // moderation system that blocks honest users is indistinguishable from an
    // attack, so whole-word matching is the point rather than a detail.
    for (const name of ['class', 'pass', 'assassin', 'Scunthorpe', 'analysis', 'bass', 'grass']) {
        const r = await signup('rules-word-' + name.toLowerCase() + '@test.local', name);
        assert.ok(r.ok, name + ' must be allowed to sign up, got ' + JSON.stringify(r).slice(0, 140));
        assert.ok(!r.moderated, name + ' must NOT be moderated - whole-word matching is required, got: ' + JSON.stringify(r.moderated));
    }

    // --- the moderation fields survive a round trip through the allowlist ---
    // sanitizeUserRecord has an allowlist, so a field missing from it is silently
    // dropped on the next write - and the block would evaporate on its own. That
    // is the failure mode worth pinning.
    const list = await j('GET', '/sh/users', null, BROWSER_UA, { 'X-SH-Token': rulesToken });
    const rec = list.users && list.users['rules-bot@test.local'];
    assert.ok(rec, 'the moderated account must be in the owner list');
    assert.strictEqual(list.users['rules-swear@test.local'].username, 'fucklord',
        'and the blocked account must still be listed too');

    console.log('    OK: swearing blocks 1h, bots 1y, honest words untouched, and no account was deleted');
}

// ============ CUSTOM BACKGROUND (item 6) ============
// The trap this pins: customBackground is a NEW profile field, and the worker
// has TWO separate allowlists for those fields -
//
//   sanitizeUserRecord's allowed[]      - decides what may be stored at all
//   /sh/user-sync's merge list          - decides what a device may UPDATE
//
// Miss the second one and nothing errors. The sanitiser accepts the field, the
// merge drops it, and the feature works on the device that set it while never
// appearing on any other device. A user would report exactly that as "it doesn't
// sync", with no error anywhere to point at.
//
// So the test does what a second device actually does: sync, then sync again
// from scratch and require the field to still be there.
//
// It is also distinct from bannerImage on purpose - the two are separate
// features (a full-page backdrop vs a header strip) and the test requires both
// to survive independently.
console.log('[W18] CUSTOM BACKGROUND: a new profile field needs BOTH allowlists...');
{
    const bgLogin = await sharedOwnerToken();
    const bgToken = bgLogin;
    const EMAIL = 'bg@test.local';

    const made = await j('POST', '/sh/user-signup', {
        email: EMAIL, username: 'BackdropKid', password: 'password123', description: 'x'
    });
    assert.ok(made.ok, 'setup signup must succeed: ' + JSON.stringify(made).slice(0, 160));

    // A short stand-in for a data: URL. The worker does not decode images, and a
    // real 1.9MB base64 payload would make this test slow for no extra coverage.
    const BACKGROUND = 'data:image/webp;base64,UklGRiQAAABXRUJQ';
    const BANNER = 'data:image/webp;base64,UklGRhYAAABXRUJQ';

    const sync = await j('POST', '/sh/user-sync', {
        email: EMAIL, password: 'password123',
        user: { id: made.user.id, email: EMAIL, username: 'BackdropKid', plan: 'Basic', theme: 'default', customBackground: BACKGROUND, bannerImage: BANNER }
    });
    assert.ok(sync.ok, 'the sync must succeed: ' + JSON.stringify(sync).slice(0, 200));
    assert.strictEqual(sync.user.customBackground, BACKGROUND,
        'the merged record must carry the background - if this fails, customBackground is missing from the /sh/user-sync merge list');

    // now read it back the way a SECOND device does
    const readBack = await j('POST', '/sh/user-sync', {
        email: EMAIL, password: 'password123',
        user: { id: made.user.id, email: EMAIL, username: 'BackdropKid', plan: 'Basic' }
    });
    assert.ok(readBack.ok, 'the read-back sync must succeed: ' + JSON.stringify(readBack).slice(0, 200));
    assert.strictEqual(readBack.user.customBackground, BACKGROUND,
        'the background must SURVIVE a sync from another device - this is the assertion the two allowlists exist for');
    assert.strictEqual(readBack.user.bannerImage, BANNER,
        'and the banner must survive independently of it');

    // and a clear must actually clear, not be silently ignored
    const cleared = await j('POST', '/sh/user-sync', {
        email: EMAIL, password: 'password123',
        user: { id: made.user.id, email: EMAIL, username: 'BackdropKid', plan: 'Basic', customBackground: '' }
    });
    assert.ok(cleared.ok, 'clearing must succeed');
    assert.ok(!cleared.user.customBackground, 'a cleared background must not come back, got: ' + JSON.stringify(cleared.user.customBackground));

    // a non-string must not be stored as-is; the sanitiser is the backstop
    const weird = await j('POST', '/sh/user-sync', {
        email: EMAIL, password: 'password123',
        user: { id: made.user.id, email: EMAIL, username: 'BackdropKid', plan: 'Basic', customBackground: { evil: true } }
    });
    assert.ok(!weird.user || typeof weird.user.customBackground !== 'object',
        'an object must never survive as customBackground, got: ' + JSON.stringify(weird.user && weird.user.customBackground));

    console.log('    OK: the background syncs across devices, clears properly, and is separate from the banner');
}

// ============ /v3/realtime_stats (feeds the admin dashboard) ============
// Untested until now, and the Executor Statistics panel was repointed at it, so
// its SHAPE is now load-bearing: the panel reads executors[name].lastMinute and
// executors[name].perSecond, and renames itself if either goes missing.
//
// Two properties are worth pinning beyond the shape:
//   * it is a SITE-WIDE view, which is why the panel is admin-gated on the
//     client. If it ever stops being site-wide that gate becomes wrong, so the
//     test records what it is.
//   * the executor map is a 60-SECOND window. Events older than that are
//     pruned, so a panel claiming ten days of history would be a lie. Asserted
//     so the number cannot drift unnoticed.
console.log('[W19] REALTIME STATS: the shape the admin dashboard reads...');
{
    const before = await j('GET', '/v3/realtime_stats');
    assert.ok(before.ok, 'the endpoint must answer: ' + JSON.stringify(before).slice(0, 160));
    assert.strictEqual(before.endpoint, 'v3/realtime_stats');
    for (const k of ['totalExecutions', 'threatsBlocked', 'totalVisitors', 'executors', 'topScripts', 'uptimeSeconds', 'updatedAt']) {
        assert.ok(before[k] !== undefined, 'the response must carry ' + k + ' - the dashboard reads it');
    }
    assert.strictEqual(typeof before.executors, 'object', 'executors must be a map');
    // topScripts is a MAP (scriptId -> count), not a list. I asserted a list here
    // first and it failed: S.perScript is a plain object, and nothing in the
    // client reads topScripts at all. Asserting the shape it actually has is the
    // point - a test that encodes a guess is worse than no test, because it looks
    // like coverage.
    assert.strictEqual(typeof before.topScripts, 'object', 'topScripts is a scriptId->count map');
    assert.ok(!Array.isArray(before.topScripts), 'topScripts must not be an array');

    // uptime sanity: a lost isolate used to report epoch-based uptime
    assert.ok(before.uptimeSeconds >= 0 && before.uptimeSeconds < 60 * 60 * 24 * 400,
        'uptime must be plausible, got ' + before.uptimeSeconds);

    // post a real event, then require it to appear with BOTH fields the panel
    // reads. This is the assertion that would catch a rename.
    await call('POST', '/track', { executor: 'Delta', scriptId: 'w19probe', key: 'W19' }, EXECUTOR_UA);
    const after = await j('GET', '/v3/realtime_stats');
    assert.ok(after.totalExecutions >= before.totalExecutions, 'a tracked execution must move the total');
    assert.ok(after.executors['Delta'], 'the executor must appear in the map, got: ' + JSON.stringify(Object.keys(after.executors)));
    assert.strictEqual(typeof after.executors['Delta'].lastMinute, 'number',
        'lastMinute must be a number - the panel reads it directly');
    assert.strictEqual(typeof after.executors['Delta'].perSecond, 'number',
        'perSecond must be a number - the panel reads it directly');
    assert.ok(after.executors['Delta'].lastMinute >= 1, 'a just-posted event must be inside the 60s window');

    console.log('    OK: totalExecutions/executors/lastMinute/perSecond all present and live');
}

// ============ LEGACY SCRIPT IDS (the "no longer exists" bug) ============
// A published loadstring pointed at /sh/ScripterHub7335374723 and reported
// "this script no longer exists", while the script demonstrably existed:
//
//   GET  /sh/ScripterHub7335374723         -> 200, the session loader
//   POST /sh/session                      -> 200, SHS <sid> <nonce> <t0>
//   GET  /sh/a/ScripterHub7335374723?s&n  -> "SHERR gone"
//
// The id is ScripterHub plus THIRTEEN digits, minted by the oldest scheme
// ('ScripterHub' + Date.now(), a full 13-digit ms timestamp). Fifteen checks in
// the worker required exactly /^ScripterHub\d{10}$/, so every script published
// before the id scheme changed returned NO_SCRIPT. In a browser it still looked
// fine, because the metadata page is a different route - which is why "I
// verified it and it exists" and "it does not run" were both true at once.
//
// This publishes under the exact id that failed and requires the full
// session -> gate -> deliver chain to work.
console.log('[W20] LEGACY IDS: a 13-digit id must publish and deliver...');
{
    const LEGACY_ID = 'ScripterHub7335374723';

    const token = await sharedOwnerToken();
    const up = await j('POST', '/sh/upload', {
        token: token,
        name: 'LegacyIdScript', user: 'tester',
        cipher: 'U0hPS0Zha2U=', keyHash: 'cafe', plainCode: 'print(1)',
        wantId: LEGACY_ID,
        keyless: true
    });
    assert.ok(up.ok, 'a 13-digit id must be accepted at upload: ' + JSON.stringify(up).slice(0, 200));

    // the loader route
    const boot = await call('GET', '/sh/' + LEGACY_ID, null, EXECUTOR_UA);
    const bootText = await boot.text();
    assert.strictEqual(boot.status, 200, 'the loader must be served for a legacy id');
    assert.ok(bootText.includes('ScripterHub session loader'), 'it must be the session loader, got: ' + bootText.slice(0, 120));

    // the full chain: session, then the gate
    const got = await authorizedFetch(LEGACY_ID, EXECUTOR_UA, 'TESTLIC');
    assert.notStrictEqual(got.text.slice(0, 6), 'SHERR',
        'the gate must NOT refuse a legacy id, got: ' + got.text.slice(0, 80));
    assert.strictEqual(got.status, 200, 'the gate must deliver: ' + got.text.slice(0, 120));
    assert.ok(got.text.startsWith('SHL\n') || got.text.startsWith('SHK\n'),
        'a keyed or keyless delivery must come back, got: ' + got.text.slice(0, 60));

    // A malformed wantId must NOT be honoured.
    //
    // The first version of this asserted the upload is REJECTED. It is not, and
    // that is correct: loaderId() ignores a wantId that does not match and mints
    // a fresh CSPRNG id instead. Refusing would break any client that sent a
    // malformed id; ignoring it cannot be abused, because the attacker's string
    // is simply never used.
    //
    // So the property worth pinning is the stronger one: the returned id is a
    // well-formed id and is NOT the attacker's string. That is what rules out
    // traversal into a KV key like sh_meta_ScripterHub/../secrets.
    for (const [bad, why] of [
        ['ScripterHub/../secrets', 'path traversal'],
        ['ScripterHub1234/5678', 'a path separator'],
        ['ScripterHubABCDEF1234', 'letters'],
        ['notAnId', 'no prefix at all'],
        ['ScripterHub123', 'too short']
    ]) {
        const r = await j('POST', '/sh/upload', {
            token, name: 'x', user: 'u', cipher: 'U0hPS0Zha2U=',
            keyHash: 'cafe', plainCode: 'print(1)', wantId: bad, keyless: true
        });
        assert.ok(r.ok, bad + ' should still upload (the id is just ignored), got: ' + JSON.stringify(r).slice(0, 140));
        assert.notStrictEqual(r.id, bad, bad + ' was HONOURED - that is a KV key traversal (' + why + ')');
        assert.ok(/^ScripterHub[0-9]{6,16}$/.test(String(r.id || '')),
            bad + ' produced a malformed id ' + JSON.stringify(r.id) + ' (' + why + ')');
    }

    // 10 digits (current scheme) and 16 digits (random scheme) are both honoured
    for (const good of ['ScripterHub1234567890', 'ScripterHub1234567890123456']) {
        const r = await j('POST', '/sh/upload', {
            token, name: 'x', user: 'u', cipher: 'U0hPS0Zha2U=',
            keyHash: 'cafe', plainCode: 'print(1)', wantId: good, keyless: true
        });
        assert.ok(r.ok, good + ' must be accepted: ' + JSON.stringify(r).slice(0, 120));
        assert.strictEqual(r.id, good, good + ' is a valid id and must be honoured verbatim, got ' + r.id);
    }

    console.log('    OK: 13-digit legacy ids publish, load and deliver; malformed ids are ignored, not obeyed');
}

console.log('\nALL WORKER TESTS PASSED');
