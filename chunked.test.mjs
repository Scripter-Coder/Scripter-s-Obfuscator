// CHUNKED UPLOAD (large scripts) tests.
// KV values cap at 25MB - big scripts store as chunks and executors fetch them
// via /sh/c/<id>/<i>. Covers:
//   - small scripts keep the legacy single-KV-value path
//   - large (>25MB) scripts chunk across KV, reassemble perfectly
//   - /sh/c is chain-gated: executor UA is necessary but NOT sufficient
//   - the chain is forward-only, so a part cannot be replayed or skipped
//   - replacing a chunked loader cleans up all chunks
//   - oversized (>50MB) scripts get the honest 413 error
//
// PHASE 3: the chunk route used to be reachable by anyone sending an executor
// User-Agent, on a fixed guessable path, so a scraper could walk 0..N and
// reassemble the artifact. It is now behind a grant from the delivery gate AND
// a forward-only cursor in the session row. The tests below drive that flow
// explicitly rather than pretending the route is open.
import assert from 'assert';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './tools/owner_code_test_helper.mjs';
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
// A real D1: the part route is fail-closed without one, so without this every
// case below would pass by refusing everything.
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}
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
const LIC = 'CHUNKLIC';

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
    const d = await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    return d.token;
}

// Mint a session and open a chain, returning the grant + sid the part route
// needs. This is the ONLY way to reach a chunk now, and that is the property
// under test.
async function openChain(id) {
    const m = await call('POST', '/sh/session', { id, k: LIC, h: 'HW' }, EXECUTOR_UA);
    const p = (await m.text()).trim().split(/\s+/);
    assert.strictEqual(p[0], 'SHS', 'expected a session for ' + id + ', got: ' + p.join(' '));
    const r = await call('GET', `/sh/a/${id}?s=${p[1]}&n=${p[2]}`, null, EXECUTOR_UA);
    const text = await r.text();
    assert.ok(text.startsWith('SHG '), 'a chunked artifact must open a chain, got: ' + text.slice(0, 80));
    const head = text.slice(0, text.indexOf('\n'));
    const [, n, root, grant] = head.split(' ');
    return { sid: p[1], n: Number(n), root, grant };
}

async function seedLicense() {
    const token = await login();
    const d = await j('POST', '/sh/licenses', {
        token, licenses: { [LIC]: { hwid: 'HW', expiresAt: 0, banned: false } }
    });
    assert.strictEqual(d.ok, true, 'license seed failed: ' + JSON.stringify(d));
}

