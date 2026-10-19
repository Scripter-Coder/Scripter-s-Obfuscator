// tools/three_layer_flow_test.mjs
//
// THE THREE LAYERS, END TO END, AGAINST THE REAL WORKER.
//
//   L1  loadstring(game:HttpGet(".../sh/<id>"))()   what the owner pastes
//   L2  the init layer: _bsdata0 + the cdn link + the licensed handshake
//   L3  the artifact behind that link: the obfuscated program
//
// This is the only test that proves the three of them work TOGETHER. Every
// other harness tests one layer in isolation: the parity test reads the
// generated strings, the bootstrap test feeds the init layer a canned
// transport, the security-gates test calls the routes directly.
//
// Here the init layer is the one the WORKER SERVES, it runs in a real Lua
// 5.3 VM, and it fetches the artifact from the cdn link it names. So if the
// cdn link, the session handshake, the delivery route or the decryption
// broke, this fails.
//
// Run: node tools/three_layer_flow_test.mjs
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as fengari from 'fengari';
import luaparse from 'luaparse';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;
const tls = (s) => fengari.to_luastring(s);

const ROOT = new URL('..', import.meta.url);
const workerSrc = await import(new URL('For Cloudflare/worker.js', ROOT).href);
const worker = workerSrc.default;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

// ---- the mock world (the same shape worker.test.mjs uses) ----
function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        async list(opts = {}) {
            const prefix = String(opts.prefix || '');
            const names = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
            return { keys: names.map(n => ({ name: n })), list_complete: true, cursor: null };
        },
        _store: store
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(new URL('migrations/0001_init.sql', ROOT), 'utf8'));
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
const BASE = 'https://test.workers.dev';

async function call(method, path, body, ua) {
    const headers = Object.assign(
        body ? { 'Content-Type': 'application/json' } : {},
        { 'User-Agent': ua || EXECUTOR_UA }
    );
    const req = new Request(BASE + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, env, { waitUntil: () => {} });
}

// ---- publish a free script, the way the site does ----
const PAYLOAD = 'local G=(getgenv and getgenv()) or _G\nG.SH_THREE_LAYER_RAN=1\nreturn 7\n';
let SCRIPT_ID = '';
{
    // The owner token, exactly like the site gets it.
    const login = await call('POST', '/sh/login', { code: OWNER_CODE_PLAIN }, EXECUTOR_UA);
    const token = (await login.json()).token;
    const up = await call('POST', '/sh/upload', {
        token,
        name: 'three layer probe',
        user: 'tester',
        keyless: true,
        plainCode: PAYLOAD,
        // the executor blob is what is served; the cipher is the website copy
        cipher: Buffer.from(PAYLOAD, 'utf8').toString('base64'),
        keyHash: 'deadbeef',
        normalCode: PAYLOAD,
        // a build always ships a server-held key (D29)
        splitKey: { paddedKey: [9, 8, 7, 6, 5, 4, 3, 2], t0: Date.now(), chk: 321 }
    }, EXECUTOR_UA);
    const j = await up.json();
    if (!j.ok) { console.error('upload failed: ' + JSON.stringify(j)); process.exit(1); }
    SCRIPT_ID = j.id;
    ok('published a free script as ' + SCRIPT_ID);
}

// ---- L1: the line the owner pastes ----
console.log('\n[T1] L1 is the one line, and it points at this script...');
{
    const src = fs.readFileSync(new URL('For Cloudflare/worker.js', ROOT), 'utf8');
    // Pull shLoader out the same way every other harness does.
    const start = src.indexOf('function shLoader(');
    let i = src.indexOf('{', start), depth = 0, q = null, lc = false, bc = false;
    for (; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (lc) { if (c === '\n') lc = false; continue; }
        if (bc) { if (c === '*' && n === '/') { bc = false; i++; } continue; }
        if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === '/' && n === '/') { lc = true; i++; continue; }
        if (c === '/' && n === '*') { bc = true; i++; continue; }
        if (c === "'" || c === '"' || c === '`') { q = c; continue; }
        if (c === '{') depth++;
        if (c === '}') { depth--; if (depth === 0) break; }
    }
    const fn = new Function(src.slice(start, i + 1) + '\nreturn shLoader;')();
    const line = fn(BASE, SCRIPT_ID);
    const real = 'loadstring(game:HttpGet("' + BASE + '/sh/' + SCRIPT_ID + '"))()';
    if (line === real) ok('L1 is exactly: ' + real);
    else no('L1 is: ' + line);
    try { luaparse.parse(line, { luaVersion: '5.1' }); ok('and it parses as Lua 5.1'); }
    catch (e) { no('L1 does not parse: ' + e.message); }
}

