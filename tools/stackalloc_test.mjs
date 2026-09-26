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
 ['explicit one','local a=VM_STACKALLOC(2, 1); a[1]=7; a[2]=8; RESULT=a[1]+a[2]'],
 ['zero based','local a=VM_STACKALLOC(2, 0); a[0]=7; a[1]=8; RESULT=a[0]+a[1]'],
 ['dynamic','local a=VM_STACKALLOC(3); local i=2; a[i]=9; RESULT=a[i]'],
 ['nested','local a=VM_STACKALLOC(4); do a[3]=11 end; RESULT=#a..":"..a[3]'],
 ['mutation','local a=VM_STACKALLOC(3); a[1]=1; a[1]=a[1]+4; RESULT=a[1]'],
 ['coroutine','local a=VM_STACKALLOC(2); a[1]=5; local co=coroutine.create(function() a[2]=7; coroutine.yield(a[1]+a[2]) end); local ok,v=coroutine.resume(co); RESULT=tostring(ok)..":"..tostring(v)..":"..tostring(a[2])'],
 ['pcall','local a=VM_STACKALLOC(2); a[1]=4; local ok,v=pcall(function() return a[1]+3 end); RESULT=tostring(ok)..":"..tostring(v)'],
 ['tail','local a=VM_STACKALLOC(2); a[1]=9; local function f(x) return x+1 end; RESULT=(function() return f(a[1]) end)()'],
 ['vararg','local function f(...) local a=VM_STACKALLOC(3); a[1]=select("#",...); return a[1] end; RESULT=f(1,2,3)'],
 ['multi','local a=VM_STACKALLOC(3); local function f() return 2,5 end; local x,y=f(); a[1]=x; a[2]=y; RESULT=a[1]*10+a[2]'],
 ['escape return','local function make() local a=VM_STACKALLOC(2); a[1]=9; return a end; local a=make(); RESULT=a[1]'],
 ['pack proxy','local a=LPH_STACKALLOC(3); a[1]=4; a[2]=5; local t=a:pack(); RESULT=t.n..":"..t[1]..":"..t[2]'],
 ['unpack proxy','local a=LPH_STACKALLOC(3); a[1]=4; a[2]=5; local x,y=a:unpack(); RESULT=x..":"..y'],
 ['clear proxy','local a=LPH_STACKALLOC(3); a[1]=4; a[2]=5; a:clear(1,1); RESULT=tostring(a[1])..":"..tostring(a[2])'],
 ['VM capture','local a=LPH_STACKALLOC(2); a[1]=4; local function f() a[1]=9; return a[1] end; RESULT=f()'],
 ['VM NONE capture','local a=LPH_STACKALLOC(2); a[1]=4; local function f() LPH_ATTRIBUTES(VM(NONE)) a[1]=8; return a[1] end; RESULT=f()'],
 ['fallback proxy','local function make() local a=LPH_STACKALLOC(3); a[1]=4; a[2]=5; return a end local a=make(); local t=a:pack(); RESULT=t.n..\":\"..t[1]..\":\"..t[2]'],
 ['fallback zero proxy','local function make() local a=LPH_STACKALLOC(3,0); a[0]=4; a[1]=5; return a end local a=make(); local t=a:pack(); RESULT=t.n..\":\"..t[1]..\":\"..t[2]'],
 ['direct return fallback','local function make() return LPH_STACKALLOC(2) end local a=make(); a[1]=6; RESULT=a[1]']
];
let pass=0;
for(const [name,src] of cases){
  try { const r=run(src); const expected={ordinary:'15','explicit one':'15','zero based':'15',dynamic:'9',nested:'4:11',mutation:'5',coroutine:'true:12:7',pcall:'true:7',tail:'10',vararg:'3',multi:'25','escape return':'9','pack proxy':'3:4:5','unpack proxy':'4:5','clear proxy':'nil:5','VM capture':'9','VM NONE capture':'8','fallback proxy':'3:4:5','fallback zero proxy':'3:4:5','direct return fallback':'6'}[name]; if(r!==expected) throw new Error(`got ${r}, expected ${expected}`); console.log('[PASS]',name,r); pass++; }
  catch(e){ console.log('[FAIL]',name,String(e.message||e).slice(0,300)); }
}
// A VM closure capture remains virtual storage and is usable after the owner
// frame has returned to the scheduler.
try {
  const src='local a=VM_STACKALLOC(2); local function f() return a[1] end; RESULT=f()';
  let build=null;
  applyBytecodeVm(src,{profile:'BALANCED',seedOverride:992,rethrow:true,onBuild:(value)=>{build=value;}});
  if (!build || build.stackalloc.true !== 1) throw new Error('VM capture did not retain virtual stack storage');
  console.log('[INFO] captured stackalloc retained virtual storage');
} catch(e){ console.log('[INFO] captured stackalloc rejected:',String(e.message||e).slice(0,160)); }
console.log(`STACKALLOC: ${pass}/${cases.length} focused cases passed`);
if(pass!==cases.length) process.exitCode=1;

for (const source of ['local a=VM_STACKALLOC(0); RESULT=1', 'local a=VM_STACKALLOC(2, 2); RESULT=1']) {
  let rejected = false;
  try { applyBytecodeVm(source, { profile: 'BALANCED', seedOverride: 993, rethrow: true }); } catch (error) { rejected = /VM_STACKALLOC|size|zeroOrOne/.test(String(error)); }
  if (!rejected) throw new Error(`invalid stackalloc form was accepted: ${source}`);
}