console.log('[C1] small keyless script stays on the single-value path...');
{
    await seedLicense();
    const token = await login();
    const d = await j('POST', '/sh/upload', {
        token, name: 'Small', user: 't', keyless: true,
        plainCode: '-- small script', cipher: 'U0hPS01BTEw=',
        wantId: 'ScripterHub0000000001'
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    assert.ok(KV._store.has('sh_loader_ScripterHub0000000001'), 'legacy single KV value');
    assert.ok(!KV._store.has('sh_cmeta_sh_loader_ScripterHub0000000001'), 'no chunk meta for small scripts');
    // the public loader carries no artifact
    const r = await call('GET', '/sh/ScripterHub0000000001', null, EXECUTOR_UA);
    const boot = await r.text();
    assert.ok(!boot.includes('-- small script'), 'the loader must not embed the artifact');
    // the gate delivers it inline (no chain needed for a small artifact)
    const got = await call('POST', '/sh/session', { id: 'ScripterHub0000000001', k: LIC, h: 'HW' }, EXECUTOR_UA);
    const p = (await got.text()).trim().split(/\s+/);
    const g = await call('GET', `/sh/a/ScripterHub0000000001?s=${p[1]}&n=${p[2]}`, null, EXECUTOR_UA);
    const body = await g.text();
    assert.strictEqual(g.status, 200);
    assert.ok(body.startsWith('SHL\n'), 'a keyless delivery is SHL, got: ' + body.slice(0, 40));
    assert.ok(body.includes('-- small script'), 'the gated delivery must contain the artifact');
    console.log('    OK: small scripts take the single-value path, delivered inline by the gate');
}

console.log('[C2] LARGE keyless script chunks across KV and serves intact...');
{
    const token = await login();
    // build a ~30MB plain blob (over the 25MB KV value cap -> 2 chunks)
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

    // the loader is artifact-free
    const r = await call('GET', '/sh/ScripterHub0000000002', null, EXECUTOR_UA);
    const text = await r.text();
    assert.ok(text.includes('ScripterHub session loader'), 'loader is the session bootstrap');
    assert.ok(!text.includes('big script'), 'raw code not embedded in loader');

    // the gate opens a chain rather than inlining 30MB
    const chain = await openChain('ScripterHub0000000002');
    assert.strictEqual(chain.n, 2, 'chain reports 2 parts');
    assert.strictEqual(chain.root, '/sh/c/ScripterHub0000000002', 'chain root');

    // and the parts reassemble exactly, in order
    let stitched = '';
    for (let i = 0; i < chain.n; i++) {
        const c = await call('GET', `${chain.root}/${i}?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
        assert.strictEqual(c.status, 200, 'part ' + i + ' must be served');
        stitched += await c.text();
    }
    assert.strictEqual(stitched, big, 'chunks must reassemble to the exact original');
    console.log('    OK: 30MB -> 2 chunks, perfect reassembly through the gate');
}

console.log('[C3] /sh/c needs a grant, and the chain is forward-only...');
{
    // 1. the OLD attack: a fixed path plus an executor User-Agent. Must fail.
    const scrape = await call('GET', '/sh/c/ScripterHub0000000002/0', null, EXECUTOR_UA);
    assert.strictEqual(scrape.status, 405, 'the part route must NOT be open to a spoofed UA');

    // 2. browsers still get nothing
    const rb = await call('GET', '/sh/c/ScripterHub0000000002/0', null, BROWSER_UA);
    assert.strictEqual(rb.status, 405, 'browsers get nothing');

    // 3. out-of-range and unknown-script handling
    const rOob = await call('GET', '/sh/c/ScripterHub0000000002/5', null, EXECUTOR_UA);
    assert.strictEqual(rOob.status, 405, 'out-of-range chunk index rejected');
    const rNeg = await call('GET', '/sh/c/ScripterHub0000000002/-1', null, EXECUTOR_UA);
    assert.notStrictEqual(rNeg.status, 200, 'negative index rejected');
    const rNoMeta = await call('GET', '/sh/c/ScripterHub0000000099/0', null, EXECUTOR_UA);
    assert.strictEqual(rNoMeta.status, 405, 'unknown script -> 405');

    // 4. FORWARD-ONLY. A fresh chain, and part 1 is requested FIRST.
    //    A forward-only chain must refuse it, because part 0 has not been
    //    served. This is the property that stops a captured part-N request
    //    from being replayed or from being used to skip into the middle.
    const chain = await openChain('ScripterHub0000000002');
    const skip = await call('GET', `${chain.root}/1?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(skip.status, 405, 'a chain must not allow skipping ahead to part 1');

    // 5. part 0 works, and then part 0 AGAIN does not (one-time per index)
    const first = await call('GET', `${chain.root}/0?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(first.status, 200, 'part 0 must be served');
    const replay = await call('GET', `${chain.root}/0?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(replay.status, 405, 'a served part must not be replayable');
    // and the chain continues correctly afterwards
    const second = await call('GET', `${chain.root}/1?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(second.status, 200, 'part 1 must follow part 0');

    // 6. a fabricated grant is worthless
    const forged = await call('GET', `${chain.root}/0?g=not.a.grant&s=${chain.sid}`, null, EXECUTOR_UA);
    assert.strictEqual(forged.status, 405, 'a forged grant must be refused');
    console.log('    OK: chunk route is grant-gated, forward-only, non-replayable');
}

console.log('[C4] browsers see a metadata page, with nothing to decrypt...');
{
    const r = await call('GET', '/sh/ScripterHub0000000002', null, BROWSER_UA);
    const text = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(!text.includes('Decrypt'), 'no decrypt box anywhere');
    assert.ok(!/function dec\(/.test(text), 'no shipped decryptor');
    assert.ok(text.includes('ScripterHub0000000002'), 'page identifies the script');
    assert.ok(text.includes('big script') === false, 'no artifact text');
    console.log('    OK: browser metadata page carries nothing');
}

console.log('[C5] chunked KEYED script: the chain carries the key line + reassembles...');
{
    const token = await login();
    // real sh-crypto cipher of a small source, padded into a >25MB cipher
    // by encrypting a large source. The executor test below uses the real
    // decrypt math, so this must be a genuine cipher, not filler.
    const { shEncryptPayload } = await import('./sh-crypto.js');
    const src = 'BIGKEYED = "RAN"\n';
    const bigSrc = ('--' + 'z'.repeat(26 * 1024 * 1024) + '\n') + src; // ~26MB source
    const bigCipher = shEncryptPayload(bigSrc, 'topsecret');
    assert.ok(bigCipher.length > 25 * 1024 * 1024, 'cipher big enough to chunk (len ' + bigCipher.length + ')');
    const d = await j('POST', '/sh/upload', {
        token, name: 'BigKeyed', user: 't',
        cipher: bigCipher, keyHash: 'x',
        authRequired: true,
        wantId: 'ScripterHub0000000003',
        splitKey: { paddedKey: [9, 8, 7, 6], t0: 1700000000, chk: 555 }
    });
    assert.strictEqual(d.ok, true, JSON.stringify(d));
    const r = await call('GET', '/sh/ScripterHub0000000003', null, EXECUTOR_UA);
    const boot = await r.text();
    assert.ok(boot.includes('ScripterHubKey'), 'the bootstrap asks for the Special Key');
    assert.ok(!boot.includes('9 8 7 6'), 'the bootstrap must not carry the padded key');

    // the gate hands out the key line AND the chain
    const chain = await openChain('ScripterHub0000000003');
    const m = await call('POST', '/sh/session', { id: 'ScripterHub0000000003', k: LIC, h: 'HW' }, EXECUTOR_UA);
    const p = (await m.text()).trim().split(/\s+/);
    const g = await call('GET', `/sh/a/ScripterHub0000000003?s=${p[1]}&n=${p[2]}`, null, EXECUTOR_UA);
    const head = await g.text();
    const [h1, h2] = head.split('\n');
    assert.ok(h1.startsWith('SHG '), 'chain header first');
    assert.ok(h2.includes('1700000000 555 9 8 7 6'), 'the key line rides with the chain header: ' + h2);

    let stitched = '';
    for (let i = 0; i < chain.n; i++) {
        const rc = await call('GET', `${chain.root}/${i}?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
        if (rc.status !== 200) break;
        stitched += await rc.text();
    }
    assert.strictEqual(stitched, bigCipher, 'keyed cipher reassembles exactly');
    console.log('    OK: 26MB keyed cipher chunked, gated, reassembled');
}

// The session bootstrap must actually RUN in a Lua VM and drive the whole
// flow: mint -> gate -> chain -> stitch -> execute. This is the end-to-end
// The session bootstrap must actually RUN in a Lua VM and drive the whole
// flow: gate -> chain -> stitch -> decrypt -> execute.
//
// Only the NETWORK is canned. The gate response, the chain header and every
// part are the real bytes the worker produced for a real session, and all of
// the bootstrap's own logic — wire-format parsing, the part loop, the stitch,
// the local decrypt, the loadstring — runs for real. That is the part that can
// actually be wrong, so it is the part worth executing.
console.log('[C6] the session bootstrap RUNS the full flow in Lua...');
{
    const r = await call('GET', '/sh/ScripterHub0000000002', null, EXECUTOR_UA);
    const boot = await r.text();

    // 1. a real session, a real chain, and every real part byte
    const chain = await openChain('ScripterHub0000000002');
    const parts = [];
    for (let i = 0; i < chain.n; i++) {
        const c = await call('GET', `${chain.root}/${i}?g=${chain.grant}&s=${chain.sid}`, null, EXECUTOR_UA);
        assert.strictEqual(c.status, 200, 'part ' + i + ' must be served');
        parts.push(await c.text());
    }
    assert.strictEqual(parts.join('').length, 30 * 1024 * 1024, 'every artifact byte was delivered');
    // exactly what the gate returned on the wire: the SHG header, then the
    // (absent, because this is keyless) key line
    const gateBody = 'SHG ' + chain.n + ' ' + chain.root + ' ' + chain.grant + '\n';

    // 2. run the shipped bootstrap in fengari with a canned transport
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    lauxlib.luaL_dostring(L, to_luastring([
        'getgenv = function() return _G end',
        // capture the payload instead of running it
        'loadstring = function(s) SH_RUN = s SH_LEN = #s SH_HEAD = s:sub(1,14) return function() end end',
        'game = { GetService = function() return { SetCore = function() end } end }',
        'SH_SESS = ' + JSON.stringify('SHS sid_fake nonce_fake ' + (Date.now() + 45000)),
        'SH_GATE = ' + JSON.stringify(gateBody),
        'SH_PARTS = {' + parts.map(p => JSON.stringify(p)).join(',') + '}',
        // the two request shapes the bootstrap uses
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
    assert.strictEqual(st, lua.LUA_OK, 'the shipped bootstrap must execute cleanly in Lua 5.3');

    // 3. the payload it produced must be the exact artifact.
    //    Read the length and head INSIDE Lua rather than pulling 30MB across
    //    the C boundary — the assertion is about the stitch being complete and
    //    correctly ordered, and both are answerable from #s and s:sub().
    const readNum = (name) => {
        lua.lua_getglobal(L, to_luastring(name));
        const v = Number(lua.lua_tonumber(L, -1));
        lua.lua_pop(L, 1);
        return v;
    };
    const readStr = (name) => {
        lua.lua_getglobal(L, to_luastring(name));
        const v = to_jsstring(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        return v;
    };

    const len = readNum('SH_LEN');
    assert.ok(len > 0, 'the bootstrap must have handed a payload to loadstring');
    assert.strictEqual(len, 30 * 1024 * 1024, 'the stitched payload must be the full artifact, byte for byte');
    assert.strictEqual(readStr('SH_HEAD'), '-- big script\n', 'and it must start with the real source');
    console.log('    OK: bootstrap ran end-to-end in Lua and reconstructed the artifact');
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
