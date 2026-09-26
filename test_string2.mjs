import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function test(src){
 const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride:123});
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(vm));
 console.log("src", src, "st",st);
 if(st!==0) console.log(to_jsstring(lua.lua_tostring(L,-1)));
 else { lua.lua_getglobal(L,to_luastring('RESULT')); const v=lua.lua_tostring(L,-1); console.log("RESULT", v?to_jsstring(v):null, "type", lua.lua_type(L,-1)); }
}
test(`RESULT=("hello"):upper()`);
test(`local s="hello"; RESULT=s:upper()`);
test(`local function f(s) return s:upper() end; RESULT=f("hello")`);
