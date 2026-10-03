// END-TO-END over the PUBLIC tunnel address.
//
// Every other keeper test talks to the service on 127.0.0.1, which proves the service
// works and proves nothing about whether anyone else can reach it. This one points the
// worker at the public *.trycloudflare.com URL instead, so the bytes travel:
//
//   this test -> worker (in-process) -> PUBLIC INTERNET -> cloudflared -> your PC
//
// If that works, a phone on 5G can load your scripts. That is the whole claim.
//
// Run:  node tools/keeper_public_e2e_test.mjs <public-url>

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const PUBLIC = String(process.argv[2] || '').replace(/\/+$/, '');
if (!PUBLIC) {
    console.error('usage: node tools/keeper_public_e2e_test.mjs <public-url>');
    process.exit(2);
}

// The token the service is running with. Read from the same file tunnel.py persists,
// because a token generated fresh per run would lock the worker out of its own service.
const TOKEN = fs.readFileSync(path.join(ROOT, 'Storage Keeper', 'data', 'token.txt'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };
const group = m => console.log('\n' + m);

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        async list(o) {
            const keys = [];
            for (const k of store.keys()) if (!o || !o.prefix || k.startsWith(o.prefix)) keys.push({ name: k });
            return { keys, list_complete: true };
        },
        _store: store,
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(path.join(ROOT, 'migrations', '0001_init.sql'), 'utf8'));
    return db;
}

// pathToFileURL, not a bare path: the ESM loader rejects a Windows absolute path
// ('c:') and only accepts file: URLs.
const worker = (await import(pathToFileURL(path.join(ROOT, 'For Cloudflare', 'worker.js')).href)).default;
const KV = makeKV();
const env = {
    LOADERS_KV: KV,
    SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    // The whole point: the public address, not loopback.
    SH_STORE_URL: PUBLIC,
    SH_STORE_TOKEN: TOKEN,
    SH_SESSION_SECRET: 'e2e-session-secret',
    SH_DB: makeD1(),
};
const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

const call = (method, p, body, ua) => worker.fetch(new Request('https://test.workers.dev' + p, {
    method,
    headers: body
        ? { 'Content-Type': 'application/json', 'User-Agent': ua || BROWSER_UA }
        : { 'User-Agent': ua || BROWSER_UA },
    body: body ? JSON.stringify(body) : undefined,
}), env, { waitUntil: () => {} });

async function j(method, p, body, ua) {
    const r = await call(method, p, body, ua);
    const t = await r.text();
    try { return { status: r.status, ...JSON.parse(t), _text: t }; }
    catch (e) { return { status: r.status, ok: false, _text: t }; }
}

group('the PUBLIC address answers');
{
    // Unauthenticated on purpose: /v1/health is the one open route, and proving IT is
    // open-and-harmless is part of the check.
    const r = await fetch(PUBLIC + '/v1/health', { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (r.status === 200) ok('GET /v1/health over the public tunnel -> 200');
    else no('GET /v1/health -> HTTP ' + r.status);

    const anon = await fetch(PUBLIC + '/v1/health');
    const anonText = await anon.text();
    if (anon.status === 200 && !/[\\/]|[A-Za-z]:/.test(anonText)) ok('health is open and reveals nothing about the filesystem');
    else no('health response looks wrong: HTTP ' + anon.status + ' ' + anonText.slice(0, 80));
}

group('the service refuses a stranger on the PUBLIC address');
{
    const r = await fetch(PUBLIC + '/v1/objects/ScripterHub123456', { headers: { Authorization: 'Bearer wrong' } });
    if (r.status === 401) ok('a bad token over the public internet -> 401');
    else no('a bad token -> HTTP ' + r.status);
    const anon = await fetch(PUBLIC + '/v1/objects/ScripterHub123456');
    if (anon.status === 401) ok('no token at all -> 401');
    else no('no token -> HTTP ' + anon.status);
}

group('a script published through the worker lands on the PC');
const ID = 'ScripterHub7770000001';
const CODE = 'print("this came from the public tunnel")';
{
    const tk = (await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN })).token;
    assert.ok(tk, 'owner login must work');
    const up = await j('POST', '/sh/upload', {
        token: tk, name: 'public-e2e', user: 'tester', keyless: true,
        plainCode: CODE, cipher: '', keyHash: '', wantId: ID,
    }, BROWSER_UA);
    if (up.ok && up.id === ID) ok('the worker accepted the upload');
    else no('upload failed: ' + JSON.stringify(up).slice(0, 200));

    // And it is NOT in KV - that is the property this whole change exists for.
    if (!KV._store.has('sh_loader_' + ID)) ok('the bytes did NOT go to Cloudflare KV');
    else no('the bytes went to KV anyway');

    // The service really holds it, fetched independently of the worker.
    const direct = await fetch(`${PUBLIC}/v1/objects/${ID}?kind=artifact`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    });
    const text = await direct.text();
    if (direct.status === 200 && text.includes('public tunnel')) ok('the object is on the PC, readable over the public tunnel');
    else no('the object is not readable on the PC: HTTP ' + direct.status);
}