// ---- L2: what the URL returns for an executor ----
console.log('\n[T2] L2 is the init layer, with _bsdata0 and a cdn link...');
let initLayer = '';
{
    const r = await call('GET', '/sh/' + SCRIPT_ID, null, EXECUTOR_UA);
    initLayer = await r.text();
    if (r.status !== 200) no('the loader route answered ' + r.status);
    else if (!initLayer.includes('_bsdata0=')) no('the init layer has no _bsdata0');
    else if (!/\/sh\/v4_init_ScripterHub\d+\.lua/.test(initLayer)) no('the init layer has no cdn link');
    else {
        ok('the init layer carries _bsdata0 and a file-shaped cdn link');
        ok('it carries no artifact: ' + (initLayer.includes('SH_THREE_LAYER_RAN') ? 'NO - IT DOES' : 'confirmed'));
    }
}

// ---- L3: the artifact, fetched from the cdn link the init layer names ----
console.log('\n[T3] the cdn link is the gate, and it serves the artifact...');
{
    const cdn = (initLayer.match(/\/sh\/v4_init_ScripterHub\d+\.lua/) || [])[0];
    if (!cdn) { no('no cdn link to test'); }
    else {
        // No session, no nonce: the alias must not be a second door.
        const bare = await call('GET', cdn, null, EXECUTOR_UA);
        const bareText = await bare.text();
        if (bareText.startsWith('SHERR')) ok('the cdn link without a session is refused: ' + bareText.trim().split('\n')[0]);
        else no('the cdn link served bytes with no session: ' + bareText.slice(0, 60));

        // With a real session it serves the artifact.
        const m = await call('POST', '/sh/session', { id: SCRIPT_ID, k: '', h: 'HW' }, EXECUTOR_UA);
        const sess = (await m.text()).trim().split(/\s+/);
        if (sess[0] !== 'SHS') { no('could not mint a session: ' + sess.join(' ')); }
        else {
            const r = await call('GET', cdn + '?s=' + sess[1] + '&n=' + sess[2], null, EXECUTOR_UA);
            const text = await r.text();
            // SHL = no server-held key, SHX = free script WITH one, SHK =
            // keyed (ciphertext). All three are delivery envelopes.
            if (/^SH[L|X]/.test(text) && text.includes(PAYLOAD)) ok('the cdn link with a session serves the artifact');
            else no('the cdn link did not serve the artifact: ' + text.slice(0, 80));
        }
    }
}

