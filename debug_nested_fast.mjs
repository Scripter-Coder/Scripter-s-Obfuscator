import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src=`local function outer(x) local function inner(y) return x+y end; return inner(5) end; RESULT=tostring(outer(10))`;
for(const prof of ['FAST','BALANCED','SECURE']){
 const vm=applyBytecodeVm(src, {profile:prof});
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(vm));
 console.log(prof, 'st',st, st!==0? to_jsstring(lua.lua_tostring(L,-1)).slice(0,500): 'ok');
 if(st===0){ lua.lua_getglobal(L,to_luastring('RESULT')); console.log(prof, 'RESULT', to_jsstring(lua.lua_tostring(L,-1))); }
}
