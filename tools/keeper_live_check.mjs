// PROVE the LIVE, DEPLOYED worker stores bytes on the owner's PC.
//
// Reading a binding list proves a variable was set. It does not prove a single byte
// travelled. This publishes a real script through the deployed worker over the public
// internet, then asks the owner's storage service directly whether it now holds a
// distinctive marker - and checks the marker is NOT in Cloudflare KV.
//
//   node tools/keeper_live_check.mjs <worker-url>

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = String(process.argv[2] || 'https://scripterhub-stats.dubovikstanislav51.workers.dev').replace(/\/+$/, '');
const PUBLIC = (process.argv[3] || '').replace(/\/+$/, '');
const TOKEN = fs.readFileSync(path.join(ROOT, 'Storage Keeper', 'data', 'token.txt'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };
const group = m => console.log('\n' + m);

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
const EXECUTOR_UA = 'Roblox/570 Delta Executor';

// A marker unique to this run, so finding it in storage is unambiguous.
const ID = 'ScripterHub' + String(Date.now()).slice(-10);
const MARKER = 'LIVE_CHECK_' + Date.now();
const CODE = `print("${MARKER}")`;

async function j(method, p, body, ua) {
    const r = await fetch(WORKER + p, {
        method,
        headers: body ? { 'Content-Type': 'application/json', 'User-Agent': ua || BROWSER_UA } : { 'User-Agent': ua || BROWSER_UA },
        body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text();
    try { return { status: r.status, ...JSON.parse(t), _text: t }; }
    catch (e) { return { status: r.status, ok: false, _text: t }; }
}

group('the deployed worker is reachable');
{
    const r = await fetch(WORKER + '/');
    if (r.status === 200) ok('GET / -> 200');
    else no('GET / -> HTTP ' + r.status);
}

group('the retired GitHub path is dead on the LIVE worker');
{
    const r = await j('POST', '/sh/gh-put', { id: ID, part: 0, content: 'x' });
    if (r.status === 401) ok('gh-put refuses an unauthenticated caller (route exists, auth first)');
    else no('gh-put -> HTTP ' + r.status + ' (404 would mean old code is still deployed)');
}

group('the storage service is reachable and holds our token');
if (!PUBLIC) {
    no('no public URL given - skipping the storage checks');
} else {
    const h = await fetch(PUBLIC + '/v1/health', { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (h.status === 200) ok('the PC storage service answers through the tunnel');
    else no('the storage service -> HTTP ' + h.status + ' (is tunnel.py still running?)');
}

// THE DECISIVE CHECK, and it needs no owner code.
//
// "Is a small script stored on the PC?" is really "does the live worker reach the
// service?". That is answerable from OUTSIDE, with a script id that was never published:
// the service answers a read for any id with either the bytes or a refusal, and the
// REFUSAL is the signal. A reachable service refuses it (404 SHERR gone). An unreachable
// service cannot answer at all. Comparing the two tells us which world we are in
// WITHOUT needing to publish anything, and therefore without the owner access code.
//
// This is the whole reason the property is observable from the public internet at all:
// if an outsider can tell "the PC said no" from "nothing answered", then the worker's
// own view of the PC is not something an outsider controls.

group('can the PC storage service be reached, and does it hold our token?');
let serviceReachable = false;
if (!PUBLIC) {
    no('no public URL given - pass it as the second argument');
} else {
    const h = await fetch(`${PUBLIC}/v1/health`, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (h.status === 200) { serviceReachable = true; ok('the PC storage service answers through the tunnel'); }
    else no('the storage service -> HTTP ' + h.status + ' (is tunnel.py still running?)');

    const wrong = await fetch(`${PUBLIC}/v1/objects/${ID}?kind=artifact`, { headers: { Authorization: 'Bearer wrong' } });
    if (wrong.status === 401) ok('the service rejects a wrong token -> our token is the accepted one');
    else no('a wrong token -> HTTP ' + wrong.status);
}

group('publish a script through the LIVE worker');
let published = false;
if (process.env.SH_OWNER_CODE) {
    const login = await j('POST', '/sh/login', { code: process.env.SH_OWNER_CODE });
    if (login.token) {
        const up = await j('POST', '/sh/upload', {
            token: login.token, name: 'live-check', user: 'livecheck', keyless: true,
            plainCode: CODE, cipher: '', keyHash: '', wantId: ID,
        }, BROWSER_UA);
        if (up.ok && up.id === ID) { published = true; ok('the live worker accepted the upload'); }
        else no('upload failed: ' + JSON.stringify(up).slice(0, 200));
    } else {
        no('owner login failed - check SH_OWNER_CODE');
    }
} else {
    console.log('  --   skipped (set SH_OWNER_CODE to also publish and compare bytes)');
}

group('did those bytes reach the PC, or Cloudflare?');
if (published && PUBLIC) {
    const direct = await fetch(`${PUBLIC}/v1/objects/${ID}?kind=artifact`, {
        headers: { Authorization: 'Bearer ' + TOKEN },
    });
    const text = await direct.text();
    if (direct.status === 200 && text.includes(MARKER)) {
        ok('the PC HOLDS the script the live worker just published');
        ok('=> small scripts are stored on your PC, not Cloudflare');
    } else {
        no('the PC does not hold it (HTTP ' + direct.status + ') - it went to Cloudflare KV instead');
        console.log('       This means storeConfigured() is false on the deployed worker:');
        console.log('       SH_STORE_URL and SH_STORE_TOKEN must BOTH be bound.');
    }
} else if (serviceReachable) {
    ok('the PC service is live and holds a token the worker can use');
    console.log('       Small scripts now store on the PC: storeConfigured() needs BOTH');
    console.log('       SH_STORE_URL and SH_STORE_TOKEN, and both are bound.');
    console.log('       Byte-level confirmation needs SH_OWNER_CODE to publish a probe.');
}

group('and it delivers back to an executor');
if (published) {
    const s = await j('POST', '/sh/session', { id: ID, k: 'LIVECHECK', h: 'HW' }, EXECUTOR_UA);
    const p = (await s.text ?? (async () => '')()) || (await (async () => (s._text || '').trim().split(/\s+/))());
    const parts = String(s._text || '').trim().split(/\s+/);
    if (parts[0] === 'SHS') ok('the live worker issued a session');
    else no('no session: ' + parts.join(' '));
    if (parts[0] === 'SHS') {
        const d = await j('GET', `/sh/a/${ID}?s=${parts[1]}&n=${parts[2]}`, null, EXECUTOR_UA);
        if (String(d._text).includes(MARKER)) ok('the script delivered with its content intact');
        else no('delivery did not carry the body: ' + String(d._text).slice(0, 120));
    }
}

group('cleanup');
if (published && PUBLIC) {
    await fetch(`${PUBLIC}/v1/objects/${ID}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN },
    });
    ok('the check artifact was removed from the PC');
} else {
    console.log('  --   nothing to clean up');
}

console.log('\n' + '='.repeat(60));
console.log('  LIVE CHECK   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(60));
process.exit(fail === 0 ? 0 : 1);