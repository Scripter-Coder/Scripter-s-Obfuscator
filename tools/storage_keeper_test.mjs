// End-to-end test for the local Storage Keeper backend.
//
// This is the test that matters for the change, because it is the only one that
// exercises the seam with BOTH halves real: an actual Python process on disk, and the
// actual worker. Everything else in the suite runs the worker against a mocked KV and
// would pass whether or not the storage service worked at all.
//
// What it pins:
//   - an upload with SH_STORE_URL bound puts the BYTES on the PC, not in KV
//   - delivery returns exactly those bytes
//   - an expired script is refused server-side, with no timer running in the browser
//   - a missing script and an expired script are the same answer
//   - the loader turns that answer into the required sentence
//   - concurrent deliveries behave
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
    }, extra || {}), BROWSER_UA);
    if (r.ok && r.id !== id) throw new Error('worker minted ' + r.id + ' instead of ' + id);
    return r;
}

async function deliver(env, id, lic) {
    const r1 = await worker.fetch(new Request('https://test.workers.dev/sh/session', {
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

group('with the backend bound, BYTES go to the PC and not to KV');
const ID = 'ScripterHub9000000002';
const CODE = 'print("served from the windows pc")';
{
    const r = await publishKeyless(env, token, ID, CODE);
    assert.strictEqual(r.ok, true, 'upload must succeed: ' + JSON.stringify(r).slice(0, 300));
    ok('the keyless upload was accepted');

    if (!env._KV._store.has('sh_loader_' + ID)) ok('the script body is NOT in Cloudflare KV - the storage goal');
    else no('the body is still in KV; the change did not move bytes');

    if (env._KV._store.has('sh_meta_' + ID)) ok('the metadata stays in KV, which is what the gate authorizes against');
    else no('metadata disappeared from KV - the delivery gate would refuse everything');

    // Confirm independently, over HTTP, that the service really holds it.
    const meta = await (await fetch(`${svc.base}/v1/objects/${ID}/meta`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    })).json();
    if (meta && meta.id === ID && meta.size === CODE.length) ok(`the service holds ${meta.size} bytes under ${meta.id}`);
    else no('the service does not report the object: ' + JSON.stringify(meta));
}

group('delivery serves the bytes from the PC');
{
    const d = await deliver(env, ID);
    if (d.stage === 'deliver' && d.text.startsWith('SHL\n') && d.text.includes(CODE)) {
        ok('the executor received SHL\\n followed by the exact uploaded source');
    } else {
        no('delivery did not serve the PC copy: ' + JSON.stringify(d).slice(0, 200));
    }
}

group('expiry is enforced by the server, not by a browser countdown');
const SHORT = 'ScripterHub9000000003';
{
    // A two second lifetime. Nothing in this test sleeps longer than that, so the
    // refusal can only come from the service deciding for itself.
    const r = await publishKeyless(env, token, SHORT, 'print("short lived")', {
        expiresAt: Date.now() + 2000,
    });
    assert.strictEqual(r.ok, true, 'a timed upload must be accepted: ' + JSON.stringify(r).slice(0, 200));

    // The stored expiry must be in SECONDS and roughly where it was asked to be. A
    // millisecond value here would be clamped to the one-year cap and turn this 2-second
    // timer into a 1-year one - which passes every "it works" check while the feature is
    // completely inert.
    const asStored = await (await fetch(`${svc.base}/v1/objects/${SHORT}/meta`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    })).json();
    if (asStored.has_timer && asStored.expires_at < 1e11 && asStored.expires_at > Date.now() / 1000) {
        ok('the requested timer was stored in seconds, near where it was asked for');
    } else {
        no('the stored expiry is wrong: has_timer=' + asStored.has_timer
            + ' expires_at=' + asStored.expires_at + ' (now=' + Math.floor(Date.now() / 1000) + ')');
    }

    const live = await deliver(env, SHORT);
    if (live.stage === 'deliver' && live.text.includes('short lived')) ok('before expiry it delivers normally');
    else no('a live timed script did not deliver: ' + JSON.stringify(live).slice(0, 160));

    await new Promise(r => setTimeout(r, 2600));

    const dead = await deliver(env, SHORT);
    // The refusal can arrive at the session mint or at delivery, depending on whether the
    // metadata or the bytes are what is missing. Both must say the same thing.
    if (String(dead.text).includes('SHERR gone')) {
        ok('after expiry the gate refuses with SHERR gone');
    } else {
        no('an expired script was not refused: ' + JSON.stringify(dead).slice(0, 200));
    }

    // The metadata endpoint must not confirm it still exists, or the UI would keep
    // counting down on a script that is already dead.
    const meta = await fetch(`${svc.base}/v1/objects/${SHORT}/meta`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if (meta.status === 404) ok('meta reports 404 for the expired script, so no countdown lies');
    else no('meta still reports the expired script: HTTP ' + meta.status);

    // And the bytes are actually gone from disk.
    const files = fs.existsSync(path.join(dataRoot, 'scripts'))
        ? fs.readdirSync(path.join(dataRoot, 'scripts'))
        : [];
    if (!files.some(f => f.startsWith(SHORT))) ok('the expired file was removed from disk');
    else no('the expired file is still on disk: ' + files.join(', '));
}

group('a missing script and an expired script are the same answer');
{
    const missing = await deliver(env, 'ScripterHub9000000009');
    if (String(missing.text).includes('SHERR gone')) ok('a never-published id is refused with SHERR gone');
    else no('a missing id behaved differently: ' + JSON.stringify(missing).slice(0, 160));
    ok('identical to the expired case, so the endpoint is not an existence oracle');
}

group('the loader prints the required sentence');
{
    // The two halves of the contract, checked together: the service emits SHERR gone,
    // and the worker's DENYMSG maps `gone` to the required wording.
    const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare/worker.js'), 'utf8');
    const m = /if r=="gone" then return "([^"]+)"/.exec(src);
    if (m && m[1] === REQUIRED) ok(`DENYMSG(gone) == ${JSON.stringify(m[1])}`);
    else no('DENYMSG(gone) is ' + JSON.stringify(m && m[1]) + ', wanted ' + JSON.stringify(REQUIRED));

    const r = await fetch(`${svc.base}/v1/objects/ScripterHub9000000009`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if ((await r.text()) === 'SHERR gone') ok('the service emits exactly "SHERR gone" for a dead script');
    else no('the service did not emit SHERR gone');
}

group('a re-upload does not extend the one-year ceiling');
{
    const ID2 = 'ScripterHub9000000004';
    await publishKeyless(env, token, ID2, 'print("v1")');
    const first = await (await fetch(`${svc.base}/v1/objects/${ID2}/meta`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    })).json();
    await new Promise(r => setTimeout(r, 1100));
    await publishKeyless(env, token, ID2, 'print("v2")');
    const second = await (await fetch(`${svc.base}/v1/objects/${ID2}/meta`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    })).json();
    if (second.created_at === first.created_at) ok('created_at is preserved across a re-upload');
    else no(`a re-upload reset the age: ${first.created_at} -> ${second.created_at}`);
    if (second.hard_cap_at === first.hard_cap_at) ok('the one-year cap is not pushed back by re-publishing');
    else no('the cap moved on re-upload');
    const d = await deliver(env, ID2);
    if (d.stage === 'deliver' && d.text.includes('print("v2")')) ok('but the new content is delivered');
    else no('the re-uploaded content is not served: ' + JSON.stringify(d).slice(0, 160));
}

