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
 else { lua.lua_getglobal(L,to_luastring('RESULT')); const v=lua.lua_tostring(L,-1); console.log("RESULT", v?to_jsstring(v):null); }
}
test(`local function f(s) local r=string.upper(s); return r end; RESULT=f("hello")`);
test(`local function f(s) return string.upper(s) end; RESULT=f("hello")`);
test(`local function f(s) local r=s:upper(); return r end; RESULT=f("hello")`);
