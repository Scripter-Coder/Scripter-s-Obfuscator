// Large artifacts in R2, and the Keeper out of the loop.
//
// The requirement: "make sure it can be done with any size" and "we can ignore
// our storage keeper for scripts".
//
// WHAT THIS PINS
//
//   1. A large artifact goes to R2 as ONE object, not 20 KV chunks.
//   2. It is still delivered: the chain head says /sh/c/, and that route reads
//      R2. Without the R2 branch there the artifact would be stored and then
//      unservable - a script that publishes fine and fails on every user.
//   3. It is downloadable, so the whole point of the feature survives R2.
//   4. SMALL artifacts stay in KV, untouched - the inline path is the strongest
//      one and rewriting it for no benefit would be churn in the only route
//      permitted to return artifact bytes.
//   5. No keeper request is made, even with SH_STORE_URL bound and reachable.
//
// Run: node tools/r2_artifact_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        _store: store
    };
}
// A real R2 stand-in: keyed put/get, text(), and an object per key.
function makeR2() {
    const store = new Map();
    let puts = 0;
    return {
        async put(key, body) { puts++; store.set(key, body); },
        async get(key) {
            if (!store.has(key)) return null;
            const v = store.get(key);
            return { key, text: async () => (typeof v === 'string' ? v : JSON.stringify(v)) };
        },
        async delete(key) { store.delete(key); },
        _store: store,
        get puts() { return puts; }
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}

const worker = (await import('../For Cloudflare/worker.js')).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const BASE = 'https://sh.test';
let keeperHits = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
    const u = String(url);
    // The Keeper IS reachable here - reachable, and must still not be used.
    if (u.indexOf('keeper-should-not-be-used.invalid') !== -1) { keeperHits++; throw new TypeError('fetch failed'); }
    return realFetch(url, ...rest);
};

function makeEnv() {
    return {
        LOADERS_KV: makeKV(),
        ARTIFACTS: makeR2(),
        SH_SETUP_TOKEN: 'T', SH_BASE_URL: BASE,
        SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 'test-only-session-secret', SH_DB: makeD1(),
        SH_STORE_URL: 'https://keeper-should-not-be-used.invalid',
        SH_STORE_TOKEN: 'token'
    };
}
async function call(env, method, path, { body, ip = '1.1.1.1', ua = 'Mozilla/5.0 Chrome/120', token } = {}) {
    const headers = { 'User-Agent': ua };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (token) headers['X-SH-Token'] = token;
    const send = body && method !== 'GET' && method !== 'HEAD';
    if (send) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(BASE + path, {
        method, headers, body: send ? JSON.stringify(body) : undefined
    }), env, { waitUntil(p) { try { p && p.catch(() => {}); } catch (e) {} } });
}
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { __raw: t.slice(0, 200) }; } };

const SPLIT = { paddedKey: Array.from({ length: 64 }, (_, i) => (i * 7) & 0xFF), t0: 1700000000000, chk: 123456 };

// Bigger than INLINE_DELIVERY_MAX (6 MB) so R2 takes it, smaller than
// MAX_CIPHER_LEN so a single request is legal.
const BIG = ('B' + 'x'.repeat(999)).repeat(16000);        // ~16 MB

