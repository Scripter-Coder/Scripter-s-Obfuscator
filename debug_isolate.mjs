import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,1200)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, res: res?to_jsstring(res):'nil'};
}
let cases=[
  `local t={}; for i=1,4 do t[i]=i*i end RESULT=tostring(t[1]..t[2]..t[3]..t[4])`,
  `local t={1,2,3,4}; local s=0; for _,v in ipairs(t) do s=s+v end RESULT=tostring(s)`,
  `local t={}; for i=1,4 do t[i]=i*i end local s=0; for _,v in ipairs(t) do s=s+v end RESULT=tostring(s)`,
  `local s=0; for i=1,4 do s=s+i end RESULT=tostring(s)`,
  `local t={}; for i=1,2 do t[i]=i end RESULT=tostring(t[1]+t[2])`,
];
for(let src of cases){
  let vmF=applyBytecodeVm(src,{profile:'FAST',seedOverride:0});
  let vmB=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:0});
  let native=run(src);
  let fast=run(vmF);
  let bal=run(vmB);
  console.log("src:", src.slice(0,60));
  console.log(" native",native);
  console.log(" fast",fast.ok?fast.res:fast.err.slice(0,120));
  console.log(" bal",bal.ok?bal.res:bal.err.slice(0,300));
  console.log("---");
}
