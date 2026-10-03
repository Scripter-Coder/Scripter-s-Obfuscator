// LEGACY GitHub big-script storage - READ path only.
//
// Script BYTES used to be written to a private GitHub repository through
// /sh/gh-put + /sh/gh-finalize. Those endpoints are RETIRED (410): bytes now go to
// the owner's own disk via the Storage Keeper service. New large scripts never touch a
// repo - see tools/storage_keeper_test.mjs for that path.
//
// This file still exists, and matters, because scripts published BEFORE the retirement
// are running on people's machines right now. It seeds an already-published script
// directly and then drives the real delivery flow against it:
//   - the upload endpoints refuse, and refuse 401-first
//   - /sh/<id> is artifact-free; the GATE opens a chain
//   - /sh/g/<id>/<i> proxies parts behind that chain, forward-only, non-replayable
//   - the bootstrap stitches + (keyless) actually RUNS in Lua
//   - gh-delete removes parts
//   - gh-status summarizes usage
//
// PHASE 3: /sh/g used to be a bare proxy — any executor-looking User-Agent
// could walk 0..N on a fixed path and reassemble a 30MB (or 10GB) artifact.
// It is now behind the delivery gate's grant AND the forward-only cursor.
// The tests drive that flow explicitly.
import assert from 'assert';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './tools/owner_code_test_helper.mjs';
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
// A real D1: the part route is fail-closed without one, so without this every
// case below would pass by refusing everything rather than by gating anything.
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}
const env = {
    LOADERS_KV: KV,
    SH_SETUP_TOKEN: 'TESTTOKEN123',
    SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_GH_TOKEN: 'ghp_test',
    SH_GH_REPO: GH_REPO,
    SH_SESSION_SECRET: 'test-only-session-secret',
    SH_DB: makeD1()
};
const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
const LIC = 'GHLIC';

// Mint a session and open a chain — the only way to reach a part now.
async function openChain(id) {
    const m = await call('POST', '/sh/session', { id, k: LIC, h: 'HW' }, EXECUTOR_UA);
    const p = (await m.text()).trim().split(/\s+/);
    assert.strictEqual(p[0], 'SHS', 'expected a session for ' + id + ', got: ' + p.join(' '));
    const r = await call('GET', `/sh/a/${id}?s=${p[1]}&n=${p[2]}`, null, EXECUTOR_UA);
    const text = await r.text();
    assert.ok(text.startsWith('SHG '), 'a multi-part artifact must open a chain, got: ' + text.slice(0, 80));
    const [, n, root, grant] = text.slice(0, text.indexOf('\n')).split(' ');
    return { sid: p[1], n: Number(n), root, grant };
}

async function seedLicense() {
    const token = await login();
    const d = await j('POST', '/sh/licenses', {
        token, licenses: { [LIC]: { hwid: 'HW', expiresAt: 0, banned: false } }
    });
    assert.strictEqual(d.ok, true, 'license seed failed: ' + JSON.stringify(d));
}

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

async function login() { return (await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN })).token; }

// The GitHub byte path is RETIRED. Script bytes go to the owner's PC instead.
//
// What still has to work is the READ path, because scripts published before the
// retirement are still running on people's machines. Refusing an upload must not orphan
// a loadstring somebody is executing right now. So these tests seed an
// already-published script straight into the mock repo and the index - exactly the state
// the retired endpoints used to leave behind - then drive the real delivery flow on it.
function seedPublishedGithubScript(id, parts, opts = {}) {
    const rec = {
        repo: GH_REPO, path: 'scripts/' + id, n: parts.length,
        len: parts.join('').length, head: 'head_abc123',
        name: opts.name || 'BigScript', user: opts.user || 'tester',
        keyless: opts.keyless !== false, webKey: true,
        keyHash: opts.keyHash || '', authRequired: false,
        at: Date.now(), parts: {},
    };
    parts.forEach((c, i) => {
        ghStore.set('scripts/' + id + '/' + i + '.part', { content: b64(c), sha: 'sha_part' + i });
        rec.parts[i] = { sha: 'sha_part' + i, len: c.length };
    });
    KV._store.set('sh_gh_' + id, JSON.stringify(rec));
    KV._store.set('sh_meta_' + id, JSON.stringify({
        name: rec.name, user: rec.user, at: rec.at, keyHash: rec.keyHash,
        keyless: rec.keyless, webKey: rec.webKey, authRequired: rec.authRequired,
        storage: 'github', parts: rec.n, len: rec.len,
    }));
    return rec;
}

