// The owner's PC must NOT be in the publishing path.
//
// This file used to assert the opposite: that an upload with SH_STORE_URL bound
// puts the BYTES on the PC, that expiry is the service's timer, and that a
// large script is stored as parts on the owner's disk. Every one of those was
// the Storage Keeper as the script store - and that is exactly what was
// reverted, because it made the catalogue depend on one machine being awake.
// tools/pc_off_test.mjs and tools/r2_artifact_test.mjs cover the NEW contract.
//
// What is left here is the thing only this file can answer, because it runs a
// real Python process on disk: a bound, HEALTHY, reachable PC must still not be
// written to. Asserting that against a dead service proves very little - the
// old code simply fell back to KV - so the service is started and left UP.
//
// Also kept: the service's own guarantees (a bad token is refused, nothing
// internal leaks through a delivery response, the token never reaches its own
// logs), which are properties of the service rather than of where scripts live.
//
// Run: node tools/storage_keeper_test.mjs
import assert from 'assert';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SERVICE = path.join(ROOT, 'Storage Keeper');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };
const group = m => console.log('\n' + m);

// ---- a free port, chosen by the OS rather than guessed ----
function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
    });
}

// ---- boot the real Python service ----
const TOKEN = 'integration-token-abcdefghijklmnop';
let child = null, dataRoot = null;

