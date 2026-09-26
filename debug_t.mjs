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
let src1=`local t={}; for i=1,4 do t[i]=i*i end
RESULT=tostring(t[1])..","..tostring(t[2])..","..tostring(t[3])..","..tostring(t[4])
`;
let src2=`local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
for(let src of [src1, src2]){
  let vmB=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:0});
  console.log("src", src.slice(0,50));
  console.log(" vm ok?", run(vmB));
  // also try with vm that logs t after loop
  let srcLog=`local t={}; for i=1,4 do t[i]=i*i end
print("t after", t[1],t[2],t[3],t[4])
local s=0; for _,v in ipairs(t) do print("iter",v) s=s+v end
RESULT=tostring(s)
`;
  let vmLog=applyBytecodeVm(srcLog,{profile:'BALANCED',seedOverride:0});
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  let out="";
  lua.lua_pushcfunction(L,(LL)=>{
    const n=lua.lua_gettop(LL);
    let parts=[];
    for(let i=1;i<=n;i++){ const s=lua.lua_tostring(LL,i); parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i))); }
    out+=parts.join("\t")+"\n";
    return 0;
  }); lua.lua_setglobal(L,to_luastring('print'));
  let st=lauxlib.luaL_dostring(L,to_luastring(vmLog));
  console.log(" log run", st===lua.LUA_OK? "ok":"err "+to_jsstring(lua.lua_tostring(L,-1)).slice(0,400));
  console.log(out.slice(0,500));
  console.log("---");
}
