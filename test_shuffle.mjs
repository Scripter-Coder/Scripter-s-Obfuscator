import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

function test(profile){
 const src='local x=0; for i=1,3 do x=x+i end; print(x)';
 let build;
 try { build = _vmBcCompile(src); } catch(e){ console.log('compile err',e); return; }
 // Actually _vmBcCompile is compile function without opts? It takes src, opts? Our export compile is internal but we exposed _vmBcCompile as compile
 // Try via applyBytecodeVm path
 import('./vm-bytecode.js').then(m=>{
   const vm=m.applyBytecodeVm(src, {profile});
   const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
   lua.lua_pushcfunction(L,(LL)=>{ const s=lua.lua_tostring(LL,1); if(s) console.log('print',to_jsstring(s)); return 0;}); lua.lua_setglobal(L,to_luastring('print'));
   const st=lauxlib.luaL_dostring(L,to_luastring(vm));
   console.log(profile, 'st',st, st!==0? to_jsstring(lua.lua_tostring(L,-1)).slice(0,300):'ok');
 });
}

test('FAST');
setTimeout(()=>test('BALANCED'), 500);
setTimeout(()=>test('SECURE'), 1000);
