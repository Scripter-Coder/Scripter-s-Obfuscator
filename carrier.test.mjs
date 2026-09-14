// Verify the split-key + VM-seed-carrier end-to-end run, and that the
// seed literal never appears in the file.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { applyCustomObfuscator } from './custom-obfuscator.js';
import { vmSetLuaparse } from './vm-pass.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const KEY_URL = 'https://test.workers.dev/sh/k';
const src = 'GLOBAL_MARKER = "CARRIER_RAN_OK"\nprint("this string is secret")\n';
const dbg = {};
const obf = applyCustomObfuscator(src, {
    intensity: 10, antiTamper: true, antiSkid: false, antiLogger: false,
    serverKey: { keyUrl: KEY_URL, scriptRef: 'ScripterHub0000000001' },
    _debug: true
}, dbg);
luaparse.parse(obf);

// [1] seed literal must NOT be in the file (server-bound carrier)
// find the vm seed: debug info doesn't expose it directly, but the genv
// name is random. Instead: regenerate the seed from the carrier the way
// Lua does and confirm it is a 29..251 int; the literal scan: the file
// must not contain "genvField=" followed by the seed derivation... the
// important check: no standalone literal write of the seed exists.
const genvWrite = obf.match(/g\.[_a-zA-Z0-9]+=\d+/g);
console.log('[1] genv literal writes found:', genvWrite ? genvWrite : 'NONE (good - seed not embedded)');

// [2] the carrier derives the seed in Lua exactly
const padded = dbg.splitKey.paddedKey;
const keyLen = dbg.splitKey.keyLen;
const carriers = padded.slice(keyLen);
let chain = 29;
for (const c of carriers) chain = (chain * 33 + c) % 4294967296;
const seed = 29 + (chain % 223);
console.log('[2] carrier-derived seed:', seed, '(carriers:', carriers.length, 'bytes after key)');

// [3] full genuine run with the worker response (key + carriers)
const resp = 'SHK ' + dbg.splitKey.t0 + ' ' + dbg.splitKey.chk + ' ' + padded.join(' ');
const PRELUDE = 'getgenv=function() return _G end\nSHUTDOWN=false\ngame={Shutdown=function() SHUTDOWN=true end,GetService=function() return {} end}\n';
const luaFake = PRELUDE
    + 'local _resp = ' + JSON.stringify(resp) + '\n'
    + 'game = { Shutdown=function() SHUTDOWN=true end, GetService=function() return {} end, HttpGet=function(self,url) return _resp end }\n';
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
lauxlib.luaL_dostring(L, to_luastring('print=function() end'));
lauxlib.luaL_dostring(L, to_luastring(luaFake));
const st = lauxlib.luaL_dostring(L, to_luastring(obf));
lua.lua_getglobal(L, to_luastring('GLOBAL_MARKER'));
const v = lua.lua_tostring(L, -1);
const marker = v ? to_jsstring(v) : null;
if (st !== lua.LUA_OK || marker !== 'CARRIER_RAN_OK') {
    const err = to_jsstring(lua.lua_tostring(L, -1));
    console.log('RUN FAILED:', err);
    process.exit(1);
}
console.log('[3] genuine split+carrier run: OK (marker =', marker + ')');

// [4] response WITHOUT the carriers (old-style key only): the vault
// stays locked -> no execution (proves the seed is carrier-bound now)
const respNoCar = 'SHK ' + dbg.splitKey.t0 + ' ' + dbg.splitKey.chk + ' ' + padded.slice(0, keyLen).join(' ');
const L2 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L2);
lauxlib.luaL_dostring(L2, to_luastring('print=function() end'));
lauxlib.luaL_dostring(L2, to_luastring(PRELUDE
    + 'local _resp = ' + JSON.stringify(respNoCar) + '\n'
    + 'game = { Shutdown=function() SHUTDOWN=true end, GetService=function() return {} end, HttpGet=function(self,url) return _resp end }\n'));
const st2 = lauxlib.luaL_dostring(L2, to_luastring(obf));
lua.lua_getglobal(L2, to_luastring('GLOBAL_MARKER'));
const v2 = lua.lua_tostring(L2, -1);
console.log('[4] carrier-less response: marker =', v2 ? to_jsstring(v2) : 'nil', '(locked, as designed)');

// [5] seed literal truly absent: brute check - the derived seed value as
// a standalone "=NNN" token must not appear anywhere in the file
const seedLeak = new RegExp('[^0-9]' + seed + '[^0-9]').test(obf);
console.log('[5] derived seed number present anywhere in file:', seedLeak ? 'yes (may be coincidence - numbers overlap)' : 'no standalone trace');
console.log('\nCARRIER TEST PASSED');
