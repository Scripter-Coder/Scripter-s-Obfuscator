// END-TO-END: does a key created in the panel actually open a key-system script?
//
// Reported: "when you add user key like generating key it doesnt work for any
// key system script" - and the request that a key be tied to a chosen project.
//
// Everything here runs against the REAL worker module with a mocked KV and a
// real D1, and follows the same sequence the browser performs:
//
//   owner login -> save the licenses map exactly as shSyncLicenses() builds it
//                -> publish a script with authRequired
//                -> executor calls /sh/session with the key and a HWID
//                -> executor spends the session and gets the artifact
//
// The point is to find out which step refuses, rather than to read the code and
// guess. Reading is what has been wrong twice already in this area.
//
// Run: node tools/license_endtoend_test.mjs

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

const env = {
    LOADERS_KV: makeKV(),
    SH_SETUP_TOKEN: 'TESTTOKEN123',
    SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret',
    SH_DB: makeD1()
};

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const BASE = 'https://sh.test';
const EXECUTOR_UA = 'Roblox/570 Delta Executor';
async function call(method, path, { body, ip = '1.1.1.1', ua = EXECUTOR_UA, token } = {}) {
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

// --- owner login ------------------------------------------------------------
const login = await j(await call('POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN }, ua: 'Mozilla/5.0 Chrome/120' }));
if (!login.token) { console.error('owner login failed: ' + JSON.stringify(login)); process.exit(1); }
const ownerTok = login.token;

// ---------------------------------------------------------------------------
console.log('publish a script that requires a key');
// ---------------------------------------------------------------------------
const up = await j(await call('POST', '/sh/upload', {
    ip: '1.1.1.1', token: ownerTok,
    body: {
        name: 'KeyScript', user: 'tester', cipher: 'U0hPS0Zha2VDaXBoZXI=', keyHash: 'deadbeef',
        normalCode: 'print("hi")', authRequired: true, splitKey: 'DEADBEEFSPLITKEYDEADBEEF'
    }
}));
check('the script is published', up.ok === true, JSON.stringify(up).slice(0, 200));
const SCRIPT_ID = up.id;

// ---------------------------------------------------------------------------
console.log('save a key the way the panel does (shSyncLicenses payload)');
// ---------------------------------------------------------------------------
const KEY = 'A'.repeat(40) + 'b';
const payload = {
    licenses: {
        [KEY]: {
            scriptId: 'all', hwid: '', expiresAt: 0, banned: false, banReason: '',
            discordId: '', note: 'Ad Reward: test', hwidResets: 0, executions: 0
        }
    }
};
// The credential travels in the BODY as 	oken, not in a header. A custom
// header is what a browser preflight rejects, so the client moved to the body
// and the worker reads it there.
const sv = await j(await call('POST', '/sh/licenses', { body: Object.assign({}, payload, { token: ownerTok }) }));
check('the licenses map is accepted', sv.ok === true, JSON.stringify(sv).slice(0, 200));

// Straight out of KV: this assertion is about whether the WRITE landed, and
// reaching it through another authenticated route would test that route as
// much as the write.
const back = { licenses: JSON.parse((await env.LOADERS_KV.get('sh_licenses')) || '{}') };
check('the key is really in sh_licenses', !!back.licenses[KEY],
    'keys = ' + JSON.stringify(Object.keys(back.licenses)));

// ---------------------------------------------------------------------------
console.log('an executor uses that key on the key-system script');
// ---------------------------------------------------------------------------
let session = null;
{
    const s = await call('POST', '/sh/session', {
        ip: '2.2.2.2', body: { id: SCRIPT_ID, k: KEY, h: 'HWID-USER-1' }
    });
    const text = await s.text();
    // "SHS <sid> <nonce> <expiresAt>" - three plain values and nothing else.
    check('the session is minted', /^SHS /.test(text), 'status ' + s.status + ' body = ' + text.slice(0, 220));
    if (!/^SHERR/.test(text)) session = { body: text };
    check('and it is NOT refused', !/^SHERR/.test(text), 'refusal: ' + text.slice(0, 160));
}

console.log('a key that was never saved IS refused, for contrast');
{
    const s = await call('POST', '/sh/session', {
        ip: '2.2.2.3', body: { id: SCRIPT_ID, k: 'NOT-A-REAL-KEY', h: 'HWID-USER-2' }
    });
    const text = await s.text();
    check('an unknown key is refused', /^SHERR/.test(text), 'body = ' + text.slice(0, 160));
    check('with the invalid-key reason', /invalid/.test(text), 'body = ' + text.slice(0, 160));
}

console.log('the first successful auth locks the key to that HWID');
{
    const rec = JSON.parse((await env.LOADERS_KV.get('sh_licenses')) || '{}')[KEY];
    check('the key now carries a HWID', !!(rec && rec.hwid), 'rec = ' + JSON.stringify(rec));
    check('and it is the one that authenticated', rec && rec.hwid === 'HWID-USER-1', JSON.stringify(rec));
}
{
    const s = await call('POST', '/sh/session', {
        ip: '2.2.2.9', body: { id: SCRIPT_ID, k: KEY, h: 'SOME-OTHER-MACHINE' }
    });
    const text = await s.text();
    check('a DIFFERENT machine is refused the same key', /^SHERR/.test(text) && /hwid/.test(text),
        'body = ' + text.slice(0, 160));
}

console.log('delivery still works for the holder of the key');
if (session && session.body && /^SHS /.test(session.body)) {
    // "SHS <sid> <nonce> <expiresAt>" - parts[0] is the literal prefix.
    const parts = session.body.trim().split(/\s+/);
    const sid = parts[1], nonce = parts[2];
    check('the session carried a sid and a nonce', !!sid && !!nonce,
        'response = ' + JSON.stringify(session.body.slice(0, 120)));
    // /sh/a/<id>?s=<sid>&n=<nonce> - query string, not body.
    const d = await call('POST', '/sh/a/' + SCRIPT_ID + '?s=' + sid + '&n=' + nonce,
        { ip: '2.2.2.2', body: { k: KEY, h: 'HWID-USER-1' } });
    const dt = await d.text();
    check('the artifact is delivered', d.status === 200 && !/^SHERR/.test(dt),
        'status ' + d.status + ' body = ' + dt.slice(0, 200));
}

console.log();
console.log('LICENSE END TO END   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);