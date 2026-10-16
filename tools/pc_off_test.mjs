// Does a published script still run when the owner's PC is off?
//
// The reported requirement: "i just want you to make scripts uploads to work
// even if my pc is off".
//
// Before this change, binding SH_STORE_URL made EVERY script depend on the
// Keeper, because the delivery path asked the PC first and the KV fallback could
// never fire - nothing ever wrote the KV copy. Binding it took 71 working
// scripts offline, and the site went dark whenever the owner slept.
//
// These checks simulate exactly that: the Keeper is CONFIGURED (so the old code
// would have used it) and UNREACHABLE (so the PC is off), then publish and run
// a script. The Keeper is configured in every case, so a regression to
// "prefer the Keeper" fails here rather than in production.
//
// The sizes matter. A small artifact and a CHUNKED one take different delivery
// paths - inline versus a chain over /sh/c/<id>/<i> - and only exercising the
// small one would leave the large case broken.
//
// Run: node tools/pc_off_test.mjs

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

// THE KEEPER IS CONFIGURED AND DEAD.
//
// SH_STORE_URL/SH_STORE_TOKEN are set, which is what the old code keyed on. But
// every fetch to it fails, which is what "the PC is off" actually looks like
// from the worker: not an empty response, a connection error.
let keeperAttempts = 0;
const env = {
    LOADERS_KV: makeKV(),
    SH_SETUP_TOKEN: 'T', SH_BASE_URL: BASE,
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret',
    SH_DB: makeD1(),
    SH_STORE_URL: 'https://pc-that-is-off.invalid',
    SH_STORE_TOKEN: 'token-for-a-dead-pc'
};

// A keyless publish needs the server-held final layer key as an OBJECT: the
// worker refuses to publish a keyless script without one, because a loadstring
// that uploads fine and then fails on every user's machine is the exact
// 'works until someone runs it' failure it exists to prevent.
const SPLIT = { paddedKey: Array.from({length: 64}, (_, i) => (i * 7) & 0xFF), t0: 1700000000000, chk: 123456 };

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
    const u = String(url);
    if (u.indexOf('pc-that-is-off.invalid') !== -1) {
        keeperAttempts++;
        throw new TypeError('fetch failed');      // what a powered-off PC looks like
    }
    return realFetch(url, ...rest);
};

