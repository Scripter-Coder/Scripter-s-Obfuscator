import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
let src=`local a=4
local b=6
local c=9
local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
let build=_vmBcCompile(src,{profile:'BALANCED',seedOverride:0});
console.log("chunks", build.chunks.length);
let chunk=build.chunks[build.chunks.length-1];
let OPCODES=build.OPCODES;
let rev={}; for(let k in OPCODES) rev[OPCODES[k]]=k;
let code=chunk.code;
for(let i=0;i<code.length;){
  let op=code[i]; let name=rev[op]||op;
  let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(name);
  if(hasArg){
    console.log(i, name, code[i+1]);
    i+=2;
  } else {
    console.log(i, name);
    i+=1;
  }
}
let vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:0});
console.log(vm.slice(0,2000));
// try run with error trace
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
lua.lua_pushcfunction(L, (L2)=>{
  const s=to_jsstring(lua.lua_tostring(L2,1));
  console.log("TRACE",s);
  return 0;
});
 // override print?
// lualib already
const st=lauxlib.luaL_loadstring(L,to_luastring(vm));
console.log("load status",st, st===lua.LUA_OK? "ok": to_jsstring(lua.lua_tostring(L,-1)));
if(st===lua.LUA_OK){
  const callSt=lua.lua_pcall(L,0,0,0);
  console.log("pcall",callSt, callSt===lua.LUA_OK? "ok": to_jsstring(lua.lua_tostring(L,-1)));
  // try traceback?
  lua.lua_getglobal(L,to_luastring('debug'));
  if(lua.lua_type(L,-1)===lua.LUA_TTABLE){
    lua.lua_getfield(L,-1,to_luastring('traceback'));
    if(lua.lua_type(L,-1)===lua.LUA_TFUNCTION){
      lua.lua_call(L,0,1);
      console.log("trace", to_jsstring(lua.lua_tostring(L,-1)));
    }
  }
}
