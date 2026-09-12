// BIG-SCRIPT VM regression: the chunk-code-length bug (1-byte length
// mangled >255-word chunks) crashed executors with "attempt to perform
// arithmetic (mul) on nil and number". This generates synthetic scripts
// with HUGE functions (thousands of code words), deep nesting, and
// {n=...} tables as last call args, and runs them through the VM.
import assert from 'assert';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const ENV = `
getgenv = function() return _G end
loadstring = load
task = { spawn=function(f) end, wait=function() return 0 end }
`;

function runVm(code) {
    const vm = applyBytecodeVm(code);
    if (vm === null) return 'fallback';
    luaparse.parse(vm);
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(ENV));
    lauxlib.luaL_dostring(L, to_luastring('print=function() end'));
    const st = lauxlib.luaL_dostring(L, to_luastring(vm));
    return st === lua.LUA_OK ? 'ok' : 'ERR: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 120);
}

console.log('[B1] HUGE function (>255 code words) compiles + runs...');
{
    // a single function with 1200 statements = thousands of code words
    let fn = 'local function big(x)\n local acc = 0\n';
    for (let i = 0; i < 1200; i++) {
        fn += ' acc = acc + x * ' + i + ' + (x % ' + (i + 3) + ')\n';
    }
    fn += ' return acc\nend\nBIGRESULT = big(7)\n';
    const r = runVm(fn);
    assert.strictEqual(r, 'ok', 'huge function must run: ' + r);
    // verify the actual math through a fengari reference
    const L2 = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L2);
    lauxlib.luaL_dostring(L2, to_luastring('local function big(x) local acc=0 for i=0,1199 do acc = acc + x*i + (x%(i+3)) end return acc end REF=big(7)'));
    // compare VM result vs plain Lua
    const L3 = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L3);
    lauxlib.luaL_dostring(L3, to_luastring(ENV));
    const vm2 = applyBytecodeVm(fn);
    lauxlib.luaL_dostring(L3, to_luastring(vm2));
    lua.lua_getglobal(L3, to_luastring('BIGRESULT'));
    lua.lua_getglobal(L2, to_luastring('REF'));
    const vmVal = lua.lua_tonumber(L3, -1);
    const refVal = lua.lua_tonumber(L2, -1);
    assert.strictEqual(vmVal, refVal, 'VM must compute the same result: ' + vmVal + ' vs ' + refVal);
    console.log('    OK: 1200-statement function runs + exact math');
}

console.log('[B2] many small functions (200+ chunks) run...');
{
    let src = '';
    for (let i = 0; i < 250; i++) {
        src += 'local function f' + i + '(a) local b = a + ' + i + ' if b > 100 then return b - 1 else return b * 2 end end\nMANY' + i + ' = f' + i + '(' + i + ')\n';
    }
    const r = runVm(src);
    assert.strictEqual(r, 'ok', 'many chunks must run: ' + r);
    console.log('    OK: 250 functions, 251 chunks');
}

console.log('[B3] plain {n=...} table as LAST call arg is NOT flattened...');
{
    // the old marker (.n ~= nil) mistook this packed-result check for a
    // real marker: f({n=5}) became f() with garbage. Must stay intact.
    const code = `
local function count(...)
  local t = {...}
  return #t, t[1]
end
local argTbl = {n = 5, x = 1}
local c, first = count(argTbl)
NNIL1 = c
NNIL2 = (first == argTbl)
`;
    const r = runVm(code);
    assert.strictEqual(r, 'ok', r);
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(ENV));
    const vm = applyBytecodeVm(code);
    lauxlib.luaL_dostring(L, to_luastring(vm));
    lua.lua_getglobal(L, to_luastring('NNIL1'));
    assert.strictEqual(lua.lua_tonumber(L, -1), 1, 'arg count must be 1 (table NOT flattened)');
    lua.lua_getglobal(L, to_luastring('NNIL2'));
    assert.strictEqual(lua.lua_toboolean(L, -1), true, 'the table itself must be the first arg');
    console.log('    OK: {n=5} table passes through untouched');
}

console.log('[B4] genuine multi-result expansion STILL works (marker path)...');
{
    const code = `
local function multi() return 1, 2, 3 end
local function passthru(...) return ... end
local a, b, c, d = passthru(multi())
M1, M2, M3, M4 = a, b, c, d
local t = {multi()}
MARR = #t
local function sum3(x, y, z) return x + y + z end
MSUM = sum3(multi())
`;
    const r = runVm(code);
    assert.strictEqual(r, 'ok', r);
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(ENV));
    const vm = applyBytecodeVm(code);
    lauxlib.luaL_dostring(L, to_luastring(vm));
    for (const [name, want] of [['M1', 1], ['M2', 2], ['M3', 3], ['M4', 0], ['MARR', 3], ['MSUM', 6]]) {
        lua.lua_getglobal(L, to_luastring(name));
        const got = lua.lua_tonumber(L, -1);
        assert.strictEqual(got, want, name + ' must be ' + want + ', got ' + got);
    }
    console.log('    OK: multi-results, table-fill, tail expansion all exact');
}

console.log('[B5] nested closures + upvalues across MANY functions...');
{
    let src = '';
    for (let i = 0; i < 60; i++) {
        src += 'do local base' + i + ' = ' + i + '\n local function inc' + i + '() base' + i + ' = base' + i + ' + 1 return base' + i + ' end\n inc' + i + '() inc' + i + '()\n UPV' + i + ' = inc' + i + '() end\n';
    }
    const r = runVm(src);
    assert.strictEqual(r, 'ok', r);
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(ENV));
    const vm = applyBytecodeVm(src);
    lauxlib.luaL_dostring(L, to_luastring(vm));
    for (let i = 0; i < 60; i += 17) {
        lua.lua_getglobal(L, to_luastring('UPV' + i));
        assert.strictEqual(lua.lua_tonumber(L, -1), i + 3, 'upvalue closure math wrong at ' + i);
    }
    console.log('    OK: 60 closures, shared upvalues mutated correctly');
}

console.log('[B6] stress: deep if/else + loops + string ops in one chunk...');
{
    let fn = 'local s = ""\n';
    fn += 'for i = 1, 300 do\n if i % 3 == 0 then s = s .. "a" elseif i % 2 == 0 then s = s .. "b" else s = s .. "c" end end\n';
    fn += 'local t = {}\nfor i = 1, 300 do t[i] = i * 2 end\n';
    fn += 'local sum = 0\nfor _, v in ipairs(t) do sum = sum + v end\n';
    fn += 'STRESS_S = #s\nSTRESS_SUM = sum\n';
    const r = runVm(fn);
    assert.strictEqual(r, 'ok', r);
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(ENV));
    const vm = applyBytecodeVm(fn);
    lauxlib.luaL_dostring(L, to_luastring(vm));
    lua.lua_getglobal(L, to_luastring('STRESS_S'));
    assert.strictEqual(lua.lua_tonumber(L, -1), 300);
    lua.lua_getglobal(L, to_luastring('STRESS_SUM'));
    assert.strictEqual(lua.lua_tonumber(L, -1), 300 * 301); // sum of 2..600 step 2
    console.log('    OK: 300-iteration loops + branches + concat, exact results');
}

console.log('\nALL BIG-SCRIPT VM TESTS PASSED - the (mul) nil crash is dead.');
