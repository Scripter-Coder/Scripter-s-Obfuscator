import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
let src='local function f(x) return x*2 end; local ok,r=pcall(f,5); RESULT=tostring(ok)..","..tostring(r)';
let vm=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0});
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log(st, st===lua.LUA_OK?'ok':'fail '+to_jsstring(lua.lua_tostring(L,-1)).slice(0,500));
if(st===lua.LUA_OK){ lua.lua_getglobal(L,to_luastring('RESULT')); console.log(to_jsstring(lua.lua_tostring(L,-1))); }
