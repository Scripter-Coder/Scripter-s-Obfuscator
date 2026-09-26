import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
function run(src){const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:424242}); if(!vm) throw Error('compile returned null'); const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L); const st=lauxlib.luaL_dostring(L,to_luastring(vm)); if(st!==lua.LUA_OK) throw Error(to_jsstring(lua.lua_tostring(L,-1))); lua.lua_getglobal(L,to_luastring('RESULT')); const v=lua.lua_tostring(L,-1); return v?to_jsstring(v):null;}
const cases=[
 ['pcall-success-multi', 'local function f() return 1,2,3 end local a,b,c=pcall(f) RESULT=tostring(a)..","..tostring(b)..","..tostring(c)', 'true,1,2'],
 ['pcall-deep-error', 'local function c() error("deep") end local function b() return c() end local function a() return b() end local ok,e=pcall(a) RESULT=tostring(ok)..":"..tostring(e):match("deep")', 'false:deep'],
 ['nested-pcall', 'local function f() local ok,e=pcall(function() error("x") end) return ok,e end local ok,a,b=pcall(f) RESULT=tostring(ok)..":"..tostring(a)..":"..tostring(b):match("x")', 'true:false:x'],
 ['xpcall-vm-handler', 'local function f() error("x") end local function h(e) return "handled:"..tostring(e):match("x") end local ok,e=xpcall(f,h) RESULT=tostring(ok)..":"..e', 'false:handled:x'],
 ['xpcall-nested', 'local function h(e) return "h:"..tostring(e):match("x") end local function f() local ok,e=xpcall(function() error("x") end,h) return ok,e end local ok,a,b=pcall(f) RESULT=tostring(ok)..":"..tostring(a)..":"..tostring(b)', 'true:false:h:x'],
 ['pcall-closure', 'local function outer() local x=7 local function f() error(tostring(x)) end return f end local ok,e=pcall(outer()) RESULT=tostring(ok)..":"..tostring(e):match("7")', 'false:7'],
 ['coroutine-multi-yield', 'local co=coroutine.create(function(x) local y=coroutine.yield(x+1); local z=coroutine.yield(y+1); return z+1 end) local a,x=coroutine.resume(co,4) local b,y=coroutine.resume(co,10) local c,z=coroutine.resume(co,20) RESULT=tostring(a)..":"..tostring(x).."|"..tostring(b)..":"..tostring(y).."|"..tostring(c)..":"..tostring(z)', 'true:5|true:11|true:21'],
 ['coroutine-closure-yield', 'local co=coroutine.create(function() local x=3 local f=function() x=x+1 return x end coroutine.yield(f()) local y=f() return y end) local a,x=coroutine.resume(co) local b,y=coroutine.resume(co) RESULT=tostring(x)..","..tostring(y)', '4,5'],
 ['pcall-in-coroutine', 'local co=coroutine.create(function() local ok,e=pcall(function() error("c") end) coroutine.yield(tostring(ok)..":"..tostring(e):match("c")) return 9 end) local a,x=coroutine.resume(co) local b,y=coroutine.resume(co) RESULT=x..","..tostring(y)', 'false:c,9'],
 ['metamethod-xpcall', 'local mt={__add=function(a,b) error("meta") end} local a=setmetatable({},mt) local b=setmetatable({},mt) local ok,e=xpcall(function() return a+b end,function(x) return "handled:"..tostring(x):match("meta") end) RESULT=tostring(ok)..":"..e', 'false:handled:meta'],
];
let pass=0; for(const [n,s,e] of cases){try{const g=run(s); const ok=g===e; console.log(`[${ok?'PASS':'FAIL'}] ${n}: ${g}`); if(ok)pass++;}catch(err){console.log(`[FAIL] ${n}: ${err.message}`)}}
console.log(`Scheduler edge suite: ${pass}/${cases.length}`); if(pass!==cases.length) process.exit(1);