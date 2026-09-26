import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
let src='local arr = VM_STACKALLOC(3)';
let bOff=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, stackalloc:false});
let bOn=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, stackalloc:true});
function countNewTab(b){
  let cnt=0;
  let rev={}; for(let k in b.OPCODES) rev[b.OPCODES[k]]=k;
  for(let i=0;i<b.chunks[0].code.length;){
    let op=b.chunks[0].code[i];
    let name=rev[op];
    if(name==='NEWTAB') cnt++;
    let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','PCALL','PCALLM','XPCALL','XPCALLM','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK','YIELD'].includes(name);
    i+= hasArg?2:1;
  }
  return cnt;
}
console.log("off newtab",countNewTab(bOff));
console.log("on newtab",countNewTab(bOn));
console.log(bOff.chunks[0].code);
console.log(bOn.chunks[0].code);
