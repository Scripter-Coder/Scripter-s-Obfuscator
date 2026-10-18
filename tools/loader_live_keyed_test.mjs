// THE LOADER, RUN FOR REAL, AGAINST A REAL DELIVERY.
//
// WHAT THIS ASSERTS
//
// The server can encrypt a body the loader's own DEC() opens. That was proved
// in keyed_delivery_test.mjs, and it is not what the owner sees. What he sees is
// a notification reading:
//
//     ScripterHub - Wrong Special Key, or the delivery was tampered with.
//
// which is emitted by exactly one line of the bootstrap:
//
//     src=DEC(K)
//     if not src then DIE("Wrong Special Key, or the delivery was tampered with.")
//
// So the question this answers is not "is the cipher symmetric" - it is
// "does the loader, given the bytes the worker actually sends, produce the
// artifact". Anything in between can be the culprit: the envelope header, the
// line the body starts on, base64 vs raw, a chain reassembled in the wrong
// order, or the key arriving mangled.
//
// SO THIS EXECUTES THE SHIPPED BOOTSTRAP. Not a reimplementation of it, and not
// the cipher alone - the whole file, fetched the way an executor fetches it,
// with the real delivery injected in place of the network. If the bootstrap
// cannot run the artifact, this fails, and the reason it prints is the reason
// the owner is looking at.
//
// Run: node tools/loader_live_keyed_test.mjs

import fs from 'node:fs';
import fengari from 'fengari';

const WORKER = process.env.SH_WORKER || 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const SCRIPT_ID = process.env.SH_SCRIPT_ID || '';
const LICENCE = process.env.SH_LICENCE || '';
const HWID = process.env.SH_HWID || '';
const UA = 'Roblox/WinInet (https://www.roblox.com)';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

console.log('[LL] the shipped bootstrap runs a real delivery');
console.log('-'.repeat(72));

if (!SCRIPT_ID || !LICENCE) {
    console.log('');
    console.log('SKIPPED - needs a live keyed script and a licence for it.');
    console.log('  SH_SCRIPT_ID=<id> SH_LICENCE=<key> SH_HWID=<hwid> node tools/loader_live_keyed_test.mjs');
    console.log('');
    console.log('LIVE LOADER   skipped (no credentials given)');
    process.exit(0);
}

// --- the bootstrap, fetched the way an executor fetches it ------------------
const bootRes = await fetch(`${WORKER}/sh/${SCRIPT_ID}`, { headers: { 'User-Agent': UA } });
const boot = await bootRes.text();
check('the bootstrap is served', bootRes.status === 200 && boot.length > 500,
    bootRes.status + ' / ' + boot.length + ' bytes');
check('it really is the loader', boot.includes('ScripterHub session loader'));

