import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
let src=`local co=coroutine.create(function(a) coroutine.yield(a*2) return a*3 end)
local ok,v=coroutine.resume(co,5)
RESULT=tostring(v)
`;
let build=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0});
let chunk=build.chunks[build.chunks.length-1];
let rev={}; for(let k in build.OPCODES) rev[build.OPCODES[k]]=k;
for(let i=0;i<chunk.code.length;){
  let op=chunk.code[i]; let name=rev[op];
  let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','PCALL','PCALLM','XPCALL','XPCALLM','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK','YIELD'].includes(name);
  if(hasArg) { console.log(i/2, name, chunk.code[i+1]); i+=2; } else { console.log(i/2, name); i+=1; }
}
