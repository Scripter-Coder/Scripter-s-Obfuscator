import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
function run(src, seed) {
  const vm = applyBytecodeVm(src, { profile: 'BALANCED', seedOverride: seed });
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_dostring(L, to_luastring(vm));
  if (st !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(L, -1));
}
const cases = [
  ['A→B→C→B→A', 'local function c(x) return x+1 end local function b(x) return c(x) end local function a(x) return b(x) end RESULT=tostring(a(9))', '10'],
  ['recursion', 'local function f(n) if n<=1 then return 1 else return n*f(n-1) end end RESULT=tostring(f(6))', '720'],
  ['mutual recursion', 'local a,b a=function(n) if n<=0 then return 1 else return b(n-1) end end b=function(n) if n<=0 then return 2 else return a(n-1) end end RESULT=tostring(a(6))', '1'],
  ['multi-return', 'local function f() return 1,2,3 end local a,b,c=f() RESULT=a..b..c', '123'],
  ['varargs', `local function f(...) return select('#',...), select(1,...) end local n,a=f(4,5,6) RESULT=tostring(n)..','..tostring(a)`, '3,4'],
  ['tailcall', 'local function f(n) if n<=0 then return 7 else return f(n-1) end end RESULT=tostring(f(20))', '7'],
  ['close/upvalue', 'local function make(x) return function() x=x+1 return x end end local f=make(9) RESULT=tostring(f()+f())', '21'],
  ['pcall/xpcall', 'local function f() error("boom") end local ok,e=pcall(f) local ok2,e2=xpcall(f,function(x) return "handled" end) RESULT=tostring(ok)..","..tostring(ok2)..","..e2', 'false,false,handled'],
  ['coroutine', 'local co=coroutine.create(function() coroutine.yield(4) return 8 end) local ok,a=coroutine.resume(co) local ok2,b=coroutine.resume(co) RESULT=tostring(a)..","..tostring(b)', '4,8'],
  ['metamethod', 'local mt={__add=function(a,b) return a.v+b.v end} local a=setmetatable({v=4},mt) local b=setmetatable({v=5},mt) RESULT=tostring(a+b)', '9'],
];
let pass=0;
for(let i=0;i<cases.length;i++) { const [name,src,expected]=cases[i]; try { const got=run(src,1000+i); const ok=got===expected; console.log(`[${ok?'PASS':'FAIL'}] ${name}: ${got}`); if(ok) pass++; } catch(e) { console.log(`[FAIL] ${name}: ${e.message}`); } }
console.log(`Runtime baseline: ${pass}/${cases.length} passed`);
if(pass!==cases.length) process.exit(1);
