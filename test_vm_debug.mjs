import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const src = 'GLOBAL_MARKER="RAN_OK"; local x=0; for i=1,10 do x=x+i end; assert(x==55, "math broken")';
const vm = applyBytecodeVm(src, { profile: 'BALANCED', seedOverride: 12345 });
console.log('vm len', vm.length);
console.log(vm.slice(0,1200));
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log('st', st);
if(st!==lua.LUA_OK) console.log('err', to_jsstring(lua.lua_tostring(L,-1)).slice(0,2000));
else {
 lua.lua_getglobal(L,to_luastring('GLOBAL_MARKER'));
 console.log('marker', to_jsstring(lua.lua_tostring(L,-1)));
}
