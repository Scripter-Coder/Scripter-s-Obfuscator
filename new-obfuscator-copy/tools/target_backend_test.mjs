import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
vmBCSetLuaparse(luaparse);
function run(target,src){const vm=applyBytecodeVm(src,{target,profile:'BALANCED',seedOverride:8080,rethrow:true});const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const st=lauxlib.luaL_dostring(L,to_luastring(vm));if(st!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));lua.lua_getglobal(L,to_luastring('RESULT'));return to_jsstring(lua.lua_tostring(L,-1));}
const base='local function f(x,...) local n=select("#",...); return x+n end; RESULT=f(7,1,2,3)';
const gotoSrc='local x=0; goto L; x=99; ::L:: x=x+1; RESULT=x';
for(const target of ['lua52','lua53','lua54','luajit']){try{console.log('[PASS]',target,'basic',run(target,base)); if(target!=='luajit') console.log('[PASS]',target,'goto',run(target,gotoSrc));}catch(e){console.log('[FAIL]',target,String(e.message||e).slice(0,260));process.exitCode=1;}}
try{applyBytecodeVm('local ffi=require("ffi"); RESULT=1',{target:'lua51',rethrow:true}); console.log('[FAIL] lua51 accepted FFI'); process.exitCode=1;}catch(e){console.log('[PASS] lua51 rejects FFI')}
try{const vm=applyBytecodeVm('local ffi=require("ffi"); RESULT=1',{target:'luajit',rethrow:true}); console.log('[PASS] luajit FFI syntax/lowering path compiled',vm.length)}catch(e){console.log('[FAIL] luajit FFI compile',e.message);process.exitCode=1}