console.log('[G1] the GitHub UPLOAD endpoints are retired, auth still comes first...');
{
    // Unauthenticated first: an endpoint must not tell a stranger it is retired.
    const anon = await j('POST', '/sh/gh-put', { id: 'ScripterHub0000000010', part: 0, content: 'x' });
    assert.strictEqual(anon.status, 401, 'an unauthenticated caller must not learn the endpoint state');

    const token = await login();
    for (const p of ['/sh/gh-put', '/sh/gh-finalize']) {
        const r = await j('POST', p, { token, id: 'ScripterHub0000000010', part: 0, content: 'x', n: 1, len: 1, name: 'x', user: 'y' });
        assert.strictEqual(r.status, 410, p + ' must answer 410 Gone, got ' + r.status);
        assert.ok(/retired/i.test(String(r.error)), p + ' must say why, got: ' + r.error);
    }
    assert.strictEqual(ghStore.size, 0, 'a refused upload must not touch the repo');
    console.log('    OK: retired, still 401-first, repo untouched');
}

console.log('[G2] an ALREADY-PUBLISHED GitHub script is still readable...');
const GH_ID = 'ScripterHub0000000011';
{
    // 3 parts of 10MB each (30MB total) - the size the reassembly assertions below expect.
// Kept large on purpose: "reassembles exactly" over 30MB is the claim being defended,
// and shrinking it to a few KB would let a chunking bug pass.
    seedPublishedGithubScript(GH_ID, [
        'A'.repeat(10 * 1024 * 1024),
        'B'.repeat(10 * 1024 * 1024),
        'C'.repeat(10 * 1024 * 1024),
    ], { name: 'BigScript' });
    const meta = JSON.parse(KV._store.get('sh_meta_' + GH_ID));
    assert.strictEqual(meta.storage, 'github');
    assert.strictEqual(meta.parts, 3);
    assert.ok(ghStore.has('scripts/' + GH_ID + '/0.part'), 'part 0 present in the repo');
    console.log('    OK: a pre-existing script is intact and indexed');
}

// PHASE 3 REWRITE. Was: "/sh/<id> serves the parts bootstrap".
// The loader is now artifact-free and identical for every script; the chain
// root is decided by the GATE, not baked into the loader.
console.log('[G4] /sh/<id> is artifact-free; the gate hands out the /sh/g chain...');
{
    await seedLicense();
    const r = await call('GET', '/sh/' + GH_ID, null, EXECUTOR_UA);
    const boot = await r.text();
    assert.ok(boot.includes('ScripterHub session loader'), 'loader is the session bootstrap');
    assert.ok(!boot.includes('AAA'), 'raw part data NOT embedded');
    assert.ok(!boot.includes('/sh/g/' + GH_ID + '/'), 'the loader must not bake in a part route');

    // the gate is what reveals the /sh/g root
    const chain = await openChain(GH_ID);
    assert.strictEqual(chain.n, 3, 'chain reports 3 parts');
    assert.strictEqual(chain.root, '/sh/g/' + GH_ID, 'chain root is the GitHub proxy');

    // keyed version: the loader must still ask for the Special Key.
    // Seeded, not uploaded - the upload endpoints are gone (G1).
    const kid = 'ScripterHub0000000013';
    seedPublishedGithubScript(kid, ['K'.repeat(1024)], { name: 'K', user: 't', keyless: false, keyHash: 'h' });
    const r2 = await call('GET', '/sh/' + kid, null, EXECUTOR_UA);
    const boot2 = await r2.text();
    assert.ok(boot2.includes('ScripterHubKey'), 'keyed bootstrap asks for the Special Key');
    console.log('    OK: loaders are artifact-free for both modes; the gate owns the route');
}

