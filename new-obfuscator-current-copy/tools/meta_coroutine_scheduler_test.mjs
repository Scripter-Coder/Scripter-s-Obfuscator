import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
function run(src){
  const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:424242,rethrow:true});
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==lua.LUA_OK) throw Error(to_jsstring(lua.lua_tostring(L,-1)));
  lua.lua_getglobal(L,to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(L,-1));
}
const cases=[
 ['add','local function mm(a,b) return a.v+b.v end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=2},mt); local b=setmetatable({v=3},mt); return a+b end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)','true:5'],
 ['index','local function mm(t,k) return t.base+k end local mt={__index=mm} local co=coroutine.create(function() local a=setmetatable({base=40},mt); return a[2] end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)','true:42'],
 ['newindex','local function mm(t,k,v) t.base=t.base+v end local mt={__newindex=mm} local co=coroutine.create(function() local a=setmetatable({base=40},mt); a.x=2; return a.base end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)','true:42'],
 ['call','local function mm(self,x) return self.base+x end local mt={__call=mm} local co=coroutine.create(function() local a=setmetatable({base=40},mt); return a(2) end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)','true:42'],
 ['arith-pcall','local function mm(a,b) error("meta") end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=1},mt); local b=setmetatable({v=2},mt); local ok,e=pcall(function() return a+b end); return ok, tostring(e):match("meta") end) local ok,a,b=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(a)..":"..tostring(b)','true:false:meta'],
 ['arith-xpcall','local function mm(a,b) error("meta") end local function h(e) return "handled:"..tostring(e):match("meta") end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=1},mt); local b=setmetatable({v=2},mt); local ok,e=xpcall(function() return a+b end,h); return ok,e end) local ok,a,b=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(a)..":"..tostring(b)','true:false:handled:meta'],
 ['nested-call','local function mm(a,b) local function f(x) return x+1 end return f(a.v+b.v) end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=2},mt); local b=setmetatable({v=3},mt); return a+b end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)','true:6'],
 ['upvalue','local n=10; local function mm(a,b) n=n+a.v+b.v; return n end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=2},mt); local b=setmetatable({v=3},mt); local x=a+b; local y=a+b; return x,y end) local ok,x,y=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(x)..":"..tostring(y)','true:15:20'],
 ['yield-meta','local function mm(a,b) coroutine.yield("meta-yield"); return a.v+b.v end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=2},mt); local b=setmetatable({v=3},mt); return a+b end) local a,x=coroutine.resume(co); local b,y=coroutine.resume(co); RESULT=tostring(a)..":"..tostring(x).."|"..tostring(b)..":"..tostring(y)','true:meta-yield|true:5'],
 ['yield-upvalue','local function mm(a,b) local n=1; coroutine.yield("y"); n=n+1; return a.v+b.v+n end local mt={__add=mm} local co=coroutine.create(function() local a=setmetatable({v=2},mt); local b=setmetatable({v=3},mt); return a+b end) local a,x=coroutine.resume(co); local b,y=coroutine.resume(co); RESULT=tostring(a)..":"..tostring(x).."|"..tostring(b)..":"..tostring(y)','true:y|true:7']
];
let pass=0;
for(const [n,s,e] of cases){try{const g=run(s); const ok=g===e; console.log(`[${ok?'PASS':'FAIL'}] ${n}: ${g} ${ok?'':'expected '+e}`); if(ok)pass++;}catch(err){console.log(`[FAIL] ${n}: ${err.message}`)}}
console.log(`Meta/coroutine scheduler suite: ${pass}/${cases.length}`);
if(pass<8) process.exit(1);