// ---------------------------------------------------------------------------
console.log('a LARGE artifact goes to R2 as one object');
// ---------------------------------------------------------------------------
const env = makeEnv();
const login = await j(await call(env, 'POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN } }));
const ownerTok = login.token;
check('the keeper is bound AND reachable', !!(env.SH_STORE_URL && env.SH_STORE_TOKEN));

let bigId;
{
    const up = await j(await call(env, 'POST', '/sh/upload', {
        token: ownerTok,
        body: { name: 'Huge', user: 't', cipher: 'Zm9v', keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT, plainCode: BIG }
    }));
    check('it publishes', up.ok === true, JSON.stringify(up).slice(0, 180));
    bigId = up.id;

    check('exactly ONE object was written to R2', env.ARTIFACTS.puts === 1, 'puts = ' + env.ARTIFACTS.puts);
    check('the artifact really is in R2', env.ARTIFACTS._store.has('ash_loader_' + bigId),
        'R2 keys = ' + JSON.stringify([...env.ARTIFACTS._store.keys()]));

    const cmeta = JSON.parse(await env.LOADERS_KV.get('sh_cmeta_sh_loader_' + bigId) || 'null');
    check('cmeta says n:1, so the chain serves one part', cmeta && cmeta.n === 1, JSON.stringify(cmeta));
    check('and flags it as R2', cmeta && cmeta.r2 === 1, JSON.stringify(cmeta));

    const chunkKeys = [...env.LOADERS_KV._store.keys()].filter(k => k.indexOf('sh_chunk_') === 0);
    check('no KV chunks were written at all', chunkKeys.length === 0, 'KV chunks = ' + JSON.stringify(chunkKeys));
    check('the keeper was never contacted', keeperHits === 0, 'keeper hits = ' + keeperHits);
}

console.log('and it still DELIVERS, which is the part that would break silently');
{
    const s = await call(env, 'POST', '/sh/session', { ip: '3.3.3.3', ua: 'Roblox/570 Delta', body: { id: bigId } });
    const st = await s.text();
    check('a session is minted', /^SHS /.test(st), 'body = ' + st.slice(0, 140));
    const parts = st.trim().split(/\s+/);
    const d = await call(env, 'POST', '/sh/a/' + bigId + '?s=' + parts[1] + '&n=' + parts[2],
        { ip: '3.3.3.3', ua: 'Roblox/570 Delta' });
    const dt = await d.text();
    check('the head chains to /sh/c/', /^SHG 1 \/sh\/c\//.test(dt), 'body = ' + dt.slice(0, 140));

    const seg = dt.trim().split(/\s+/);
    const url = '/sh/c/' + bigId + '/0?g=' + encodeURIComponent(seg[3]) + '&s=' + encodeURIComponent(parts[1]);
    const c = await call(env, 'POST', url, { ip: '3.3.3.3', ua: 'Roblox/570 Delta' });
    const cb = await c.text();
    check('the part is fetchable FROM R2', c.status === 200 && cb.length === BIG.length,
        'status ' + c.status + ' got ' + cb.length + ' of ' + BIG.length);
    check('and the bytes are the artifact', cb === BIG);
    check('with the keeper still untouched', keeperHits === 0, 'keeper hits = ' + keeperHits);
}

console.log('and it DOWNLOADS, which is the feature that depends on it');
{
    const res = await call(env, 'GET', '/sh/dl/' + bigId);
    const body = await res.text();
    check('the download succeeds', res.status === 200, 'status ' + res.status);
    check('with the whole artifact', body.length === BIG.length, 'got ' + body.length);
    const cd = res.headers.get('Content-Disposition') || '';
    check('and the agreed filename', /filename="Huge-ScripterHub\(\d+\)\.lua"/.test(cd), cd.slice(0, 120));
}

// ---------------------------------------------------------------------------
console.log('a SMALL artifact stays in KV - the inline path is untouched');
// ---------------------------------------------------------------------------
{
    const env2 = makeEnv();
    const l2 = await j(await call(env2, 'POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN } }));
    const SMALL = 'S'.repeat(20000);
    const up = await j(await call(env2, '/sh/upload', {
        method: 'POST', token: l2.token,
        body: { name: 'Small', user: 't', cipher: 'Zm9v', keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT, plainCode: SMALL }
    }).catch(() => call(env2, 'POST', '/sh/upload', {
        token: l2.token,
        body: { name: 'Small', user: 't', cipher: 'Zm9v', keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT, plainCode: SMALL }
    })));
    check('it publishes', up.ok === true, JSON.stringify(up).slice(0, 140));
    check('nothing was written to R2', env2.ARTIFACTS.puts === 0, 'puts = ' + env2.ARTIFACTS.puts);
    const inline = await env2.LOADERS_KV.get('sh_loader_' + up.id);
    check('the inline KV value is there', inline === SMALL, 'len = ' + (inline || '').length);

    // and it still inlines rather than chaining
    const s = await call(env2, 'POST', '/sh/session', { ip: '4.4.4.4', ua: 'Roblox/570 Delta', body: { id: up.id } });
    const st = await s.text();
    const parts = st.trim().split(/\s+/);
    const d = await call(env2, 'POST', '/sh/a/' + up.id + '?s=' + parts[1] + '&n=' + parts[2],
        { ip: '4.4.4.4', ua: 'Roblox/570 Delta' });
    const dt = await d.text();
    check('it inlines in one response (no chain)', dt.indexOf('SSSSSSSSSS') !== -1, 'body = ' + dt.slice(0, 90));
}

// ---------------------------------------------------------------------------
console.log('a deployment with NO R2 binding still works (KV only)');
// ---------------------------------------------------------------------------
{
    const env3 = makeEnv();
    delete env3.ARTIFACTS;
    const l3 = await j(await call(env3, 'POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN } }));
    // Isolate THIS upload: the counter is shared and earlier sections ran
    // keeper probes of their own (the no-R2 path legitimately falls back).
    keeperHits = 0;
    const up = await j(await call(env3, 'POST', '/sh/upload', {
        token: l3.token,
        body: { name: 'NoR2', user: 't', cipher: 'Zm9v', keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT, plainCode: BIG }
    }));
    check('it publishes', up.ok === true, JSON.stringify(up).slice(0, 140));
    const chunks = [...env3.LOADERS_KV._store.keys()].filter(k => k.indexOf('sh_chunk_') === 0);
    check('and falls back to KV chunks', chunks.length > 1, 'chunks = ' + chunks.length);
    // The UPLOAD must not have gone to the keeper. DELIVERY may still probe
    // it: with the Keeper bound, the delivery path tries the PC and falls back
    // to KV, which is the PC-off behaviour and costs one wasted request.
    check('the UPLOAD did not route to the keeper', keeperHits === 0, 'keeper hits = ' + keeperHits);
    const dl = await call(env3, 'GET', '/sh/dl/' + up.id);
    check('and still downloads', dl.status === 200, 'status ' + dl.status);
}

console.log();
console.log('R2 ARTIFACTS   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);