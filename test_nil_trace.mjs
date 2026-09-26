import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src=`RESULT=tostring(nil)`;
const vm=applyBytecodeVm(src);
import fs from 'fs'; fs.writeFileSync('vm_nil2.lua', vm);
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log('st',st);
if(st!==0){
  let err=to_jsstring(lua.lua_tostring(L,-1));
  console.log(err);
  lua.lua_getglobal(L,to_luastring('debug'));
  lua.lua_getfield(L,-1,to_luastring('traceback'));
  lua.lua_pushstring(L,to_luastring(err));
  lua.lua_pushinteger(L,2);
  lua.lua_call(L,2,1);
  console.log(to_jsstring(lua.lua_tostring(L,-1)).slice(0,3000));
}
