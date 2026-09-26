import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src = `
local function c()
return 10
end

local function b()
local x = c()
return x + 1
end

local function a()
local x = b()
return x + 1
end

print(a())
`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride:123, instrument:true});
import fs from 'fs';
fs.writeFileSync('vm_normal.lua', vm);
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
let out='';
lua.lua_pushcfunction(L,(LL)=>{
  const n=lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){ const s=lua.lua_tostring(LL,i); parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i))); }
  const line=parts.join('\t');
  out+=line+'\n';
  console.log("PRINT:", line);
  return 0;
}); lua.lua_setglobal(L,to_luastring('print'));
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log("st",st);
if(st!==0) console.log("err", to_jsstring(lua.lua_tostring(L,-1)));
console.log("captured", out);
