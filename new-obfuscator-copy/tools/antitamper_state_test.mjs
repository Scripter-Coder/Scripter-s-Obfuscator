import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
vmBCSetLuaparse(luaparse);
const src='local function f(x) return x+1 end; RESULT=f(4)';
const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:444,rethrow:true});
function run(code){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const st=lauxlib.luaL_dostring(L,to_luastring(code));return st===lua.LUA_OK?null:to_jsstring(lua.lua_tostring(L,-1));}
const normalErr=run(vm); console.log('[PASS] legitimate execution',normalErr===null?'ok':normalErr);
const corrupted=vm.replace(/owner=([A-Za-z_][A-Za-z0-9_]*)/, 'owner={}');
const err=run(corrupted); console.log('[PASS] frame-owner corruption rejected',/VM_STATE_FRAME_OWNER/.test(err||''), err||'no error');
console.log('[PASS] state validation markers', ['VM_STATE_FP','VM_STATE_CODE','VM_STATE_BOUNDS','VM_STATE_SP'].every(x=>vm.includes(x)));
if(normalErr!==null || !/VM_STATE_FRAME_OWNER/.test(err||'') || !['VM_STATE_FP','VM_STATE_CODE','VM_STATE_BOUNDS','VM_STATE_SP'].every(x=>vm.includes(x))) process.exitCode=1;
