import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(source) {
  const vm = applyBytecodeVm(source, { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(vm));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(L, -1));
}

const cases = [
  ['host pcall VM success', 'local function f(x) return x*2 end; local ok,r=pcall(f,5); RESULT=tostring(ok)..":"..tostring(r)', 'true:10'],
  ['host pcall VM error', 'local function f(x) error("neg") end; local ok,r=pcall(f,5); RESULT=tostring(ok)..":"..tostring(r):match("neg")', 'false:neg'],
  ['host xpcall VM error', 'local function f(x) error("neg") end; local ok,r=xpcall(f,function(e)return "handled:"..tostring(e):match("neg") end,5); RESULT=tostring(ok)..":"..r', 'false:handled:neg'],
  ['host pcall native function', 'local ok,r=pcall(tonumber,"7"); RESULT=tostring(ok)..":"..tostring(r)', 'true:7'],
];

for (const [name, source, expected] of cases) {
  const actual = run(source);
  const pass = actual === expected;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${actual}`);
  if (!pass) process.exitCode = 1;
}
