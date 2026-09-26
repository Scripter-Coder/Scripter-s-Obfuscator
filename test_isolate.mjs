import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
function run(src){
 const vm=applyBytecodeVm(src);
 if(!vm) return 'fallback';
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(vm));
 if(st!==lua.LUA_OK) return to_jsstring(lua.lua_tostring(L,-1)).slice(0,1200);
 lua.lua_getglobal(L,to_luastring('RESULT'));
 const v=lua.lua_tostring(L,-1);
 return v?to_jsstring(v):'nil';
}
console.log(run('local t={1,2,3}; local s=0; for k,v in ipairs(t) do if v==2 then break end; s=s+v end; RESULT=tostring(s)'));
console.log(run('local function a(x) return x end; for i=1,3 do if i==2 then break end end; RESULT="ok"'));