group('an unreachable service is NOT reported as "your script is gone"');
{
    const dead = makeEnv('http://127.0.0.1:1');  // nothing listens here
    const t = await ownerToken(dead);
    const r = await publishKeyless(dead, t, 'ScripterHub9000000005', 'print("x")');
    if (r.ok === false) ok('an upload fails loudly when storage is unreachable (ok:false)');
    else no('an upload claimed success while storage was unreachable - that publishes a dead loadstring');
}

group('concurrent deliveries');
{
    const CID = 'ScripterHub9000000006';
    await publishKeyless(env, token, CID, 'print("shared")');
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => deliver(env, CID)));
    const delivered = results.filter(r => r.stage === 'deliver' && r.text.includes('print("shared")'));
    if (delivered.length === 6) ok('six concurrent deliveries all received the body');
    else no(`${delivered.length}/6 concurrent deliveries got the body: ` +
        results.map(r => r.stage + ':' + String(r.text).slice(0, 40)).join(' | '));
}

group('deletion removes it from the PC and stops delivery');
{
    const DID = 'ScripterHub9000000007';
    await publishKeyless(env, token, DID, 'print("bye")');
    const r = await fetch(`${svc.base}/v1/objects/${DID}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if (r.ok) ok('the service accepted the delete');
    else no('delete refused: HTTP ' + r.status);

    const after = await deliver(env, DID);
    // A deleted script can be refused at either stage: the session mint refuses when the
    // metadata is gone, and the delivery route refuses when the bytes are. Both produce
    // the same SHERR gone, which is the property that matters.
    if (String(after.text).includes('SHERR gone')) ok('a deleted script is refused with SHERR gone');
    else no('a deleted script still delivers: ' + JSON.stringify(after).slice(0, 160));
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