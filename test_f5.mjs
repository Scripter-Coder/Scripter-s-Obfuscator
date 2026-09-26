import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src = `local function f(s) return string.upper(s) end; RESULT=f("hello")`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride:123, instrument:true});
import fs from 'fs';
fs.writeFileSync('vm_f5.lua', vm);
console.log(vm.slice(0,3000));
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
lua.lua_pushcfunction(L, (LL)=>{
  const n=lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){ const s=lua.lua_tostring(LL,i); parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i))); }
  console.log("PRINT:", parts.join('\t'));
  return 0;
}); lua.lua_setglobal(L, to_luastring('print'));
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log("st",st);
if(st!==0) console.log(to_jsstring(lua.lua_tostring(L,-1)));
else { lua.lua_getglobal(L,to_luastring('RESULT')); const v=lua.lua_tostring(L,-1); console.log("RESULT", v?to_jsstring(v):null); }
