import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
let src=`local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
function dump(profile){
  let build=_vmBcCompile(src,{profile,seedOverride:0});
  let chunk=build.chunks[build.chunks.length-1];
  let OPCODES=build.OPCODES;
  let rev={}; for(let k in OPCODES) rev[OPCODES[k]]=k;
  let code=chunk.code;
  let oneArg=new Set(['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK']);
  let pcs=[]; let pc=1; for(let i=0;i<code.length;){
    pcs.push(pc);
    let op=code[i]; let name=rev[op];
    let hasArg=name && oneArg.has(name);
    pc+= hasArg?2:1;
    i+= hasArg?2:1;
  }
  console.log(profile, "code len",code.length,"words",pc-1);
  for(let i=0,j=0;i<code.length;){
    let op=code[i]; let name=rev[op]||op;
    let hasArg=name && oneArg.has(name);
    let pcCur=pcs[j];
    if(hasArg){
      console.log(` idx${j} pc${pcCur} ${name} ${code[i+1]}`);
      i+=2; j++;
    } else {
      console.log(` idx${j} pc${pcCur} ${name}`);
      i+=1; j++;
    }
  }
}
dump('FAST');
console.log("\n--- BALANCED ---\n");
dump('BALANCED');
