import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, _vmBcCompile, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

function run(src, profile='BALANCED', seed=null){
  const vm=applyBytecodeVm(src,{profile, seedOverride:seed});
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L,-1)));
  return L;
}
function get(L,name){
  lua.lua_getglobal(L,to_luastring(name));
  const v=lua.lua_tostring(L,-1);
  return v?to_jsstring(v): (lua.lua_toboolean(L,-1)?'true':null);
}

console.log('=== FINAL MATRIX: combined profiles + VM variants ===');
const sample=`local function f(a,b) return a+b end; RESULT=tostring(f(2,3))`;
for(const prof of ['FAST','BALANCED','SECURE']){
  const L=run(sample,prof,123);
  console.log(prof, get(L,'RESULT')==='5'?'PASS':'FAIL', 'len', applyBytecodeVm(sample,{profile:prof,seedOverride:123}).length);
}
// per-function mixed
const perFunc=`-- @VM SECURE
local function f(a) return a*2 end
-- @VM FAST
local function g(a) return a*3 end
RESULT=tostring(f(5)+g(5))`;
const L2=run(perFunc,'BALANCED',99);
console.log('per-func mixed', get(L2,'RESULT')==='25'?'PASS':'FAIL');

// pcall/xpcall virtualization (partial): ensure VM func under pcall works via host
const pcallSrc=`local function f(x) if x<0 then error("neg") end return x*2 end; local ok,r=pcall(f,5); RESULT=tostring(ok)..","..tostring(r)`;
const L3=run(pcallSrc,'BALANCED',1);
console.log('pcall VM->native', get(L3,'RESULT'));

// coroutine (JS VM frames still host, but VM frames preserved test)
const coSrc=`local co=coroutine.create(function(a) coroutine.yield(a*2) return a*3 end); local ok,v=coroutine.resume(co,5); RESULT=tostring(v)`;
try{ const L4=run(coSrc,'BALANCED',2); console.log('coroutine create/resume', get(L4,'RESULT')); }catch(e){console.log('coroutine partial',e.message.slice(0,100))}

// metamethod - __index (host-compatible)
const metaSrc=`local t=setmetatable({}, {__index=function(_,k) return k.."!" end}); local b=t.foo; RESULT=b`;
try{ const L5=run(metaSrc,'BALANCED',3); console.log('metamethod __index', get(L5,'RESULT')); }catch(e){console.log('metamethod __index FAIL',e.message.slice(0,120))}
// __call callable table (VM-aware, may be partial)
const metaSrc2=`local t=setmetatable({}, {__call=function(_,x) return x*2 end}); local a=t(3); RESULT=tostring(a)`;
try{ const L5b=run(metaSrc2,'BALANCED',4); console.log('metamethod __call', get(L5b,'RESULT')); }catch(e){console.log('metamethod __call PARTIAL',e.message.slice(0,120))}

// fuzz 500 quick (subset)
let pass=0, fail=0;
for(let i=0;i<500;i++){
  const expr = `local a=${i%100}; local b=${(i*7)%100}; RESULT=tostring(a+b)`;
  try{ const L=run(expr,'BALANCED', i); if(get(L,'RESULT')===String((i%100)+(i*7)%100)) pass++; else fail++; }catch(e){fail++}
}
console.log('fuzz 500', pass,'pass',fail,'fail');