async function startService() {
    dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-store-'));
    const port = await freePort();
    const py = spawn('py', [path.join(SERVICE, 'run.py')], {
        cwd: ROOT,
        env: Object.assign({}, process.env, {
            SH_STORE_ROOT: dataRoot,
            SH_STORE_PORT: String(port),
            SH_STORE_TOKEN: TOKEN,
            SH_STORE_HOST: '127.0.0.1',
            SH_STORE_CLEANUP_SECONDS: '2',
            SH_STORE_LOG: 'DEBUG',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    py.stderr.on('data', d => { stderr += d.toString(); });
    child = py;

    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) {
        try {
            const r = await fetch(base + '/v1/health');
            if (r.ok) return { base, stderr: () => stderr };
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('the Storage Keeper service never became healthy. stderr:\n' + stderr);
}

function stopService() {
    if (child) { try { child.kill(); } catch (e) { /* already gone */ } }
    if (dataRoot) { try { fs.rmSync(dataRoot, { recursive: true, force: true }); } catch (e) { /* windows may hold a handle */ } }
}

// ---- worker test doubles ----
function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        _store: store,
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(path.join(ROOT, 'migrations/0001_init.sql'), 'utf8'));
    return db;
}

const workerSrc = await import('../For Cloudflare/worker.js');
const worker = workerSrc.default;

const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

// Two envs: one with the storage backend bound, one without. The unbound one proves the
// change is inert by default rather than merely working.
function makeEnv(storeUrl) {
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV,
        SH_SETUP_TOKEN: 'TESTTOKEN123',
        SH_BASE_URL: 'https://test.workers.dev',
        SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 'test-only-session-secret',
        SH_DB: makeD1(),
    };
    if (storeUrl) {
        env.SH_STORE_URL = storeUrl;
        env.SH_STORE_TOKEN = TOKEN;
    }
    env._KV = KV;
    return env;
}

async function call(env, method, p, body, ua) {
    const headers = Object.assign(
        body ? { 'Content-Type': 'application/json' } : {},
        { 'User-Agent': ua || BROWSER_UA }
    );
    return worker.fetch(new Request('https://test.workers.dev' + p, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
    }), env, { waitUntil: () => {} });
}
async function j(env, method, p, body, ua) {
    const r = await call(env, method, p, body, ua);
    const text = await r.text();
    try { return { status: r.status, ...JSON.parse(text), _text: text }; }
    catch (e) { return { status: r.status, ok: false, _text: text }; }
}

async function ownerToken(env) {
    const r = await j(env, 'POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    assert.ok(r.token, 'owner login must issue a token: ' + JSON.stringify(r).slice(0, 200));
    return r.token;
}

async function publishKeyless(env, token, id, code, extra) {
    const r = await j(env, 'POST', '/sh/upload', Object.assign({
        token, name: 'integration', user: 'tester', keyless: true,
        plainCode: code, cipher: '', keyHash: '',
        // wantId is REQUIRED. Without it the worker mints a random id, and every later
        // assertion about "the file for ID" checks a script that was never created -
        // which reads as a broken storage backend rather than a broken test.
        wantId: id,
        // A keyless build still ships a server-held key since D29 (SHX). The
        // worker refuses an upload without one rather than publishing a script
        // that cannot execute, so this has to be here for "the upload was
        // accepted" to mean anything.
        splitKey: { paddedKey: [3, 1, 4, 1, 5, 9, 2, 6], t0: 1700000000, chk: 5150 },
    }, extra || {}), BROWSER_UA);
    if (r.ok && r.id !== id) throw new Error('worker minted ' + r.id + ' instead of ' + id);
    return r;
}

// Ask the running service about one object, WITHOUT assuming it answers JSON.
//
// The service answers a MISSING object with the plain text "SHERR gone" - which
// is the point of it. Calling .json() on that throws a SyntaxError and takes
// the whole test process down, which is how a "did it get written to the PC?"
// check took the suite with it.
async function ask(svc, id) {
    const res = await fetch(`${svc.base}/v1/objects/${id}/meta`, { headers: { Authorization: 'Bearer ' + TOKEN } });
    const txt = (await res.text()).trim();
    let json = null;
    try { json = JSON.parse(txt); } catch (e) { /* not JSON - a refusal, not a record */ }
    return { status: res.status, text: txt, json };
}

async function deliver(env, id, lic) {    const r1 = await worker.fetch(new Request('https://test.workers.dev/sh/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': EXECUTOR_UA },
        body: JSON.stringify({ id, k: lic || 'TESTLIC', h: 'HW' }),
    }), env, { waitUntil: () => {} });
    const text = (await r1.text()).trim();
    const p = text.split(/\s+/);
    if (p[0] !== 'SHS') return { stage: 'session', status: r1.status, text };
    const [, sid, nonce] = p;
    const r2 = await worker.fetch(new Request(`https://test.workers.dev/sh/a/${id}?s=${sid}&n=${nonce}`, {
        headers: { 'User-Agent': EXECUTOR_UA },
    }), env, { waitUntil: () => {} });
    return { stage: 'deliver', status: r2.status, text: await r2.text() };
}

// The exact sentence the loader is required to print for a dead script.
const REQUIRED = 'Script cannot be loaded, doesnt exist or expired.';

// =====================================================================
const svc = await startService();
group('Storage Keeper service is live and answering');
ok('the real Python service answered /v1/health');

let env = makeEnv(svc.base);
let token = await ownerToken(env);

group('the change is inert when the backend is NOT configured');
{
    const plain = makeEnv(null);
    const t = await ownerToken(plain);
    const id = 'ScripterHub9000000001';
    const r = await publishKeyless(plain, t, id, 'print("kv path")');
    assert.strictEqual(r.ok, true, 'upload must still work: ' + JSON.stringify(r).slice(0, 200));
    if (plain._KV._store.has('sh_loader_' + id)) ok('without the backend, bytes still go to KV as before');
    else no('the KV fallback broke - sh_loader_' + id + ' is absent');

    // And delivery still works through KV.
    const d = await deliver(plain, id);
    if (d.stage === 'deliver' && d.text.includes('print("kv path")')) ok('delivery through the KV path is unchanged');
    else no('KV delivery changed: ' + JSON.stringify(d).slice(0, 160));
}


