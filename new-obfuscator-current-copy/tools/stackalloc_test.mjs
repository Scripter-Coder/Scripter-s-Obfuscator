import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
vmBCSetLuaparse(luaparse);
function run(src, seed=991) {
  const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:seed,rethrow:true});
  if(!vm) throw new Error('compile returned null');
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L,-1)));
  lua.lua_getglobal(L,to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(L,-1));
}
const cases=[
 ['ordinary','local a=VM_STACKALLOC(4); a[1]=7; a[2]=8; RESULT=a[1]+a[2]'],
 ['nested','local a=VM_STACKALLOC(4); do a[3]=11 end; RESULT=#a..":"..a[3]'],
 ['mutation','local a=VM_STACKALLOC(3); a[1]=1; a[1]=a[1]+4; RESULT=a[1]'],
 ['coroutine','local a=VM_STACKALLOC(2); a[1]=5; local co=coroutine.create(function() a[2]=7; coroutine.yield(a[1]+a[2]) end); local ok,v=coroutine.resume(co); RESULT=tostring(ok)..":"..tostring(v)..":"..tostring(a[2])'],
 ['pcall','local a=VM_STACKALLOC(2); a[1]=4; local ok,v=pcall(function() return a[1]+3 end); RESULT=tostring(ok)..":"..tostring(v)'],
 ['tail','local a=VM_STACKALLOC(2); a[1]=9; local function f(x) return x+1 end; RESULT=(function() return f(a[1]) end)()'],
 ['vararg','local function f(...) local a=VM_STACKALLOC(3); a[1]=select("#",...); return a[1] end; RESULT=f(1,2,3)'],
 ['multi','local a=VM_STACKALLOC(3); local function f() return 2,5 end; local x,y=f(); a[1]=x; a[2]=y; RESULT=a[1]*10+a[2]']
];
let pass=0;
for(const [name,src] of cases){
  try { const r=run(src); const expected={ordinary:'15',nested:'4:11',mutation:'5',coroutine:'true:12:7',pcall:'true:7',tail:'10',vararg:'3',multi:'25'}[name]; if(r!==expected) throw new Error(`got ${r}, expected ${expected}`); console.log('[PASS]',name,r); pass++; }
  catch(e){ console.log('[FAIL]',name,String(e.message||e).slice(0,300)); }
}
// Captured stackalloc must not specialize; this case is intentionally expected to reject/fallback safely,
// because VM_STACKALLOC is not a normal global. The production compiler should refuse the unsafe form.
try {
  const src='local a=VM_STACKALLOC(2); local function f() return a[1] end; RESULT=f()';
  applyBytecodeVm(src,{profile:'BALANCED',seedOverride:992,rethrow:true});
  console.log('[INFO] captured stackalloc compiled without specialization (expected conservative fallback path)');
} catch(e){ console.log('[INFO] captured stackalloc rejected:',String(e.message||e).slice(0,160)); }
console.log(`STACKALLOC: ${pass}/${cases.length} focused cases passed`);
if(pass!==cases.length) process.exitCode=1;
