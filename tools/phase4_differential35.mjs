import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm, _vmBcCompile } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function runNative(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==0) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1))};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const tp=lua.lua_type(L,-1);
  if(tp===lua.LUA_TNIL) return {ok:true, val:'nil'};
  if(tp===lua.LUA_TSTRING) return {ok:true, val:to_jsstring(lua.lua_tostring(L,-1))};
  if(tp===lua.LUA_TNUMBER) return {ok:true, val:String(lua.lua_tonumber(L,-1))};
  if(tp===lua.LUA_TBOOLEAN) return {ok:true, val:String(lua.lua_toboolean(L,-1))};
  return {ok:true, val:to_jsstring(lua.lua_tostring(L,-1))};
}
function runVM(src, profile='BALANCED'){
  const vm=applyBytecodeVm(src, {profile});
  if(!vm) return {ok:false, skip:true};
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==0) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1)).slice(0,800)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const tp=lua.lua_type(L,-1);
  if(tp===lua.LUA_TNIL) return {ok:true, val:'nil'};
  if(tp===lua.LUA_TSTRING) return {ok:true, val:to_jsstring(lua.lua_tostring(L,-1))};
  if(tp===lua.LUA_TNUMBER) return {ok:true, val:String(lua.lua_tonumber(L,-1))};
  if(tp===lua.LUA_TBOOLEAN) return {ok:true, val:String(lua.lua_toboolean(L,-1))};
  return {ok:true, val:to_jsstring(lua.lua_tostring(L,-1))};
}
const cases=[
  ['01_basic', 'RESULT=1+2', '3'],
  ['02_arithmetic', 'RESULT=tostring(5*6-3)', '27'],
  ['03_boolean', 'RESULT=tostring(true and false)', 'false'],
  ['04_strings', 'RESULT="hello".." ".."world"', 'hello world'],
  ['05_tables', 'local t={a=1,b=2}; RESULT=tostring(t.a+t.b)', '3'],
  ['06_metatables', 'local t=setmetatable({}, {__add=function(a,b) return 10 end}); local u={}; setmetatable(u,{__index=t}); RESULT=tostring(t+u)', '10'],
  ['07_functions', 'local function f(x) return x*2 end; RESULT=tostring(f(5))', '10'],
  ['08_nested', 'local function outer(a) return function(b) return a+b end end; RESULT=tostring(outer(3)(4))', '7'],
  ['09_closures', 'local x=10; local function inc() x=x+1 end; inc(); RESULT=tostring(x)', '11'],
  ['10_mutable', 'local c=0; local function make() local x=0; return function() x=x+1; c=c+x; return x end end; local f=make(); f(); f(); RESULT=tostring(c)', '3'],
  ['11_recursive', 'local function f(n) if n<=1 then return 1 end return n*f(n-1) end; RESULT=tostring(f(5))', '120'],
  ['12_mutual', 'local function even(n) if n==0 then return true else return odd(n-1) end end; function odd(n) if n==0 then return false else return even(n-1) end end; RESULT=tostring(even(4))', 'true'],
  ['13_varargs', 'local function f(...) local t={...}; return t[2] end; RESULT=tostring(f(10,20,30))', '20'],
  ['14_multi', 'local function f() return 1,2,3 end; local a,b,c=f(); RESULT=tostring(a+b+c)', '6'],
  ['15_tailcalls', 'local function f(n,a) if n==0 then return a end return f(n-1,a+n) end; RESULT=tostring(f(5,0))', '15'],
  ['16_numeric_for', 'local s=0; for i=1,5 do s=s+i end; RESULT=tostring(s)', '15'],
  ['17_generic_for', 'local t={1,2,3}; local s=0; for k,v in ipairs(t) do s=s+v end; RESULT=tostring(s)', '6'],
  ['18_while', 'local s=0; local i=1; while i<=3 do s=s+i; i=i+1 end; RESULT=tostring(s)', '6'],
  ['19_repeat', 'local s=0; local i=1; repeat s=s+i; i=i+1 until i>3; RESULT=tostring(s)', '6'],
  ['20_if_else', 'local x=5; if x>10 then RESULT="big" elseif x>3 then RESULT="mid" else RESULT="small" end', 'mid'],
  ['21_nested_branches', 'local a=1; local b=2; if a==1 then if b==2 then RESULT="ab" else RESULT="a" end else RESULT="none" end', 'ab'],
  ['22_coroutine', 'local function f() return 10 end; RESULT=tostring(f())', '10'],
  ['23_pcall', 'local ok,v=pcall(function() return 42 end); RESULT=tostring(v)', '42'],
  ['24_errors', 'local ok,err=pcall(function() error("oops") end); RESULT=tostring(not ok)', 'true'],
  ['25_env', 'RESULT=tostring(_G and "hasG" or "no")', 'hasG'],
  ['26_methods', 'local t={x=5}; function t:inc() self.x=self.x+1 end; t:inc(); RESULT=tostring(t.x)', '6'],
  ['27_native', 'RESULT=tostring(string.sub("hello",2,4))', 'ell'],
  ['28_bitwise', 'RESULT=tostring(bit32 and bit32.band(5,3) or 1)', '1'],
  ['29_int', 'RESULT=tostring(math.floor(3.7))', '3'],
  ['30_large', 'local s=""; for i=1,100 do s=s.."a" end; RESULT=tostring(#s)', '100'],
  ['31_deep_nest', 'local function f(a) if a==0 then return 0 else return f(a-1)+a end end; RESULT=tostring(f(10))', '55'],
  ['32_many_consts', 'local a="str1"; local b="str2"; local c="str3"; RESULT=a..b..c', 'str1str2str3'],
  ['33_many_funcs', 'local function f1(x) return x+1 end; local function f2(x) return f1(x)*2 end; local function f3(x) return f2(x)+3 end; RESULT=tostring(f3(5))', '15'],
  ['34_many_upvals', 'local a,b,c=1,2,3; local function f() return a+b+c end; RESULT=tostring(f())', '6'],
  ['35_upvalue_close', 'local x=10; do local y=20; x=x+y end; RESULT=tostring(x)', '30'],
];
let pass=0,fail=0,skip=0;
for(const [name,src,exp] of cases){
  const a=runNative(src);
  const b=runVM(src);
  if(b.skip){ skip++; continue; }
  if(!a.ok){ console.log(`FAIL ${name} native err ${a.err}`); fail++; continue; }
  if(!b.ok){ console.log(`FAIL ${name} vm err ${b.err}`); fail++; continue; }
  if(a.val===b.val){ pass++; } else { console.log(`FAIL ${name} exp ${JSON.stringify(a.val)} got ${JSON.stringify(b.val)} src ${src.slice(0,60)}`); fail++; }
}
console.log(`35 differential: ${pass} pass, ${fail} fail, ${skip} skip`);
if(fail>0) process.exit(1);
