import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,800)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, res: res?to_jsstring(res):'nil'};
}
let src=`local co=coroutine.create(function(a) coroutine.yield(a*2) return a*3 end)
local ok,v=coroutine.resume(co,5)
RESULT=tostring(v)
`;
console.log("coroutine", run(applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0})));

// Test multiple yields
let src2=`local co=coroutine.create(function() coroutine.yield(1) coroutine.yield(2) return 3 end)
local ok1,v1=coroutine.resume(co)
local ok2,v2=coroutine.resume(co)
local ok3,v3=coroutine.resume(co)
RESULT=v1..","..v2..","..v3
`;
console.log("multiple yields", run(applyBytecodeVm(src2,{profile:'BALANCED', seedOverride:0})));

// Test yield across nested calls
let src3=`local function inner() coroutine.yield(10) return 20 end
local function outer() local x=inner() return x*2 end
local co=coroutine.create(outer)
local ok,v=coroutine.resume(co)
RESULT=tostring(v)
`;
console.log("nested yield", run(applyBytecodeVm(src3,{profile:'BALANCED', seedOverride:0})));

// Test closure across yield
let src4=`local n=5
local co=coroutine.create(function() n=n+1; coroutine.yield(n); n=n+1; return n end)
local ok,v=coroutine.resume(co)
RESULT=tostring(v)
`;
console.log("closure yield", run(applyBytecodeVm(src4,{profile:'BALANCED', seedOverride:0})));

// OFF vs ON
let off=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, coroutine:false});
let on=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, coroutine:true});
console.log("coroutine OFF vs ON diff:", off!==on);

// Check forbidden f(unpack) for VM coroutine
console.log("check f(unpack) for coroutine:", on.includes('f(unpack') ? "FAIL" : "PASS");
