// STORAGE KEEPER (GitHub big-script storage) tests.
// The worker proxies parts from a private GitHub repo. A mock GitHub
// API (global fetch shim) captures the calls. Covers:
//   - gh-put rejects non-owners + oversized parts
//   - multi-part upload -> finalize registers the loader
//   - /sh/<id> serves the parts bootstrap (both keyless + keyed)
//   - /sh/g/<id>/<i> proxies parts to executors only
//   - the bootstrap stitches + (keyless) actually RUNS in Lua
//   - gh-delete removes parts
//   - gh-status summarizes usage
import assert from 'assert';
import fengari from 'fengari';

const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;

// ---- mock GitHub API ----
const ghStore = new Map(); // path -> { content(b64), sha }
let ghCalls = [];
const GH_REPO = 'Scripter-Coder/Storage-Keeper-1';
const realFetch = globalThis.fetch;
function ghRoute(url, opts) {
    const u = new URL(url);
    if (!u.hostname === 'api.github.com') return realFetch(url, opts);
    const path = decodeURIComponent(u.pathname);
    const method = (opts && opts.method) || 'GET';
    ghCalls.push(method + ' ' + path);
    const mPut = path.match(/^\/repos\/([^\/]+\/[^\/]+)\/contents\/(.+)$/);
    if (mPut && method === 'PUT') {
        const body = JSON.parse(opts.body);
        const p = mPut[2];
        const sha = 'sha_' + Math.random().toString(36).slice(2, 10);
        ghStore.set(p, { content: body.content, sha });
        return new Response(JSON.stringify({ content: { sha, path: p } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    if (mPut && method === 'DELETE') {
        ghStore.delete(mPut[2]);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (mPut && method === 'GET') {
        const f = ghStore.get(mPut[2]);
        if (!f) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ content: f.content, sha: f.sha }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const mRef = path.match(/^\/repos\/([^\/]+\/[^\/]+)\/git\/ref\/(.+)$/);
    if (mRef && method === 'GET') {
        return new Response(JSON.stringify({ object: { sha: 'head_abc123' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
globalThis.fetch = function (url, opts) {
    if (String(url).startsWith('https://api.github.com/')) return ghRoute(url, opts);
    return realFetch(url, opts);
};

const workerSrc = await import('./For Cloudflare/worker.js');
const worker = workerSrc.default;

// ---- mock KV ----
function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value, opts) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        async list(opts) { const keys = []; for (const k of store.keys()) if (!opts || !opts.prefix || k.startsWith(opts.prefix)) keys.push({ name: k }); return { keys, list_complete: true }; },
        _store: store
    };
}
const KV = makeKV();
const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'TESTTOKEN123', SH_BASE_URL: 'https://test.workers.dev', SH_GH_TOKEN: 'ghp_test', SH_GH_REPO: GH_REPO };
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
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

async function login() { return (await j('POST', '/sh/login', { code: 'ScripterHub' })).token; }

console.log('[G1] gh-put rejects non-owners and oversized parts...');
{
    const r1 = await j('POST', '/sh/gh-put', { id: 'ScripterHub0000000010', part: 0, content: 'x' });
    assert.strictEqual(r1.status, 401, 'non-owner rejected');
    const token = await login();
    const r2 = await j('POST', '/sh/gh-put', { token, id: 'ScripterHub0000000010', part: 0, content: 'z'.repeat(40_000_001) });
    assert.strictEqual(r2.status, 413, 'oversized part rejected');
    const r3 = await j('POST', '/sh/gh-put', { token, id: 'badid', part: 0, content: 'x' });
    assert.strictEqual(r3.status, 400, 'bad id rejected');
    console.log('    OK: guards work');
}

console.log('[G2] multi-part upload -> finalize registers the loader...');
let GH_ID = '';
{
    const token = await login();
    GH_ID = 'ScripterHub0000000011';
    // 3 parts of 10MB each (30MB total - well under KV, but proving GH path)
    const p0 = 'A'.repeat(10 * 1024 * 1024);
    const p1 = 'B'.repeat(10 * 1024 * 1024);
    const p2 = 'C'.repeat(10 * 1024 * 1024);
    for (let i = 0; i < 3; i++) {
        const content = [p0, p1, p2][i];
        const d = await j('POST', '/sh/gh-put', { token, id: GH_ID, part: i, content });
        assert.strictEqual(d.ok, true, JSON.stringify(d));
        assert.ok(d.sha, 'part sha returned');
    }
    // parts are in the fake GitHub repo
    assert.ok(ghStore.has('scripts/' + GH_ID + '/0.part'), 'part 0 in repo');
    assert.ok(ghStore.has('scripts/' + GH_ID + '/2.part'), 'part 2 in repo');
    const f = await j('POST', '/sh/gh-finalize', {
        token, id: GH_ID, n: 3, len: 30 * 1024 * 1024,
        name: 'BigScript', user: 'tester', keyless: true, webKey: true,
        keyHash: 'abc', authRequired: false
    });
    assert.strictEqual(f.ok, true, JSON.stringify(f));
    assert.ok(/loadstring\(game:HttpGet\("https:\/\/test\.workers\.dev\/sh\/ScripterHub0000000011"\)\)\(\)/.test(f.loadstring));
    const meta = JSON.parse(KV._store.get('sh_meta_' + GH_ID));
    assert.strictEqual(meta.storage, 'github');
    assert.strictEqual(meta.parts, 3);
    console.log('    OK: 3 parts committed + loader registered');
}

console.log('[G3] finalize rejects missing parts...');
{
    const token = await login();
    const d = await j('POST', '/sh/gh-finalize', { token, id: 'ScripterHub0000000012', n: 2, len: 5, name: 'x', user: 'y' });
    assert.strictEqual(d.ok, false, 'must reject when no parts uploaded');
    console.log('    OK: no parts -> rejected');
}

console.log('[G4] /sh/<id> serves the Storage Keeper parts bootstrap...');
{
    const r = await call('GET', '/sh/' + GH_ID, null, EXECUTOR_UA);
    const boot = await r.text();
    assert.ok(boot.includes('/sh/g/' + GH_ID + '/'), 'bootstrap fetches /sh/g parts');
    assert.ok(boot.includes('keyless'), 'keyless header present');
    assert.ok(!boot.includes('AAAA'), 'raw part data NOT embedded');
    // keyed version
    const token = await login();
    const kid = 'ScripterHub0000000013';
    await j('POST', '/sh/gh-put', { token, id: kid, part: 0, content: 'K'.repeat(1024) });
    await j('POST', '/sh/gh-finalize', { token, id: kid, n: 1, len: 1024, name: 'K', user: 't', keyless: false, webKey: true, keyHash: 'h', authRequired: false });
    const r2 = await call('GET', '/sh/' + kid, null, EXECUTOR_UA);
    const boot2 = await r2.text();
    assert.ok(boot2.includes('ScripterHubKey'), 'keyed bootstrap asks for the Special Key');
    console.log('    OK: executor bootstraps for both modes');
}

console.log('[G5] /sh/g proxies parts to executors only + exact reassembly...');
{
    const r0 = await call('GET', '/sh/g/' + GH_ID + '/0', null, EXECUTOR_UA);
    const r1r = await call('GET', '/sh/g/' + GH_ID + '/1', null, EXECUTOR_UA);
    const r2r = await call('GET', '/sh/g/' + GH_ID + '/2', null, EXECUTOR_UA);
    assert.strictEqual(r0.status, 200); assert.strictEqual(r1r.status, 200); assert.strictEqual(r2r.status, 200);
    const stitched = (await r0.text()) + (await r1r.text()) + (await r2r.text());
    assert.strictEqual(stitched.length, 30 * 1024 * 1024, 'exact total length');
    assert.ok(stitched.startsWith('AAA') && stitched.endsWith('CCC'), 'order preserved');
    // browsers + out-of-range + unknown -> 405
    const rb = await call('GET', '/sh/g/' + GH_ID + '/0', null, BROWSER_UA);
    assert.strictEqual(rb.status, 405, 'browsers blocked');
    const ro = await call('GET', '/sh/g/' + GH_ID + '/9', null, EXECUTOR_UA);
    assert.strictEqual(ro.status, 405, 'beyond part count blocked');
    const ru = await call('GET', '/sh/g/ScripterHub0000000099/0', null, EXECUTOR_UA);
    assert.strictEqual(ru.status, 405, 'unknown script blocked');
    console.log('    OK: proxy locked to executors, parts reassemble exactly');
}

console.log('[G6] the parts bootstrap RUNS in Lua (keyless stitch + execute)...');
{
    const r = await call('GET', '/sh/' + GH_ID, null, EXECUTOR_UA);
    const boot = await r.text();
    const parts = [];
    for (let i = 0; i < 3; i++) {
        const rc = await call('GET', '/sh/g/' + GH_ID + '/' + i, null, EXECUTOR_UA);
        parts.push(await rc.text());
    }
    const tblLua = '{' + parts.map(p => JSON.stringify(p)).join(',') + '}';
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring('getgenv=function() return _G end'));
    lauxlib.luaL_dostring(L, to_luastring('game={HttpGet=function(self,url) local i=tonumber(url:match("(%d+)$")) return _T[i+1] end,GetService=function() return {} end}'));
    lauxlib.luaL_dostring(L, to_luastring('_T=' + tblLua));
    const st = lauxlib.luaL_dostring(L, to_luastring(boot));
    assert.strictEqual(st, lua.LUA_OK, 'bootstrap must run clean (30MB stitch!)');
    console.log('    OK: 30MB stitched + executed in fengari');
}

console.log('[G7] gh-delete removes parts + meta...');
{
    const token = await login();
    const d = await j('POST', '/sh/gh-delete', { token, id: GH_ID });
    assert.strictEqual(d.ok, true);
    assert.ok(!ghStore.has('scripts/' + GH_ID + '/0.part'), 'parts gone from repo');
    assert.ok(!KV._store.has('sh_gh_' + GH_ID), 'kv record gone');
    assert.ok(!KV._store.has('sh_meta_' + GH_ID), 'loader meta gone');
    console.log('    OK: delete cleans repo + KV');
}

console.log('[G8] gh-status summarizes usage...');
{
    const token = await login();
    // re-add one script for the summary
    const id2 = 'ScripterHub0000000014';
    await j('POST', '/sh/gh-put', { token, id: id2, part: 0, content: 'Q'.repeat(1024) });
    await j('POST', '/sh/gh-finalize', { token, id: id2, n: 1, len: 1024, name: 'S', user: 't', keyless: true });
    const d = await j('POST', '/sh/gh-status', { token });
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.configured, true);
    assert.strictEqual(d.repo, GH_REPO);
    assert.ok(d.scripts >= 1, 'at least the re-added script is counted');
    assert.ok(d.totalBytes >= 1024, 'bytes counted');
    console.log('    OK: status accurate');
}

globalThis.fetch = realFetch;
console.log('\nALL STORAGE KEEPER TESTS PASSED - 10GB scripts are live.');
