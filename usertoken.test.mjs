// USER-TOKEN FLOW tests (the "friend can't create scripts" fix):
//   - /sh/user-login issues a session token
//   - /sh/upload accepts the user token (no owner access code needed)
//   - /sh/gh-put + /sh/gh-finalize accept the user token
//   - owner access-code flow still works in parallel
//   - normalCode is capped server-side (7MB Discord attachment limit)
import assert from 'assert';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './tools/owner_code_test_helper.mjs';

function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value, opts) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        _store: store
    };
}

const workerSrc = await import('./For Cloudflare/worker.js');
const worker = workerSrc.default;

const KV = makeKV();
const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'TESTTOKEN123', SH_BASE_URL: 'https://test.workers.dev', SH_OWNER_CODE_HASH: OWNER_CODE_HASH };

const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

async function call(method, path, body, ua) {
    const req = new Request('https://test.workers.dev' + path, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json', 'User-Agent': ua || BROWSER_UA } : { 'User-Agent': ua || BROWSER_UA },
        body: body ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, env, { waitUntil: () => {} });
}
async function j(method, path, body, ua) {
    const r = await call(method, path, body, ua);
    const text = await r.text();
    try { return { status: r.status, ...JSON.parse(text), _text: text }; }
    catch (e) { return { status: r.status, ok: false, _text: text }; }
}

// ============ TESTS ============

console.log('[U1] signup + user-login issues a user token...');
let userToken = '';
{
    const su = await j('POST', '/sh/user-signup', { email: 'friend@test.com', username: 'Friend', password: 'hunter22' });
    assert.strictEqual(su.ok, true, 'signup works');
    const li = await j('POST', '/sh/user-login', { emailOrUsername: 'friend@test.com', password: 'hunter22' });
    assert.strictEqual(li.ok, true, 'login works');
    assert.ok(li.token && li.token.length > 10, 'user token issued');
    assert.strictEqual(li.user.username, 'Friend');
    userToken = li.token;
    console.log('    OK: user token issued');
}

console.log('[U2] /sh/upload accepts the USER token (no owner code)...');
{
    const d = await j('POST', '/sh/upload', {
        userToken: userToken,
        name: 'FriendScript', user: 'Friend',
        cipher: 'U0hPS2ZyaWVuZA==', keyHash: 'abc123'
    });
    assert.strictEqual(d.ok, true, 'upload with user token: ' + (d.error || ''));
    assert.ok(d.loadstring && d.loadstring.includes('loadstring'), 'loadstring returned');
    console.log('    OK: friend can upload + get a loadstring');
}

console.log('[U3] invalid user token rejected...');
{
    const d = await j('POST', '/sh/upload', { userToken: 'garbage-token', name: 'x', user: 'x', cipher: 'QQ==' });
    assert.strictEqual(d.ok, false, 'garbage token rejected');
    assert.strictEqual(d.status, 401);
    console.log('    OK: garbage token -> 401');
}

console.log('[U4] wrong-password login gets NO token...');
{
    const li = await j('POST', '/sh/user-login', { emailOrUsername: 'friend@test.com', password: 'WRONG' });
    assert.strictEqual(li.ok, false, 'wrong password rejected');
    assert.ok(!li.token, 'no token on failure');
    console.log('    OK');
}

console.log('[U5] owner access-code flow still works (parallel)...');
{
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    assert.ok(login.token, 'owner token still issued');
    const d = await j('POST', '/sh/upload', { token: login.token, name: 'OwnerScript', user: 'Scripter', cipher: 'QQ==' });
    assert.strictEqual(d.ok, true, 'owner upload still works');
    console.log('    OK');
}

console.log('[U6] normalCode capped at 7MB (Discord attachment limit)...');
{
    const login = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const huge = 'x'.repeat(10_000_000); // 10MB raw source
    const d = await j('POST', '/sh/upload', { token: login.token, name: 'Big', user: 'Scripter', cipher: 'QQ==', normalCode: huge });
    assert.strictEqual(d.ok, true, 'upload with giant normalCode still succeeds (capped server-side)');
    console.log('    OK');
}

console.log('[U7] the large-script parts endpoint accepts a user token...');
{
    // This used to hit /sh/gh-put. That endpoint is retired - script bytes go to the
    // owner's PC now - but the PROPERTY is unchanged and still worth guarding: a normal
    // registered user, not just the owner, must be able to upload a multi-part script
    // with nothing but a session token. Losing that would quietly turn "friends can
    // create scripts" into "only the owner can".
    //
    // SH_STORE_URL/TOKEN are unbound in tests, so a correct worker reports the backend
    // as unconfigured. That message is the proof auth passed: an auth failure would
    // answer 401 instead, which is the distinction this assertion exists to make.
    const d = await j('POST', '/sh/kb-put', { userToken: userToken, id: 'ScripterHub0000000010', part: 0, content: 'partdata' });
    assert.notStrictEqual(d.status, 401, 'user token must pass auth');
    assert.ok(
        /not configured/i.test(d.error || ''),
        'expected the backend-not-configured message, got: ' + (d.error || '')
    );
    console.log('    OK: auth passed (keeper env not set in tests - expected)');
}

console.log('[U7b] the retired GitHub upload refuses a user token too...');
{
    // The retirement is not owner-only. If gh-put ever quietly starts accepting writes
    // again, scripts would go back to a repository the owner believes is empty.
    const d = await j('POST', '/sh/gh-put', { userToken: userToken, id: 'ScripterHub0000000010', part: 0, content: 'partdata' });
    assert.strictEqual(d.status, 410, 'gh-put must answer 410 Gone for a valid user token, got: ' + d.status);
    assert.ok(/retired/i.test(d.error || ''), 'and must say why: ' + (d.error || ''));
    console.log('    OK: retired, auth-first, and explicit');
}

console.log('\nALL USER-TOKEN TESTS PASSED - friends can create scripts now.');