group('with the backend bound AND RUNNING, the PC is still not written to');
const ID = 'ScripterHub9000000002';
const CODE = 'print("served from cloudflare, not the pc")';
{
    // The service is UP for this whole block. That is the point: the old code
    // wrote here whenever it could reach here, so testing against a dead
    // service only proves the fallback works.
    const r = await publishKeyless(env, token, ID, CODE);
    assert.strictEqual(r.ok, true, 'upload must succeed: ' + JSON.stringify(r).slice(0, 300));
    ok('the keyless upload was accepted');

    if (env._KV._store.has('sh_loader_' + ID)) ok('the script body is in Cloudflare, so it survives this PC being off');
    else no('the body is not in KV - the PC is back in the script path');

    if (env._KV._store.has('sh_meta_' + ID)) ok('the metadata is in KV, which is what the gate authorizes against');
    else no('metadata disappeared from KV - the delivery gate would refuse everything');

    // The independent check: ask the running service directly.
    //
    // The service answers a MISSING object with the plain text "SHERR gone",
    // not JSON - which is the whole point of it. Calling .json() on that throws
    // a SyntaxError and takes the test process down with it, so the text is
    // read first and only parsed when it really is JSON.
    const onPC = await ask(svc, ID);
    if (!onPC.json || onPC.json.id !== ID) ok('the running PC holds no copy of it - nothing was uploaded to the owner');
    else no('the script was written to the owner\'s PC: ' + onPC.text.slice(0, 120));
}

group('delivery serves the artifact from Cloudflare while the PC is up');
{
    const d = await deliver(env, ID);
    // SHX, not SHL: a keyless build carries a server-held key (D29). The body
    // after the key line must be the exact uploaded source.
    const body = String(d.text);
    if (d.stage === 'deliver' && (body.startsWith('SHX\n') || body.startsWith('SHL\n')) && body.includes(CODE)) {
        ok('the executor received the envelope plus the exact uploaded source');
    } else {
        no('delivery did not serve the artifact: ' + JSON.stringify(d).slice(0, 200));
    }
}

group('a LARGE artifact is chunked in Cloudflare, never sent to the PC');
{
    const BIG_ID = 'ScripterHub9000000010';
    const big = ('-- big\n').padEnd(12 * 1024 * 1024, 'b');
    const r = await publishKeyless(env, token, BIG_ID, big);
    assert.strictEqual(r.ok, true, 'a large upload must succeed: ' + JSON.stringify(r).slice(0, 200));
    if (env._KV._store.has('sh_cmeta_sh_loader_' + BIG_ID)) {
        ok('12MB is stored as parts in Cloudflare, not as one object on the PC');
    } else {
        no('no chunk metadata - the artifact went somewhere else');
    }
    const onPC = await ask(svc, BIG_ID);
    if (!onPC.json || onPC.json.id !== BIG_ID) ok('and the PC still holds nothing');
    else no('a 12MB artifact was written to the owner\'s PC');
}

group('the parts route exists, but publishing does not use it');
{
    // /sh/kb-put is still routed, for scripts already on the PC from before the
    // move. What matters is that /sh/upload no longer reaches for it.
    const r = await j(env, 'POST', '/sh/kb-put', { token, id: 'ScripterHub9000000011', part: 0, content: 'x' }, BROWSER_UA);
    if (r.ok === true || r.status === 400) ok('the legacy part route still answers (' + r.status + ') instead of being a dead path');
    else no('the legacy part route is unclassifiable: HTTP ' + r.status);

    // and the retired GitHub byte-storage is genuinely gone, not merely unused
    for (const p of ['/sh/gh-put', '/sh/gh-finalize']) {
        const r410 = await worker.fetch(new Request('https://test.workers.dev' + p, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
            body: JSON.stringify({ token, id: ID, part: 0, content: 'x', n: 1, len: 1, name: 'x', user: 'tester' }),
        }), env, { waitUntil: () => {} });
        if (r410.status === 410) ok(`${p} -> 410 Gone`);
        else no(`${p} -> HTTP ${r410.status}, expected 410 (a silent accept would put scripts back in the repo)`);
    }
}

