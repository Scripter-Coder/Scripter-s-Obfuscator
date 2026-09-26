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
return c()
end

local function a()
return b()
end

print(a())
`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride:123, instrument:true});
import fs from 'fs';
fs.writeFileSync('vm_first.lua', vm);
// Now run with print capture
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
console.log("captured out:", out);
console.log("has CALL", out.includes("CALL"));
console.log("has RETURN", out.includes("RETURN"));
console.log("has TAILCALL", out.includes("TAILCALL"));
console.log("has FP", out.includes("FP="));
console.log("has CODE", out.includes("CODE="));
console.log("has PC", out.includes("PC="));
console.log("has BASE", out.includes("BASE="));
console.log("has TOP", out.includes("TOP="));
console.log("has retDest", out.includes("retDest="));
console.log("has nRet", out.includes("nRet="));
