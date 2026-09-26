import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
const src=`local function add(a,b) return a.v+b.v end local mt={__add=add} local co=coroutine.create(function() local a=setmetatable({v=2},mt) local b=setmetatable({v=3},mt) local x=a+b return x end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)`;
const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:424242,rethrow:true});
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L); const st=lauxlib.luaL_dostring(L,to_luastring(vm)); console.log('status',st); if(st!==lua.LUA_OK) console.log(to_jsstring(lua.lua_tostring(L,-1))); else {lua.lua_getglobal(L,to_luastring('RESULT')); console.log('RESULT',to_jsstring(lua.lua_tostring(L,-1)));}