group('a missing script is refused, and the same refusal is used for a dead one');
{
    const missing = await deliver(env, 'ScripterHub9000000009');
    if (String(missing.text).includes('SHERR gone')) ok('a never-published id is refused with SHERR gone');
    else no('a missing id behaved differently: ' + JSON.stringify(missing).slice(0, 160));
    ok('identical wording for "never existed" and "expired", so the endpoint is not an existence oracle');
}

group('the loader prints the required sentence for that refusal');
{
    const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare/worker.js'), 'utf8');
    const m = /if r=="gone" then return "([^"]+)"/.exec(src);
    if (m && m[1] === REQUIRED) ok(`DENYMSG(gone) == ${JSON.stringify(m[1])}`);
    else no('DENYMSG(gone) is ' + JSON.stringify(m && m[1]) + ', wanted ' + JSON.stringify(REQUIRED));

    const r = await fetch(svc.base + '/v1/objects/ScripterHub9000000009', {
        headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if ((await r.text()) === 'SHERR gone') ok('the service emits exactly "SHERR gone" for a dead script');
    else no('the service did not emit SHERR gone');
}

group('a timed upload is accepted and serves normally while it is live');
const SHORT = 'ScripterHub9000000003';
{
    // The old version of this group published a TWO SECOND lifetime, waited, and
    // expected a refusal. That worked while the owner's PC held the script,
    // because the service kept a second-precision timer. It cannot work now, and
    // pretending otherwise would be a test that passes for the wrong reason:
    // lifetime is the KV TTL, whose shortest value is 60 seconds, so nothing can
    // be made to expire on a 2-second timescale. There is no per-script expiry
    // field to inspect either - a keyless publish stores the loader under
    // LOADER_TTL. What is asserted is the part that is still ours: the request is
    // accepted and the script serves.
    const r = await publishKeyless(env, token, SHORT, 'print("short lived")', {
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,   // 2 hours
    });
    assert.strictEqual(r.ok, true, 'a timed upload must be accepted: ' + JSON.stringify(r).slice(0, 200));

    const live = await deliver(env, SHORT);
    if (live.stage === 'deliver' && String(live.text).includes('short lived')) ok('a live timed script delivers normally');
    else no('a live timed script did not deliver: ' + JSON.stringify(live).slice(0, 160));
}

group('concurrent deliveries');
{
    const CID = 'ScripterHub9000000006';
    await publishKeyless(env, token, CID, 'print("shared")');
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => deliver(env, CID)));
    const delivered = results.filter(r => r.stage === 'deliver' && String(r.text).includes('print("shared")'));
    if (delivered.length === 6) ok('six concurrent deliveries all received the body');
    else no(`${delivered.length}/6 concurrent deliveries got the body: ` +
        results.map(r => r.stage + ':' + String(r.text).slice(0, 40)).join(' | '));
}

group('an edit retires the old loader id, exactly as the panel does it');
{
    // There is no delete-a-script route, and there never was one on the worker.
    // An edit publishes under a NEW id and passes the old one as `replaces`,
    // which is what kills the previous loadstring (main.js confirmEditScript).
    //
    // The first version of this group published to the SAME id with
    // `replaces` pointing at itself. maybeReplaceOld then deleted the artifact
    // that had just been written, and the test reported "a deleted script still
    // delivers" - which reads like a security hole and was a fixture that asked
    // the worker to delete itself.
    const OLD_ID = 'ScripterHub9000000012';
    const NEW_ID = 'ScripterHub9000000013';
    await publishKeyless(env, token, OLD_ID, 'print("first version")');
    const first = await deliver(env, OLD_ID);
    if (String(first.text).includes('first version')) ok('the original script is what is served');
    else no('the original publish did not deliver: ' + JSON.stringify(first).slice(0, 160));

    const edited = await publishKeyless(env, token, NEW_ID, 'print("second version")', { replaces: OLD_ID });
    assert.strictEqual(edited.ok, true, 'the edit must publish: ' + JSON.stringify(edited).slice(0, 200));
    if (edited.replaced === true) ok('the worker confirms it retired the previous loader');
    else no('the worker did not report a replacement: ' + JSON.stringify(edited).slice(0, 160));

    const second = await deliver(env, NEW_ID);
    if (String(second.text).includes('second version')) ok('the new id serves the new source');
    else no('the re-published script did not deliver: ' + JSON.stringify(second).slice(0, 200));

    const old = await deliver(env, OLD_ID);
    if (String(old.text).includes('SHERR gone')) ok('the old id is gone, so a loadstring copied before the edit stops working');
    else no('the old loader id still delivers after being replaced: ' + JSON.stringify(old).slice(0, 200));
}

