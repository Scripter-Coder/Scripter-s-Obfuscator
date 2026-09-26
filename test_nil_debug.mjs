import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src=`RESULT=tostring(nil)`;
const vm=applyBytecodeVm(src);
console.log(vm.slice(0,1200));
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log('st',st);
if(st!==0) console.log(to_jsstring(lua.lua_tostring(L,-1)).slice(0,2000));
else { lua.lua_getglobal(L,to_luastring('RESULT')); console.log(to_jsstring(lua.lua_tostring(L,-1))); }
