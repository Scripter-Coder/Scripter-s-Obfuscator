import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src=`local function outer(x) local function inner(y) return x+y end; return inner(5) end; RESULT=tostring(outer(10))`;
const vm=applyBytecodeVm(src, {profile:'BALANCED'});
console.log(vm.slice(0,3000));
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
lua.lua_pushcfunction(L,(LL)=>{ const s=lua.lua_tostring(LL,1); console.log('print',s?to_jsstring(s):'nil'); return 0;}); lua.lua_setglobal(L,to_luastring('print'));
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log('st',st);
if(st!==0) console.log('err', to_jsstring(lua.lua_tostring(L,-1)).slice(0,2000));
else {
 lua.lua_getglobal(L,to_luastring('RESULT'));
 console.log('RESULT', to_jsstring(lua.lua_tostring(L,-1)));
}