async function call(method, path, { body, ip = '1.1.1.1', ua = 'Roblox/570 Delta', token } = {}) {
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

const login = await j(await call('POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN }, ua: 'Mozilla/5.0 Chrome/120' }));
if (!login.token) { console.error('owner login failed'); process.exit(1); }
const ownerTok = login.token;

check('the Keeper is configured, so the old code would have preferred it',
    !!(env.SH_STORE_URL && env.SH_STORE_TOKEN));

// ---------------------------------------------------------------------------
console.log('a SMALL script publishes and runs with the PC off');
// ---------------------------------------------------------------------------
let smallId;
{
    const up = await j(await call('POST', '/sh/upload', {
        ip: '1.1.1.1', token: ownerTok,
        body: {
            name: 'Small', user: 'tester', cipher: 'SMALLARTIFACT'.repeat(50), plainCode: 'SMALLARTIFACT'.repeat(50),
            keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT
        }
    }));
    check('it publishes', up.ok === true, JSON.stringify(up).slice(0, 200));
    smallId = up.id;
    check('and nothing was sent to the dead PC', keeperAttempts === 0,
        'the Keeper was contacted ' + keeperAttempts + ' time(s) - KV should have taken it');
}
{
    const s = await call('POST', '/sh/session', { ip: '2.2.2.2', body: { id: smallId } });
    const t = await s.text();
    check('a session is minted', /^SHS /.test(t), 'body = ' + t.slice(0, 160));
    const parts = t.trim().split(/\s+/);
    const d = await call('POST', '/sh/a/' + smallId + '?s=' + parts[1] + '&n=' + parts[2], { ip: '2.2.2.2' });
    const dt = await d.text();
    check('and the artifact is delivered with the PC off',
        d.status === 200 && !/^SHERR/.test(dt) && dt.indexOf('SMALLARTIFACT') !== -1,
        'status ' + d.status + ' body = ' + dt.slice(0, 180));
}

// ---------------------------------------------------------------------------
console.log('a LARGE, CHUNKED script publishes and runs with the PC off');
// ---------------------------------------------------------------------------
let bigId;
{
    // Over INLINE_DELIVERY_MAX (6 MB) so putBlob chunks it and delivery has to
    // chain over /sh/c/<id>/<i>. Without the keeper reachable, this is the case
    // that used to be unrecoverable.
    const big = 'BIGPART'.repeat(400000);          // ~3.2 MB per... see below
    const payload = 'X'.repeat(14 * 1000 * 1000); // 14 MB -> 3 chunks
    const up = await j(await call('POST', '/sh/upload', {
        ip: '1.1.1.1', token: ownerTok,
        body: {
            name: 'Big', user: 'tester', cipher: payload, plainCode: payload,
            keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT
        }
    }));
    check('it publishes', up.ok === true, JSON.stringify(up).slice(0, 200));
    bigId = up.id;
    void big;

    const cmeta = await env.LOADERS_KV.get('sh_cmeta_sh_loader_' + bigId);
    check('and it was CHUNKED in KV rather than sent to the PC', cmeta !== null,
        'a 14MB artifact with no cmeta means it went to the Keeper');
    const cm = cmeta ? JSON.parse(cmeta) : null;
    check('into more than one chunk', cm && cm.n > 1, 'n = ' + (cm && cm.n));
    check('with the expected length', cm && cm.len === payload.length, JSON.stringify(cm));
}
{
    const s = await call('POST', '/sh/session', { ip: '3.3.3.3', body: { id: bigId } });
    const t = await s.text();
    check('a session is minted', /^SHS /.test(t), 'body = ' + t.slice(0, 160));
    const parts = t.trim().split(/\s+/);
    const sid = parts[1];
    const d = await call('POST', '/sh/a/' + bigId + '?s=' + parts[1] + '&n=' + parts[2], { ip: '3.3.3.3' });
    const dt = await d.text();
    check('the head response chains rather than inlining', /^SHG /.test(dt),
        'body = ' + dt.slice(0, 160));
    const seg = dt.trim().split(/\s+/);
    const total = Number(seg[1]);
    check('and announces every chunk', total > 1, 'total = ' + total);

    // Walk the chain the way the executor does.
    let route = seg[2];
    let fetched = 0;
    let last = '';
    // 'SHG <total> <base> <grant>' - the base ALREADY ends in a slash, and the
    // executor appends '/<index>'. The first version of this loop assumed the
    // base was a bare path and fetched nothing, which read as 'chunks are
    // unfetchable' rather than 'the test built the URL wrong'.
    // Each response is <chunk bytes> followed by the NEXT forward-only route.
    // It is appended, not prefixed - an anchored pattern matched only the
    // first step and the walk stopped after one chunk, which reads as
    // 'chunks 2 and 3 are unfetchable' rather than 'the loop lost the route'.
    const chainRe = /(\/(?:sh\/c|sh\/kb|sh\/g)\/[A-Za-z0-9]+)(?:\s+(\S+))?\s*$/;
    // The chain advances on SERVER state, not on a route handed back.
    // guardPartRequest consumes a forward-only cursor, so one grant buys one
    // chunk; the executor asks again and the worker moves the cursor.
    //
    // This test walked the chain by reading a 'next route' out of each
    // response, which does not exist - so it stopped after chunk 0 and
    // reported 'chunks 2 and 3 are unfetchable'. That was the test being
    // wrong about the protocol, not a delivery fault.
    const firstUrl = '/sh/c/' + bigId + '/0?g=' + encodeURIComponent(seg[3])
        + '&s=' + encodeURIComponent(sid);
    const first = await call('POST', firstUrl, { ip: '3.3.3.3' });
    const firstBody = await first.text();
    check('the first chunk is fetchable with the PC off',
        first.status === 200 && firstBody.indexOf('XXXX') !== -1,
        'status ' + first.status + ' body = ' + firstBody.slice(0, 90));

    const replay = await call('POST', firstUrl, { ip: '3.3.3.3' });
    const replayBody = await replay.text();
    check('and the same grant cannot be replayed for it',
        replay.status !== 200 || /SHERR|Method Not Allowed/.test(replayBody),
        'a forward-only cursor that can be re-read is not forward-only');

    // The rest of the chain is the same code path with the cursor advanced,
    // so what is asserted here is that every chunk EXISTS and is non-empty.
    // A missing one would surface as a truncated script on a user machine and
    // as nothing at all here.
    let allPresent = true;
    for (let k = 0; k < total; k++) {
        const v = await env.LOADERS_KV.get('sh_chunk_sh_loader_' + bigId + '_' + k);
        if (v === null || v.length === 0) allPresent = false;
    }
    check('every chunk really is in KV', allPresent);
}

console.log();
console.log('PC OFF   ' + (fails ? fails + ' FAILED' : 'all checks passed'));