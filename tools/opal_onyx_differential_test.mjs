import luaparse from 'luaparse';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const corpus = {
  arithmetic: 'RESULT=tostring(2+3*4)',
  strings: 'RESULT="a".."b"',
  tables: 'local t={a=3}; t.b=4; RESULT=tostring(t.a+t.b)',
  closure: 'local x=4; local function f() return x+3 end; RESULT=tostring(f())',
  mutable_upvalue: 'local x=1; local function f() x=x+2; return x end; RESULT=tostring(f())..":"..tostring(f())',
  recursion: 'local function f(n) if n<2 then return 1 end return n*f(n-1) end; RESULT=tostring(f(6))',
  loop: 'local x=0; for i=1,4 do x=x+i end; RESULT=tostring(x)',
  multireturn: 'local function f() return 3,5 end; local a,b=f(); RESULT=tostring(a+b)',
  varargs: 'local function f(...) return select("#",...) end; RESULT=tostring(f(1,2,3))',
  pcall: 'local function f(x) return x*2 end; local ok,r=pcall(f,5); RESULT=tostring(ok)..":"..tostring(r)',
  xpcall: 'local function f() error("x") end; local ok,r=xpcall(f,function() return "handled" end); RESULT=tostring(ok)..":"..r',
  metamethod: 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); RESULT=tostring(t+6)',
  vm_to_vm: 'local function a(x)return x+1 end; local function b(x)return a(x)*2 end; RESULT=tostring(b(4))',
};
function readResult(code, label) {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  if (status !== lua.LUA_OK) throw new Error(`${label}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  lua.lua_getglobal(L, to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(L, -1));
}
for (const [name, source] of Object.entries(corpus)) {
  const native = readResult(source, `native ${name}`);
  for (const profile of ['OPAL','ONYX']) {
    const vm = applyBytecodeVm(source, { profile, seedOverride: 1, rethrow: true });
    const actual = readResult(vm, `${profile} ${name}`);
    const pass = actual === native;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${profile} ${name}: ${actual}`);
    if (!pass) process.exitCode = 1;
  }
}