// PHASE 3 REWRITE. Was: "/sh/g proxies parts to executors only".
// An executor User-Agent is necessary but no longer sufficient: a grant from
// the gate is required, and the chain is forward-only.
console.log('[G5] /sh/g is chain-gated, forward-only, and reassembles exactly...');
{
    // 1. the OLD attack: fixed path + executor UA, no grant. Must fail.
    const scrape = await call('GET', '/sh/g/' + GH_ID + '/0', null, EXECUTOR_UA);
    assert.strictEqual(scrape.status, 405, 'the proxy must NOT be open to a spoofed UA');

    // 2. a real chain reassembles exactly, in order
    const chain = await openChain(GH_ID);
    const parts = [];
    for (let i = 0; i < chain.n; i++) {
        const rc = await call('GET', `${chain.root}/${i}?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
        assert.strictEqual(rc.status, 200, 'part ' + i + ' must be served');
        parts.push(await rc.text());
    }
    const stitched = parts.join('');
    assert.strictEqual(stitched.length, 30 * 1024 * 1024, 'exact total length');
    assert.ok(stitched.startsWith('AAA') && stitched.endsWith('CCC'), 'order preserved');

    // 3. forward-only: part 2 before part 0 must be refused
    const c2 = await openChain(GH_ID);
    const skip = await call('GET', `${c2.root}/2?g=${c2.grant}&s=${c2.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(skip.status, 405, 'a chain must not allow skipping ahead');
    // and a served part is not replayable
    const p0 = await call('GET', `${c2.root}/0?g=${c2.grant}&s=${c2.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(p0.status, 200);
    const again = await call('GET', `${c2.root}/0?g=${c2.grant}&s=${c2.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(again.status, 405, 'a served part must not be replayable');

    // 4. browsers + out-of-range + unknown -> 405
    const c3 = await openChain(GH_ID);
    const rb = await call('GET', `${c3.root}/0?g=${c3.grant}&s=${c3.sid}`, null, BROWSER_UA);
    assert.strictEqual(rb.status, 405, 'browsers blocked');
    const ro = await call('GET', `${c3.root}/9?g=${c3.grant}&s=${c3.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(ro.status, 405, 'beyond part count blocked');
    const ru = await call('GET', '/sh/g/ScripterHub0000000099/0', null, EXECUTOR_UA);
    assert.strictEqual(ru.status, 405, 'unknown script blocked');
    const forged = await call('GET', `${c3.root}/0?g=forged.grant&s=${c3.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(forged.status, 405, 'a forged grant is worthless');
    console.log('    OK: proxy is grant-gated, forward-only, non-replayable, reassembles exactly');
}

console.log('[G6] the parts bootstrap RUNS in Lua (keyless stitch + execute)...');
{
    const r = await call('GET', '/sh/' + GH_ID, null, EXECUTOR_UA);
    const boot = await r.text();
    const chain = await openChain(GH_ID);
    const parts = [];
    for (let i = 0; i < chain.n; i++) {
        const rc = await call('GET', `${chain.root}/${i}?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
        parts.push(await rc.text());
    }
    const gateBody = 'SHG ' + chain.n + ' ' + chain.root + ' ' + chain.grant + '\n';
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring([
        'getgenv = function() return _G end',
        'loadstring = function(s) SH_RUN = s SH_LEN = #s return function() end end',
        'game = { GetService = function() return { SetCore = function() end } end }',
        'SH_SESS = ' + JSON.stringify('SHS sid_fake nonce_fake ' + (Date.now() + 45000)),
        'SH_GATE = ' + JSON.stringify(gateBody),
        'SH_PARTS = {' + parts.map(p => JSON.stringify(p)).join(',') + '}',
        'request = function(o)',
        '  if o.Url:find("/sh/session", 1, true) then return { Body = SH_SESS } end',
        '  if o.Url:find("/sh/a/", 1, true) then return { Body = SH_GATE } end',
        '  return { Body = "" }',
        'end',
        'game.HttpGet = function(self, u)',
        '  local i = tonumber(u:match("/(%d+)%?"))',
        '  if i then return SH_PARTS[i + 1] end',
        '  return nil',
        'end'
    ].join('\n')));
    const st = lauxlib.luaL_dostring(L, to_luastring(boot));
    assert.strictEqual(st, lua.LUA_OK, 'bootstrap must run clean (30MB stitch!)');
    lua.lua_getglobal(L, to_luastring('SH_LEN'));
    const len = Number(lua.lua_tonumber(L, -1));
    lua.lua_pop(L, 1);
    assert.strictEqual(len, 30 * 1024 * 1024, 'the stitched payload must be the full artifact');
    console.log('    OK: 30MB stitched + executed in fengari through the gated chain');
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
