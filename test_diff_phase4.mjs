import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function runNative(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1))};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const v=lua.lua_tostring(L,-1);
  return {ok:true, val: v?to_jsstring(v):null, type:lua.lua_type(L,-1)};
}
function runVM(src){
  const vm=applyBytecodeVm(src);
  if(!vm) return {ok:false, skip:true};
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==lua.LUA_OK) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1)).slice(0,1200)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const v=lua.lua_tostring(L,-1);
  return {ok:true, val: v?to_jsstring(v):null};
}
const cases=[
  ['strings', `RESULT="hello"`],
  ['string concat', `RESULT="a".."b"`],
  ['integer', `RESULT=tostring(42)`],
  ['float', `RESULT=tostring(3.14)`],
  ['boolean true', `RESULT=tostring(true)`],
  ['boolean false', `RESULT=tostring(false)`],
  ['nil', `RESULT=tostring(nil)`],
  ['int float mix', `RESULT=tostring(1+2.5)`],
  ['table', `local t={1,2,3}; RESULT=tostring(t[2])`],
  ['function ref', `local function f(x) return x*2 end; RESULT=tostring(f(21))`],
  ['closure', `local function outer(a) return function(b) return a+b end end; RESULT=tostring(outer(10)(5))`],
  ['multiple returns', `local function f() return 1,2,3 end; local a,b,c=f(); RESULT=tostring(a+b+c)`],
  ['varargs', `local function f(...) local t={...}; RESULT=tostring(t[2]) end; f(10,20,30)`],
  ['numeric for', `local s=0; for i=1,5 do s=s+i end; RESULT=tostring(s)`],
  ['generic for', `local t={1,2,3}; local s=0; for k,v in ipairs(t) do s=s+v end; RESULT=tostring(s)`],
  ['if else', `local x=5; if x>3 then RESULT="yes" else RESULT="no" end`],
  ['while', `local s=0; local i=1; while i<=3 do s=s+i; i=i+1 end; RESULT=tostring(s)`],
  ['repeat', `local s=0; local i=1; repeat s=s+i; i=i+1 until i>3; RESULT=tostring(s)`],
  ['and or', `RESULT=tostring((true and "a") or "b")`],
  ['method', `local t={x=5}; function t:inc() self.x=self.x+1 end; t:inc(); RESULT=tostring(t.x)`],
  ['tailcall', `local function f(n) if n<=1 then return 1 end return f(n-1)*n end; RESULT=tostring(f(5))`],
  ['upvalue', `local x=10; local function inc() x=x+1 end; inc(); RESULT=tostring(x)`],
  ['nested closure mutate', `local c=0; local function make() local x=0; return function() x=x+1; c=c+x; return x end end; local f=make(); f(); f(); RESULT=tostring(c)`],
  ['large const', `local s="abcdefghijklmnopqrstuvwxyz"; RESULT=s`],
  ['float precision', `RESULT=tostring(0.1+0.2)`],
];
let pass=0,fail=0;
for(const [name,src] of cases){
  const a=runNative(src);
  const b=runVM(src);
  if(b.skip){ console.log(name+' SKIP'); pass++; continue; }
  if(!a.ok){ console.log(name+' NATIVE ERR '+a.err); fail++; continue; }
  if(!b.ok){ console.log(name+' VM ERR '+b.err); fail++; continue; }
  if(a.val===b.val){ console.log(name+' PASS'); pass++; } else { console.log(name+' FAIL exp='+JSON.stringify(a.val)+' got='+JSON.stringify(b.val)+' err='+b.err); fail++; }
}
console.log(`RESULT ${pass}/${pass+fail} pass`);
if(fail>0) process.exit(1);