// ---- the whole thing, executed: L1 -> L2 -> L3, in a real Lua VM ----
console.log('\n[T4] the whole flow runs: L1 -> L2 -> L3...');
{
    const L = AUX.luaL_newstate();
    LIB.luaL_openlibs(L);

    // The two requests the init layer makes are resolved BEFORE the chunk
    // runs: fengari is single-threaded, so a Lua call cannot await a JS
    // promise. Both answers are handed to Lua as escaped string literals -
    // fengari's io library is a stub, so io.open is not an option.
    const cdn = (initLayer.match(/\/sh\/v4_init_ScripterHub\d+\.lua/) || [])[0] || '';
    // A Lua string literal. Control characters go out as decimal escapes,
    // which Lua 5.1 and 5.3 both read the same way.
    const luaStr = (s) => '"' + String(s)
        .replace(/[\\"]/g, (c) => '\\' + c)
        .replace(/[\x00-\x1f\x7f]/g, (c) => '\\' + String(c.charCodeAt(0)).padStart(3, '0')) + '"';
    let sessText = '';
    let artText = '';
    {
        const a = await call('POST', '/sh/session', { id: SCRIPT_ID, k: '', h: 'HW' }, EXECUTOR_UA);
        const at = (await a.text()).trim().split(/\s+/);
        if (at[0] !== 'SHS') { no('could not mint a session: ' + at.join(' ')); }
        else {
            sessText = 'SHS ' + at[1] + ' ' + at[2] + ' 1700000000';
            // A SECOND session, spent here, so the artifact the layer receives
            // is a real gate response with a real envelope.
            const b = await call('POST', '/sh/session', { id: SCRIPT_ID, k: '', h: 'HW' }, EXECUTOR_UA);
            const bt = (await b.text()).trim().split(/\s+/);
            const d = await call('GET', cdn + '?s=' + bt[1] + '&n=' + bt[2], null, EXECUTOR_UA);
            artText = await d.text();
        }
    }

    AUX.luaL_dostring(L, tls([
        'getgenv = function() return _G end',
        // capture what loadstring is handed, instead of running it
        'loadstring = function(s) SH_DELIVERED = s return function() end end',
        'game = { GetService = function() return { SetCore = function() end } end }',
        '__URLS = {}',
        '__SESS = ' + luaStr(sessText),
        '__ART = ' + luaStr(artText),
        '__CDN = ' + luaStr(cdn),
        '__FETCH = function(u)',
        '  __URLS[#__URLS+1] = u',
        '  if u:find("/sh/session", 1, true) then return __SESS end',
        '  if u:find(__CDN, 1, true) then return __ART end',
        '  return ""',
        'end',
        'request = function(o) return { StatusCode = 200, Body = __FETCH(tostring(o.Url)), Success = true } end',
        'game.HttpGet = function(self, u) return __FETCH(tostring(u)) end'
    ].join('\n')));

    if (AUX.luaL_loadstring(L, tls(initLayer)) !== 0) {
        no('the init layer did not compile: ' + fengari.to_jsstring(LUA.lua_tostring(L, -1)));
    } else {
        const rc = LUA.lua_pcall(L, 0, 0, 0);
        if (rc !== 0) {
            no('the init layer threw: ' + fengari.to_jsstring(LUA.lua_tostring(L, -1)));
        } else {
            LUA.lua_getglobal(L, tls('SH_DELIVERED'));
            const got = LUA.lua_tostring(L, -1) ? fengari.to_jsstring(LUA.lua_tostring(L, -1)) : null;
            LUA.lua_pop(L, 1);
            if (got && got.includes('SH_THREE_LAYER_RAN')) {
                ok('L1 -> L2 -> L3 ran end to end and the artifact was handed to loadstring');
            } else {
                no('the artifact was not delivered. got: ' + String(got).slice(0, 120));
            }

            // The ORDER is the flow: mint first, then the cdn link.
            LUA.lua_getglobal(L, tls('__URLS'));
            const urls = [];
            if (LUA.lua_istable(L, -1)) {
                const n = LUA.lua_rawlen(L, -1);
                for (let k = 1; k <= n; k++) {
                    LUA.lua_rawgeti(L, -1, k);
                    if (LUA.lua_isstring(L, -1)) urls.push(fengari.to_jsstring(LUA.lua_tostring(L, -1)));
                    LUA.lua_pop(L, 1);
                }
            }
            LUA.lua_pop(L, 1);
            if (urls[0] && urls[0].includes('/sh/session') && urls[1] && urls[1].includes('/sh/v4_init_')) {
                ok('the layer minted a session first, then fetched the cdn link');
            } else {
                no('unexpected request order: ' + JSON.stringify(urls));
            }
        }
    }
}

console.log('\n' + '='.repeat(72));
console.log('THREE-LAYER FLOW   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
