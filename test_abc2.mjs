import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const src = `
local function c()
return 10
end
local function b()
return c()
end
local function a()
return b()
end
RESULT=tostring(a())
`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 123, instrument:true});
console.log(vm.slice(0,3000));
const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
lua.lua_pushcfunction(L, (LL)=>{
  const n=lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){ const s=lua.lua_tostring(LL,i); parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i))); }
  console.log("PRINT:", parts.join('\t'));
  return 0;
}); lua.lua_setglobal(L, to_luastring('print'));
const st = lauxlib.luaL_dostring(L, to_luastring(vm));
console.log("st", st);
if(st!==0) console.log("err", to_jsstring(lua.lua_tostring(L,-1)).slice(0,3000));
else { lua.lua_getglobal(L, to_luastring('RESULT')); console.log("RESULT", to_jsstring(lua.lua_tostring(L,-1))); }