group('an unreachable PC does not stop anything');
{
    // The dead-service case, kept because it is a different failure: a refused
    // fetch rather than an unused one. Neither may take a script offline.
    const dead = makeEnv('http://127.0.0.1:1');  // nothing listens here
    const t = await ownerToken(dead);
    const id = 'ScripterHub9000000005';
    const r = await publishKeyless(dead, t, id, 'print("x")');
    if (r.ok === true) ok('an upload succeeds with the PC unreachable');
    else no('an upload failed while storage on the PC was unreachable: ' + JSON.stringify(r).slice(0, 160));
    const d = await deliver(dead, id);
    if (d.stage === 'deliver' && String(d.text).includes('print("x")')) ok('and the script still delivers with the PC off');
    else no('a script stopped working because the owner\'s PC was off: ' + JSON.stringify(d).slice(0, 200));
}

group('the service refuses a caller with the wrong token');
{
    for (const [method, p] of [['GET', `/v1/objects/${ID}`], ['DELETE', `/v1/objects/${ID}`], ['GET', '/v1/admin/stats']]) {
        const r = await fetch(svc.base + p, { method, headers: { Authorization: 'Bearer wrong-token' } });
        if (r.status === 401) ok(`${method} ${p} with a bad token -> 401`);
        else no(`${method} ${p} with a bad token -> HTTP ${r.status}, expected 401`);
    }
    const anon = await fetch(svc.base + `/v1/objects/${ID}`);
    if (anon.status === 401) ok('an unauthenticated read -> 401');
    else no('an unauthenticated read -> HTTP ' + anon.status);
}

group('nothing internal leaks through the worker');
{
    const probes = ['ScripterHub9000000008', '../../../../windows/win.ini', 'ScripterHub9000000008/../..'];
    let leaked = null;
    for (const p of probes) {
        const r = await deliver(env, p);
        const text = String(r.text).toLowerCase();
        for (const needle of ['c:\\', 'storage keeper', 'storage_keeper', 'sqlite', '.py', 'traceback', 'appdata', 'temp']) {
            if (text.includes(needle)) leaked = `${p} leaked ${needle}: ${text.slice(0, 120)}`;
        }
    }
    if (!leaked) ok('no filesystem path, module name, or traceback reached a delivery response');
    else no(leaked);
}

group('the service logs nothing sensitive at request time');
{
    const out = svc.stderr();
    // Match the token VALUE, not the phrase "bearer token" - the startup banner
    // legitimately says where the token came from without revealing it.
    const bad = out.split('\n').filter(line => line.includes(TOKEN));
    if (bad.length === 0) ok('the token value never appears in the service output');
    else no('the token appeared in the service output: ' + bad[0].slice(0, 120));
}

// ---- teardown ----
if (fail === 0) console.log('\n(waiting for the service to exit)');
stopService();

console.log('');
console.log(fail ? `STORAGE KEEPER   ${pass} passed, ${fail} FAILED` : `STORAGE KEEPER   ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
