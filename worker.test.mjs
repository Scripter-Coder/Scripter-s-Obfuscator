// Worker test harness: exercises the Cloudflare worker logic in Node with a
// mocked KV binding. Covers the keyless webKey flow (Issue 1), plan changes
// via ownerProof (Issue 3), user sync, and the browser/executor UA split.
import assert from 'assert';
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

// ---- import the worker (it reads globals at import time; atob/btoa/crypto/
// Response/Request/URL/FormData all exist in Node 18+) ----
const workerSrc = await import('./For Cloudflare/worker.js');
const worker = workerSrc.default;

const KV = makeKV();
const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'TESTTOKEN123', SH_BASE_URL: 'https://test.workers.dev', SH_OWNER_CODE_HASH: OWNER_CODE_HASH };

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
console.log('[W1] health endpoint...');
{
    const d = await j('GET', '/sh/health');
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.loaders, true);
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
    assert.ok(/loadstring\(game:HttpGet\("https:\/\/test\.workers\.dev\/sh\/ScripterHub\d{10}"\)\)\(\)/.test(d.loadstring));
    KEYLESS_ID = d.id;
    const meta = JSON.parse(KV._store.get('sh_meta_' + KEYLESS_ID));
    assert.strictEqual(meta.keyless, true);
    assert.strictEqual(meta.webKey, true);
    assert.strictEqual(KV._store.get('sh_web_' + KEYLESS_ID), 'U0hPS0Zha2VDaXBoZXI=');
    assert.strictEqual(KV._store.get('sh_loader_' + KEYLESS_ID), '-- obfuscated executor blob (fake)');
    console.log('    OK: executor blob + encrypted web view stored');
}

console.log('[W4] keyless loader: EXECUTOR UA gets the plain blob (no key)...');
{
    const r = await call('GET', '/sh/' + KEYLESS_ID, null, EXECUTOR_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(text, '-- obfuscated executor blob (fake)');
    console.log('    OK: executor gets the code directly');
}

console.log('[W5] keyless loader: BROWSER gets the KEY PAGE (webKey cipher)...');
{
    const r = await call('GET', '/sh/' + KEYLESS_ID, null, BROWSER_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(text.includes('Special Key Required'), 'browser must get the key page');
    assert.ok(text.includes('U0hPS0Zha2VDaXBoZXI='), 'key page embeds the web cipher');
    assert.ok(!text.includes('-- obfuscated executor blob'), 'browser must NOT see the executor blob');
    console.log('    OK: browser needs the Special Key (Issue 1 fixed)');
}

console.log('[W6] keyless legacy (plainCode only, no cipher): browser -> Method Not Allowed...');
{
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const d = await j('POST', '/sh/upload', { token: login.token, name: 'OldFree', user: 't', keyless: true, plainCode: '-- legacy blob' });
    const r = await call('GET', '/sh/' + d.id, null, BROWSER_UA);
    assert.strictEqual(r.status, 405);
    console.log('    OK: legacy keyless stays hidden from browsers');
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

console.log('[W13] SPLIT-KEY: upload stores the padded key, /sh/k serves it (executor only)...');
{
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const t0 = Date.now();
    const padded = [12, 34, 56, 78, 90, 123, 45, 67];
    let up;
    try {
        up = await j('POST', '/sh/upload', {
            token: login.token,
            name: 'SplitTest', user: 'tester',
            keyless: true, plainCode: '-- obf blob',
            cipher: 'U0hPS0Zha2U=', keyHash: 'cafe',
            wantId: 'ScripterHub0000000042',
            splitKey: { paddedKey: padded, t0: t0, chk: 777 }
        });
    } catch (e) { throw e; }
    assert.strictEqual(up.ok, true, JSON.stringify(up));
    assert.strictEqual(up.id, 'ScripterHub0000000042', 'worker must honor the pre-generated wantId');
    // executor gets the key with the right t0
    const r = await call('GET', '/sh/k/ScripterHub0000000042?t=' + t0, null, EXECUTOR_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(text.startsWith('SHK ' + t0 + ' 777 '), 'key response format');
    assert.ok(text.includes(padded.join(' ')), 'padded bytes present');
    // browser gets NOTHING
    const rb = await call('GET', '/sh/k/ScripterHub0000000042?t=' + t0, null, BROWSER_UA);
    assert.strictEqual(rb.status, 405, 'browsers must not fetch split keys');
    // wrong t0 gets NOTHING (replay protection)
    const rw = await call('GET', '/sh/k/ScripterHub0000000042?t=' + (t0 + 1), null, EXECUTOR_UA);
    assert.strictEqual(rw.status, 405, 'wrong t0 must be rejected');
    console.log('    OK: split key served to executors only, exact-t0 enforced');
}

console.log('[W14] SPLIT-KEY: loader route + key route work together (free script)...');
{
    // executor fetches the script blob then the key
    const r = await call('GET', '/sh/ScripterHub0000000042', null, EXECUTOR_UA);
    const text = await r.text();
    assert.strictEqual(text, '-- obf blob');
    console.log('    OK: free script blob still served to executors');
}

console.log('\nALL WORKER TESTS PASSED');
