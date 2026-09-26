import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function disasm(build){
  let chunk=build.chunks[build.chunks.length-1];
  let OPCODES=build.OPCODES;
  let rev={}; for(let k in OPCODES) rev[OPCODES[k]]=k;
  let code=chunk.code;
  let out=[];
  for(let i=0;i<code.length;){
    let op=code[i]; let name=rev[op]||op;
    let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(name);
    if(hasArg){
      out.push(`${i}:${name} ${code[i+1]}`);
      i+=2;
    } else {
      out.push(`${i}:${name}`);
      i+=1;
    }
  }
  return out.join("\n");
}
let src=`local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
// compile with BALANCED (unroll) and FAST (no unroll)
let buildB=_vmBcCompile(src,{profile:'BALANCED',seedOverride:0});
console.log("BALANCED disasm");
console.log(disasm(buildB));
console.log("\n--- FAST disasm ---");
let buildF=_vmBcCompile(src,{profile:'FAST',seedOverride:0});
console.log(disasm(buildF));
console.log("\n--- run BALANCED vm ---");
let vmB=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:0});
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
let st=lauxlib.luaL_dostring(L,to_luastring(vmB));
console.log(st, st!==lua.LUA_OK? to_jsstring(lua.lua_tostring(L,-1)).slice(0,400): "ok");
if(st===lua.LUA_OK){
  lua.lua_getglobal(L,to_luastring('RESULT'));
  console.log("RESULT", to_jsstring(lua.lua_tostring(L,-1)));
}
