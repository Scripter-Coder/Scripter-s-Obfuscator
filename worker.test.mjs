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

// Seed a license through the product's own endpoint (which mirrors it into the
// table the gate reads), so these tests never bypass the sync path.
async function seedLicense(key, rec) {
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    return j('POST', '/sh/licenses', {
        token: login.token,
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
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const d = await j('POST', '/sh/upload', {
        token: login.token,
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
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const d = await j('POST', '/sh/upload', { token: login.token, name: 'OldFree', user: 't', keyless: true, plainCode: '-- legacy blob' });
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
    const owner = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    assert.strictEqual(owner.ok, true, 'owner login must succeed: ' + JSON.stringify(owner));
    let d = await j('POST', '/sh/users', { token: owner.token, email: USER_EMAIL, user: { plan: 'Pro', stats: { projects: { used: 0, max: 500 }, keys: { used: 0, max: 100000 }, scripts: { used: 0, max: 300 }, fileSize: { used: 0, max: 1024 } } } });
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
    const owner = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    assert.strictEqual(owner.ok, true, 'owner login must succeed: ' + JSON.stringify(owner));
    // Prefer the header: a token in a query string lands in access logs.
    const d = await j('GET', '/sh/users', null, BROWSER_UA, { 'X-SH-Token': owner.token });
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
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const t0 = Date.now();
    const padded = [12, 34, 56, 78, 90, 123, 45, 67];
    const up = await j('POST', '/sh/upload', {
        token: login.token,
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
    const aegisLogin = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const ownerToken = aegisLogin.token;
    assert.ok(ownerToken && ownerToken.length > 10, 'owner login must issue a token for the proxy tests');

    // 1. no token -> 401. Reaching this response at all means isOwnerRequest
    //    resolved; a ReferenceError would have surfaced as a 500.
    const anon = await j('POST', '/sh/aegis', { source: 'print(1)' });
    assert.strictEqual(anon.status, 401, '/sh/aegis must refuse an unauthenticated caller, got ' + anon.status);

    // 2. owner token, but the binding is absent -> a clear 501, not a crash.
    const noKey = await j('POST', '/sh/aegis', { source: 'print(1)', token: ownerToken });
    assert.strictEqual(noKey.status, 501, 'a missing AEGIS_API_KEY must say so, got ' + noKey.status);
    assert.ok(/AEGIS_API_KEY/.test(noKey.error || ''), 'the 501 must name the binding: ' + noKey.error);

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

console.log('\nALL WORKER TESTS PASSED');
