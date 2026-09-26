import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
 const vm=applyBytecodeVm(src, {profile:'BALANCED', seedOverride:123});
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(vm));
 if(st!==lua.LUA_OK) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1))};
 lua.lua_getglobal(L,to_luastring('RESULT'));
 const v=lua.lua_tostring(L,-1);
 return {ok:true, res: v?to_jsstring(v):null};
}
function test(name, src, expected){
 const res=run(src);
 const ok=res.ok && res.res===expected;
 console.log(`${ok?'[PASS]':'[FAIL]'} ${name}: ${res.res} expected ${expected} ${res.err||''}`);
 if(!ok) process.exitCode=1;
}
test("escaping closure", `local function makeCounter(start) local n=start; return function() n=n+1; return n end end; local c=makeCounter(5); RESULT=tostring(c()..c()..c())`, "678");
test("shared upvalue", `local a=1; local function f() a=a+1; return a end; local function g() a=a+2; return a end; f(); g(); RESULT=tostring(a)`, "4");
test("nested closure", `local function outer(x) local function inner(y) return x+y end; return inner(5) end; RESULT=tostring(outer(10))`, "15");
test("recursive closure", `local function fact(n) if n<=1 then return 1 else return n*fact(n-1) end end; RESULT=tostring(fact(5))`, "120");
test("mutually recursive", `local f,g; f=function(n) if n<=1 then return 1 else return g(n-1)*n end end; g=function(n) if n<=1 then return 1 else return f(n-1)*n end end; RESULT=tostring(f(5))`, "120");
test("parent-return then mutate", `local function make() local x=10; local function get() return x end; local function set(v) x=v end; return {get=get,set=set} end; local o=make(); o.set(20); RESULT=tostring(o.get())`, "20");
test("closure lifetime after frame", `local function make() local x=0; return function() x=x+1; return x end end; local c=make(); local a=c(); local b=c(); RESULT=tostring(a..b)`, "12");
test("loop closure", `local funcs={}; for i=1,3 do funcs[i]=function() return i end end; RESULT=tostring(funcs[1]()+funcs[2]()+funcs[3]())`, "6");
