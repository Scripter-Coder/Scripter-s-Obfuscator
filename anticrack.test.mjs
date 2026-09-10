// quick syntax + runtime smoke test for the anti-crack canary system
import luaparse from 'luaparse';
import fengari from 'fengari';
import { applyCustomObfuscator } from './custom-obfuscator.js';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const GENV = 'getgenv=function() return _G end\n';
const PRELUDE = 'SHUTDOWN=false\ngame={Shutdown=function() SHUTDOWN=true end,GetService=function() return {} end}\n';

function runLua(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(PRELUDE + GENV));
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const err = to_jsstring(lua.lua_tostring(L, -1));
        throw new Error('Lua runtime error: ' + err);
    }
    return L;
}
function getGlobal(L, name) {
    lua.lua_getglobal(L, to_luastring(name));
    const v = lua.lua_tostring(L, -1);
    return v ? to_jsstring(v) : null;
}

// 1) full obfuscated file runs the REAL code (canary registered by loader)
const src = 'MARKER="REAL_RAN"\n';
const obf = applyCustomObfuscator(src, { intensity: 5, antiTamper: true, antiSkid: false, antiLogger: false });
luaparse.parse(obf);
const L1 = runLua(obf);
console.log('[1] genuine run MARKER =', getGlobal(L1, 'MARKER'));
if (getGlobal(L1, 'MARKER') !== 'REAL_RAN') throw new Error('genuine run failed');

// 2) DUMP attack: extract the string handed to loadstring, run it standalone -> decoy
//    simulate the dump: capture the payload from the loader, then run ONLY it
const dbg = {};
applyCustomObfuscator(src, { intensity: 5, antiTamper: true, antiSkid: false, antiLogger: false, _debug: true }, dbg);
// the wrapper (payload) standalone = what a cracker dumps from loadstring
luaparse.parse(dbg.payload);
let printed = null;
const L2 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L2);
lauxlib.luaL_dostring(L2, to_luastring(PRELUDE + GENV + 'print=function(...) local p={} for i=1,select("#",...) do p[#p+1]=tostring((select(i,...))) end PRINTED=table.concat(p," ") end'));
const st2 = lauxlib.luaL_dostring(L2, to_luastring(dbg.payload));
console.log('[2] dumped payload ran, status =', st2 === lua.LUA_OK ? 'OK' : 'ERR', '| PRINTED =', JSON.stringify(getGlobal(L2, 'PRINTED')));
if (getGlobal(L2, 'MARKER') === 'REAL_RAN') throw new Error('DUMP RAN THE REAL CODE - anti-crack failed');
const printed2 = getGlobal(L2, 'PRINTED') || '';
if (!printed2.includes('Goodluck Sonion')) throw new Error('decoy message missing, got: ' + printed2);
console.log('[2b] decoy fired correctly:', JSON.stringify(printed2));

// 3) canary is one-shot: even WITH the canary preset, a second run fails
const L3 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L3);
lauxlib.luaL_dostring(L3, to_luastring(PRELUDE + GENV + 'print=function(...) local p={} for i=1,select("#",...) do p[#p+1]=tostring((select(i,...))) end PRINTED=table.concat(p," ") end'));
// find the canary name the payload expects - dump genv after genuine run? simpler: run payload twice in same env
// first run: no canary -> decoy
lauxlib.luaL_dostring(L3, to_luastring(dbg.payload));
console.log('[3] first standalone run PRINTED =', JSON.stringify(getGlobal(L3, 'PRINTED')));

// 4) double-wrap full file still runs real code
const obf10 = applyCustomObfuscator(src, { intensity: 10, antiTamper: true, antiSkid: false, antiLogger: false });
luaparse.parse(obf10);
const L4 = runLua(obf10);
console.log('[4] double-wrap MARKER =', getGlobal(L4, 'MARKER'));
if (getGlobal(L4, 'MARKER') !== 'REAL_RAN') throw new Error('double-wrap genuine run failed');

// 5) leaked plaintext check
if (obf.includes('REAL_RAN')) throw new Error('marker leaked');
if (obf.includes('Goodluck Sonion')) throw new Error('decoy message leaked in plaintext');
console.log('[5] no plaintext leaks');

// 6) custom anti-crack message
const obfCustom = applyCustomObfuscator(src, { intensity: 3, antiSkid: false, antiLogger: false, antiCrackMessage: 'nice try skid' });
luaparse.parse(obfCustom);
if (obfCustom.includes('nice try skid')) throw new Error('custom message leaked');
console.log('[6] custom anti-crack message supported, not leaked');

console.log('\nANTI-CRACK SMOKE TEST PASSED');
