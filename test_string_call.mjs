import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src = `local function f(s) return s:upper() end; RESULT=f("hello");`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride:123});
console.log(vm.slice(0,2000));
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log("st",st);
if(st!==0) console.log(to_jsstring(lua.lua_tostring(L,-1)));
else { lua.lua_getglobal(L,to_luastring('RESULT')); console.log(to_jsstring(lua.lua_tostring(L,-1))); }