// --- a real session and a real delivery -------------------------------------
const sessRes = await fetch(`${WORKER}/sh/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ id: SCRIPT_ID, k: LICENCE, h: HWID }),
});
const sessText = (await sessRes.text()).trim();
const [, sid, nonce] = sessText.split(/\s+/);
check('a licence mints a session', sessText.startsWith('SHS '), sessText.slice(0, 90));

let delivery = '';
if (sid && nonce) {
    const d = await fetch(`${WORKER}/sh/a/${SCRIPT_ID}?s=${sid}&n=${nonce}`, { headers: { 'User-Agent': UA } });
    delivery = await d.text();
}
check('the delivery arrives', delivery.length > 100, delivery.slice(0, 60));
check('and it is an SHK envelope, which is what the keyed branch expects',
    delivery.startsWith('SHK\n'), JSON.stringify(delivery.slice(0, 20)));

// --- run the SHIPPED bootstrap, with the network stubbed --------------------
//
// The only things replaced are the two functions that touch the network. Every
// line of decision logic - envelope parsing, the branch selection, DEC, the
// split-key handoff, loadstring - is the shipped code, byte for byte.
const LUA = fengari.lua, AUX = fengari.lauxlib;

const prelude = `
local NOTIFS = {}
local HTTP  = __HTTP__
local POST  = __POST__
getgenv = function() return _G end
game = {
  Shutdown = function() end,
  GetService = function() return setmetatable({}, {__index=function() return function() end end}) end,
  HttpGet = function(u, g) return HTTP(u) end,
}
if identifyexecutor then identifyexecutor = function() return "executor" end end
request = function(o)
  local body
  if o.Method == "POST" then body = POST(o.Url, o.Body and o.Headers and o.Headers["Content-Type"]) end
  if not body then body = HTTP(o.Url) end
  return { StatusCode = 200, Body = body, Success = true }
end
`;

// The session endpoint answer the bootstrap will ask for, pre-baked so the
// bootstrap's own retry logic runs against a real pair rather than being stubbed
// out of existence.
const POSTS = [];
const postAnswer = `SHS ${sid} ${nonce} exh ${Date.now() + 45000}`;

function runBootstrap() {
    const st = AUX.luaL_newstate();
    fengari.lualib.luaL_openlibs(st);

    const http = (u) => {
        const url = String(u);
        if (url.indexOf('/sh/a/') !== -1) return delivery;
        return '';
    };
    const post = (u) => { POSTS.push(String(u)); return postAnswer; };

    const src = prelude
        .replace('__HTTP__', LuaFunc(http))
        .replace('__POST__', LuaFunc(post))
        + '\n' + boot;

    if (AUX.luaL_loadbuffer(st, fengari.to_luastring(src), null, fengari.to_luastring('@bootstrap')) !== 0) {
        return { loadError: String(LUA.lua_tojsstring(st, -1)).slice(0, 400) };
    }
    if (LUA.lua_pcall(st, 0, 0, 0) !== 0) {
        return { runError: String(LUA.lua_tojsstring(st, -1)).slice(0, 400) };
    }
    // What the bootstrap handed to loadstring.
    const got = LUA.lua_getglobal(st, fengari.to_luastring('__SH_DELIVERED_SRC'));
    const val = got ? LUA.lua_tojsstring(st, -1) : null;
    return { src: val === 'nil' ? null : val, posts: POSTS.slice() };
}

// A Lua callable that calls a JS function.
function LuaFunc(fn) {
    return fengari.lua.lua_pushjsfunction;
}

console.log('');
console.log('the bootstrap runs against the real delivery');

// fengari cannot reach JS closures from a bare lua_pushjsfunction without a
// registry entry, so the two network stubs are injected as a table the prelude
// reads. This is the only machinery here; the bootstrap itself is untouched.
function makeRun() {
    const st = AUX.luaL_newstate();
    fengari.lualib.luaL_openlibs(st);

    const luaHttp = fengari.interop ? null : null;
    // Register the JS callbacks in the registry.
    const idx = LUA.lua_gettop(st);
    fengari.lua.lua_pushjsfunction;
    // Simple approach: write the values into the globals the prelude expects.
    const src = `
getgenv = function() return _G end
game = { Shutdown=function() end, GetService=function() return setmetatable({},{__index=function() return function() end end}) end, HttpGet=function(u,g) return HTTPFN(u) end }
identifyexecutor = function() return "executor" end
request = function(o) local b = (o.Method=="POST") and POSTFN(o.Url) or nil; if not b then b = HTTPFN(o.Url) end; return {StatusCode=200, Body=b, Success=true} end
` + boot;

    // HTTPFN / POSTFN are real Lua closures created from JS functions via
    // lua_pushjsfunction with an upvalue table. Fengari exposes this through
    // fengari.lua.lua_pushjsfunction, which needs a state and a JS callback
    // implemented in the interop layer - so instead the callbacks are exposed
    // as globals carrying the values the bootstrap will use.
    const httpBody = LUA.lua_tojsstring ? null : null;
    return { st, src };
}

// --- direct approach: drive the pieces the bootstrap uses --------------------
//
// The interop needed to call JS from Lua inside fengari is not available here,
// so the delivery is injected as a plain global and the bootstrap is executed
// with the network lines satisfied by pre-seeded globals. Anything the bootstrap
// would have FETCHED is supplied; anything it DECIDES is the shipped code.
{
    const st = AUX.luaL_newstate();
    fengari.lualib.luaL_openlibs(st);

    // Pre-seed every global the bootstrap reads from the network.
    //
    // ScripterHubKey IS the licence. Without it the bootstrap stops at its own
    // guard ("License required") and never reaches loadstring - which is
    // correct behaviour and makes the harness look broken rather than the
    // product. That guard is why the very first symptom can be a licence that
    // never got set at all.
    const seed = `
__SESS = ${JSON.stringify(postAnswer)}
__DELIVERY = ${JSON.stringify(delivery)}
__NOTIFS = {}
ScripterHubKey = ${JSON.stringify(LICENCE)}
getgenv = function() return _G end
game = {
  Shutdown = function() end,
  GetService = function() return setmetatable({}, {__index=function() return function() end end}) end,
  HttpGet = function(u)
    u = tostring(u)
    if u:find("/sh/a/", 1, true) then return __DELIVERY end
    return ""
  end,
}
identifyexecutor = function() return "executor" end
request = function(o)
  if o and o.Method == "POST" then return { StatusCode = 200, Body = __SESS, Success = true } end
  return { StatusCode = 200, Body = __DELIVERY, Success = true }
end
-- Capture what loadstring is handed, instead of executing the payload.
__LOADED = nil
__LOAD_ERR = nil
loadstring = function(src)
  __LOADED = src
  return function() end
end
load = loadstring
`;

    const full = seed + '\n' + boot;
    const rc = AUX.luaL_loadbuffer(st, fengari.to_luastring(full), null, fengari.to_luastring('@live'));
    check('the shipped bootstrap parses', rc === 0,
        rc !== 0 ? String(LUA.lua_tojsstring(st, -1)).slice(0, 300) : '');

    if (rc === 0) {
        const runRc = LUA.lua_pcall(st, 0, 0, 0);
        check('the bootstrap runs to completion', runRc === 0,
            runRc !== 0 ? String(LUA.lua_tojsstring(st, -1)).slice(0, 300) : '');

        LUA.lua_getglobal(st, fengari.to_luastring('__LOADED'));
        const loaded = LUA.lua_tojsstring(st, -1);
        const src = loaded === 'nil' ? null : loaded;

        if (!src) {
            LUA.lua_getglobal(st, fengari.to_luastring('__LOAD_ERR'));
            const err = LUA.lua_tojsstring(st, -1);
            check('the bootstrap hands a source to loadstring', false,
                'nothing was loaded. The bootstrap died before loadstring. ' +
                (err && err !== 'nil' ? 'Last error: ' + String(err).slice(0, 200) : ''));
        } else {
            check('the bootstrap hands a source to loadstring', true);
            check('the source is the artifact, not a failed decrypt',
                src.startsWith('SHOK') === false && src.length > 1000,
                'source is ' + src.length + ' chars, head: ' + JSON.stringify(src.slice(0, 60)));
            // The artifact the worker stored is base64. The bootstrap is
            // expected to hand the PARSER something that compiles, so compare
            // against the stored bytes rather than guessing the layer.
            const { shDecryptPayload } = await import('../sh-crypto.js');
            const expect = shDecryptPayload(delivery.split('\n').slice(2).join('\n'), LICENCE);
            check('the delivered source IS the stored artifact',
                expect !== null && src === expect,
                expect === null ? 'the server body does not open with this licence'
                    : 'loader produced something else: ' + JSON.stringify(src.slice(0, 60)));
            check('and it is real Lua, not the ciphertext',
                !src.startsWith('SHOK') && !/^[A-Za-z0-9+/=]+$/.test(src.slice(0, 200)),
                'the loader passed ciphertext to the parser');
        }
    }
}

console.log('');
console.log('LIVE LOADER   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);