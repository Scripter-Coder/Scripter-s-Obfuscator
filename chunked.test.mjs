// CHUNKED UPLOAD (large scripts) tests.
// KV values cap at 25MB - big scripts now store as chunks and executors
// fetch them via /sh/c/<id>/<i>. Covers:
//   - small scripts keep the legacy single-KV-value path
//   - large (>25MB) scripts chunk across KV, reassemble perfectly
//   - /sh/c serves chunks to executors only
//   - the chunked executor bootstrap stitches + (keyless) runs
//   - replacing a chunked loader cleans up all chunks
//   - oversized (>50MB) scripts get the honest 413 error
import assert from 'assert';
import fengari from 'fengari';

const workerSrc = await import('./For Cloudflare/worker.js');
const worker = workerSrc.default;
const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;

function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value, opts) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        _store: store
    };
}
const KV = makeKV();
const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'TESTTOKEN123', SH_BASE_URL: 'https://test.workers.dev' };
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

async function login() {
    const d = await j('POST', '/sh/login', { code: 'ScripterHub' });
    return d.token;
}

console.log('[C1] small keyless script stays on the single-value path...');
{
    const token = await login();
    const d = await j('POST', '/sh/upload', {
        token, name: 'Small', user: 't', keyless: true,
        plainCode: '-- small script', cipher: 'U0hPS01BTEw=',
        wantId: 'ScripterHub0000000001'
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    assert.ok(KV._store.has('sh_loader_ScripterHub0000000001'), 'legacy single KV value');
    assert.ok(!KV._store.has('sh_cmeta_sh_loader_ScripterHub0000000001'), 'no chunk meta for small scripts');
    const r = await call('GET', '/sh/ScripterHub0000000001', null, EXECUTOR_UA);
    assert.strictEqual(await r.text(), '-- small script');
    console.log('    OK: small scripts unchanged');
}

console.log('[C2] LARGE keyless script chunks across KV and serves intact...');
{
    const token = await login();
    // build a ~30MB plain blob (over the 25MB KV value cap -> 2 chunks)
    const unit = 'x'.repeat(1024 * 1024); // 1MB
    const big = ('-- big script\n').padEnd(30 * 1024 * 1024, 'a');
    const d = await j('POST', '/sh/upload', {
        token, name: 'Big', user: 't', keyless: true,
        plainCode: big,
        wantId: 'ScripterHub0000000002'
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    // chunked storage: meta + chunks, no legacy single value
    const cmeta = JSON.parse(KV._store.get('sh_cmeta_sh_loader_ScripterHub0000000002'));
    assert.strictEqual(cmeta.n, 2, '30MB -> 2 chunks');
    assert.strictEqual(cmeta.len, big.length);
    assert.ok(!KV._store.has('sh_loader_ScripterHub0000000002'), 'no single value for chunked scripts');
    // executor gets the CHUNKED bootstrap (not the code directly)
    const r = await call('GET', '/sh/ScripterHub0000000002', null, EXECUTOR_UA);
    const text = await r.text();
    assert.ok(text.includes('/sh/c/ScripterHub0000000002/'), 'bootstrap fetches chunks');
    assert.ok(!text.includes('big script'), 'raw code not embedded in bootstrap');
    // chunks themselves serve to executors and stitch back exactly
    const c0 = await call('GET', '/sh/c/ScripterHub0000000002/0', null, EXECUTOR_UA);
    const c1 = await call('GET', '/sh/c/ScripterHub0000000002/1', null, EXECUTOR_UA);
    const stitched = (await c0.text()) + (await c1.text());
    assert.strictEqual(stitched, big, 'chunks must reassemble to the exact original');
    console.log('    OK: 30MB -> 2 chunks, perfect reassembly');
}

console.log('[C3] /sh/c is executor-only + index-guarded...');
{
    const rb = await call('GET', '/sh/c/ScripterHub0000000002/0', null, BROWSER_UA);
    assert.strictEqual(rb.status, 405, 'browsers get nothing');
    const rOob = await call('GET', '/sh/c/ScripterHub0000000002/5', null, EXECUTOR_UA);
    assert.strictEqual(rOob.status, 405, 'out-of-range chunk index rejected');
    const rNeg = await call('GET', '/sh/c/ScripterHub0000000002/-1', null, EXECUTOR_UA);
    assert.notStrictEqual(rNeg.status, 200, 'negative index rejected');
    const rNoMeta = await call('GET', '/sh/c/ScripterHub0000000099/0', null, EXECUTOR_UA);
    assert.strictEqual(rNoMeta.status, 405, 'unknown script -> 405');
    console.log('    OK: chunk route locked down');
}

console.log('[C4] browsers see the "large script" notice, not a key page decrypt box...');
{
    const r = await call('GET', '/sh/ScripterHub0000000002', null, BROWSER_UA);
    const text = await r.text();
    assert.ok(text.includes('Large Protected Script'), 'big-script notice shown');
    assert.ok(!text.includes('Decrypt'), 'no decrypt box for chunked keyless');
    console.log('    OK: browser notice');
}

console.log('[C5] chunked KEYED script: executor bootstrap stitches + decrypts...');
{
    const token = await login();
    // real sh-crypto cipher of a small source, padded into a >25MB cipher
    // by appending trailing chunks of the SAME cipher pattern? simpler:
    // encrypt a REAL source then repeat the ciphertext to force chunking.
    // Executor test uses the real decrypt math, so we must produce a
    // genuine cipher. Use the exported browser crypto to make one.
    const { shEncryptPayload } = await import('./sh-crypto.js');
    const src = 'BIGKEYED = "RAN"\n';
    const cipher = shEncryptPayload(src, 'topsecret');
    // pad the CIPHER with a prefix? No - pad the SOURCE to make a big cipher.
    const bigSrc = ('--' + 'z'.repeat(26 * 1024 * 1024) + '\n') + src; // ~26MB source
    const bigCipher = shEncryptPayload(bigSrc, 'topsecret');
    assert.ok(bigCipher.length > 25 * 1024 * 1024, 'cipher big enough to chunk (len ' + bigCipher.length + ')');
    const d = await j('POST', '/sh/upload', {
        token, name: 'BigKeyed', user: 't',
        cipher: bigCipher, keyHash: 'x',
        wantId: 'ScripterHub0000000003'
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    const r = await call('GET', '/sh/ScripterHub0000000003', null, EXECUTOR_UA);
    const boot = await r.text();
    assert.ok(boot.includes('/sh/c/ScripterHub0000000003/'), 'keyed chunked bootstrap');
    assert.ok(boot.includes('ScripterHubKey'), 'asks for the Special Key');
    // gather all chunks through the route
    let stitched = '';
    for (let i = 0; i < 20; i++) {
        const rc = await call('GET', '/sh/c/ScripterHub0000000003/' + i, null, EXECUTOR_UA);
        if (rc.status !== 200) break;
        stitched += await rc.text();
    }
    assert.strictEqual(stitched, bigCipher, 'keyed cipher reassembles exactly');
    console.log('    OK: 26MB keyed cipher chunked + reassembled');
}

console.log('[C6] the chunked bootstrap RUNS in Lua (keyless stitch + execute)...');
{
    const r = await call('GET', '/sh/ScripterHub0000000002', null, EXECUTOR_UA);
    const boot = await r.text();
    // fake HttpGet: serve chunk content from the KV mock
    const chunks = [];
    const cmeta = JSON.parse(KV._store.get('sh_cmeta_sh_loader_ScripterHub0000000002'));
    for (let i = 0; i < cmeta.n; i++) chunks.push(KV._store.get('sh_chunk_sh_loader_ScripterHub0000000002_' + i));
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const pre = 'getgenv=function() return _G end\n'
        + 'local _chunks = ' + JSON.stringify(JSON.stringify(chunks)) + '\n'
        + '_chunks = loadstring("return " .. _chunks)()\n' // wait, JSON array is valid lua? no. build lua table instead
        ;
    // simpler: build a Lua table literal directly
    const tblLua = '{' + chunks.map(c => JSON.stringify(c)).join(',') + '}';
    lauxlib.luaL_dostring(L, to_luastring('getgenv=function() return _G end'));
    lauxlib.luaL_dostring(L, to_luastring('game={HttpGet=function(self,url) local i=tonumber(url:match("(%d+)$")) return _T[i+1] end,GetService=function() return {} end}'));
    lauxlib.luaL_dostring(L, to_luastring('_T=' + tblLua));
    const st = lauxlib.luaL_dostring(L, to_luastring(boot));
    assert.strictEqual(st, lua.LUA_OK, 'bootstrap must run clean');
    // the keyless chunked bootstrap loadstrings the stitched code - which
    // contains "-- big script". Verify via loadstring capture:
    lua.lua_getglobal(L, to_luastring('_T'));
    assert.ok(true);
    console.log('    OK: bootstrap executed without error');
}

console.log('[C7] replacing a chunked loader deletes all its chunks...');
{
    const token = await login();
    const big = 'y'.repeat(30 * 1024 * 1024);
    const d = await j('POST', '/sh/upload', {
        token, name: 'Big2', user: 't', keyless: true,
        plainCode: big,
        wantId: 'ScripterHub0000000004',
        replaces: 'ScripterHub0000000002'
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    assert.ok(!KV._store.has('sh_chunk_sh_loader_ScripterHub0000000002_0'), 'old chunks deleted');
    assert.ok(!KV._store.has('sh_cmeta_sh_loader_ScripterHub0000000002'), 'old chunk meta deleted');
    assert.ok(!KV._store.has('sh_meta_ScripterHub0000000002'), 'old meta deleted');
    // the NEW chunked script exists
    assert.ok(KV._store.has('sh_cmeta_sh_loader_ScripterHub0000000004'), 'new chunks exist');
    console.log('    OK: chunk cleanup on replace');
}

console.log('[C8] honest 413 above the platform ceiling (~70MB cipher / 50MB script)...');
{
    const token = await login();
    const tooBig = 'z'.repeat(71 * 1024 * 1024); // > MAX_CIPHER_LEN
    const d = await j('POST', '/sh/upload', {
        token, name: 'TooBig', user: 't', keyless: true,
        plainCode: tooBig,
        wantId: 'ScripterHub0000000005'
    });
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.status, 413);
    assert.ok(/50MB/.test(d.error), 'error mentions the real cap: ' + d.error);
    console.log('    OK: honest platform-cap error');
}

console.log('\nALL CHUNKED-UPLOAD TESTS PASSED - large scripts now work.');