group('and it delivers back to an executor');
{
    const s = await call('POST', '/sh/session', { id: ID, k: 'E2ELIC', h: 'HW' }, EXECUTOR_UA);
    const parts = (await s.text()).trim().split(/\s+/);
    if (parts[0] === 'SHS') ok('a session was issued');
    else no('no session: ' + parts.join(' '));
    const d = await call('GET', `/sh/a/${ID}?s=${parts[1]}&n=${parts[2]}`, null, EXECUTOR_UA);
    const body = await d.text();
    if (body.includes('public tunnel')) ok('the script delivered with its content intact');
    else no('delivery did not carry the body: ' + body.slice(0, 120));
}

group('a large script goes over the public tunnel as parts');
const BIG = 'ScripterHub7770000002';
{
    const tk = (await j('POST', '/sh/login', { code: OWNER_CODE_PLAIN })).token;
    const chunks = ['print("A")', 'print("B")', 'print("C")'];
    let all = true;
    for (let i = 0; i < chunks.length; i++) {
        const r = await j('POST', '/sh/kb-put', { token: tk, id: BIG, part: i, content: chunks[i] }, BROWSER_UA);
        if (!r.ok) { all = false; no('part ' + i + ' refused: ' + JSON.stringify(r).slice(0, 140)); }
    }
    if (all) ok('all three parts reached the PC through the public tunnel');
    const fin = await j('POST', '/sh/kb-finalize', {
        token: tk, id: BIG, n: chunks.length, len: chunks.join('').length,
        name: 'big', user: 'tester', keyless: true,
    }, BROWSER_UA);
    if (fin.ok) ok('finalize accepted the part-stored script');
    else no('finalize failed: ' + JSON.stringify(fin).slice(0, 160));

    const s = await call('POST', '/sh/session', { id: BIG, k: 'E2ELIC', h: 'HW' }, EXECUTOR_UA);
    const p = (await s.text()).trim().split(/\s+/);
    const d = await call('GET', `/sh/a/${BIG}?s=${p[1]}&n=${p[2]}`, null, EXECUTOR_UA);
    const head = await d.text();
    if (head.startsWith('SHG ') && head.includes('/sh/kb/' + BIG)) ok('delivery opens a chain at /sh/kb/ over the public setup');
    else no('unexpected chain head: ' + head.slice(0, 120));

    const del = await j('POST', '/sh/kb-delete', { token: tk, id: BIG }, BROWSER_UA);
    if (del.ok && del.partsFreed === 3) ok('delete freed all three parts off the PC');
    else no('delete did not free the parts: ' + JSON.stringify(del).slice(0, 160));
}

console.log('\n' + '='.repeat(60));
console.log('  PUBLIC E2E   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(60));
process.exit(fail === 0 ? 0 : 1);