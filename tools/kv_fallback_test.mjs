// A script stored on the owner's PC must not take the KV catalogue down with it.
//
// THE BUG THIS GUARDS
// Binding SH_STORE_URL switched delivery from "read KV" to "read the PC", with no
// fallback. A script published BEFORE the storage move has its bytes in KV and no
// record on the PC, so the PC answered "not here" and delivery refused - taking 71
// working scripts offline the moment the variable was set, with nothing but a
// console.error to show for it.
//
// That is the exact failure the change promised not to cause ("existing users/scripts
// should be migrated safely rather than silently deleted"), and it was invisible to
// every existing test because they all published a script and read back the same one.
//
// The property, stated once: a script resolves if EITHER backend holds it, and the PC
// is tried first.
//
// Run: node tools/kv_fallback_test.mjs

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(pathToFileURL(path.join(ROOT, 'For Cloudflare', 'worker.js')).href)).default;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };
const group = m => console.log('\n' + m);

const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

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

// A stand-in for the owner's PC. `held` is what the service "has".
function makeKeeper(held) {
    return async (url, init) => {
        const method = (init && init.method) || 'GET';
        const u = new URL(url);
        if (u.pathname === '/v1/health') return new Response('{"ok":true}', { status: 200 });
        const kind = u.searchParams.get('kind') || 'artifact';
        const key = u.pathname.replace('/v1/objects/', '') + '|' + kind;
        if (method === 'GET') {
            if (Object.prototype.hasOwnProperty.call(held, key)) {
                return new Response(held[key], { status: 200 });
            }
            return new Response('SHERR gone', { status: 404 });
        }
        return new Response('{}', { status: 200 });
    };
}

async function deliver(env, id) {
    const s = await worker.fetch(new Request('https://t.workers.dev/sh/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': EXECUTOR_UA },
        body: JSON.stringify({ id, k: '', h: 'HW' }),
    }), env, { waitUntil: () => {} });
    const p = (await s.text()).trim().split(/\s+/);
    if (p[0] !== 'SHS') return { stage: 'session', text: p.join(' ') };
    const d = await worker.fetch(new Request(`https://t.workers.dev/sh/a/${id}?s=${p[1]}&n=${p[2]}`, {
        headers: { 'User-Agent': EXECUTOR_UA },
    }), env, { waitUntil: () => {} });
    return { stage: 'deliver', status: d.status, text: await d.text() };
}

function buildEnv({ keeper, held }) {
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV,
        SH_BASE_URL: 'https://t.workers.dev',
        SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 'fallback-test-secret',
        SH_DB: makeD1(),
    };
    if (keeper) {
        env.SH_STORE_URL = 'http://keeper.invalid';
        env.SH_STORE_TOKEN = 't'.repeat(32);
        const real = globalThis.fetch;
        globalThis.fetch = (u, i) => (String(u).startsWith('http://keeper.invalid') ? makeKeeper(held)(u, i) : real(u, i));
    }
    return { env, KV };
}

const LEGACY_ID = 'ScripterHub0101010101';
const LEGACY_BODY = 'print("I am an old KV script")';

group('a PRE-MIGRATION script (bytes in KV) still delivers');
{
    const { env, KV } = buildEnv({ keeper: true, held: {} });   // PC holds nothing
    KV._store.set('sh_loader_' + LEGACY_ID, LEGACY_BODY);
    KV._store.set('sh_meta_' + LEGACY_ID, JSON.stringify({ name: 'old', user: 'u', at: Date.now(), keyless: true }));

    const r = await deliver(env, LEGACY_ID);
    if (r.stage === 'deliver' && r.text.includes('I am an old KV script')) {
        ok('the keeper holds nothing, and the script still delivered from KV');
    } else {
        no('REFUSED a script that is safely in KV: ' + JSON.stringify(r).slice(0, 140));
    }
    globalThis.fetch = globalThis.__realFetch || globalThis.fetch;
}

group('a script stored ONLY on the PC still delivers');
{
    const { env, KV } = buildEnv({ keeper: true, held: { [LEGACY_ID + '|artifact']: 'print("from the owners PC")' } });
    KV._store.set('sh_meta_' + LEGACY_ID, JSON.stringify({ name: 'new', user: 'u', at: Date.now(), keyless: true }));
    // deliberately NOT in KV

    const r = await deliver(env, LEGACY_ID);
    if (r.stage === 'deliver' && r.text.includes('from the owners PC')) ok('served from the PC');
    else no('a PC-stored script did not deliver: ' + JSON.stringify(r).slice(0, 140));
}

group('the PC is preferred when BOTH have it');
{
    const { env, KV } = buildEnv({ keeper: true, held: { [LEGACY_ID + '|artifact']: 'print("the PC copy")' } });
    KV._store.set('sh_loader_' + LEGACY_ID, 'print("the stale KV copy")');
    KV._store.set('sh_meta_' + LEGACY_ID, JSON.stringify({ name: 'x', user: 'u', at: Date.now(), keyless: true }));

    const r = await deliver(env, LEGACY_ID);
    if (r.text.includes('the PC copy')) ok('the PC copy wins - a re-upload is what actually runs');
    else no('did not prefer the PC copy: ' + JSON.stringify(r).slice(0, 140));
}

group('with the keeper OFF, nothing changes');
{
    const { env, KV } = buildEnv({ keeper: false, held: {} });
    KV._store.set('sh_loader_' + LEGACY_ID, 'print("kv only, unconfigured")');
    KV._store.set('sh_meta_' + LEGACY_ID, JSON.stringify({ name: 'x', user: 'u', at: Date.now(), keyless: true }));
    const r = await deliver(env, LEGACY_ID);
    if (r.text.includes('kv only, unconfigured')) ok('KV path untouched');
    else no('the unconfigured path changed: ' + JSON.stringify(r).slice(0, 140));
}

group('a script that exists NOWHERE is still refused');
{
    const { env } = buildEnv({ keeper: true, held: {} });
    const r = await deliver(env, 'ScripterHub0202020202');
    if (String(r.text).includes('SHERR gone')) ok('refused, not served empty: ' + String(r.text).trim());
    else no('a missing script produced something else: ' + JSON.stringify(r).slice(0, 140));
}

console.log('\n' + '='.repeat(64));
console.log('  KV FALLBACK   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(64));
process.exit(fail === 0 ? 0 : 1);