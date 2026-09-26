import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
function check(src, profile){
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
    if(hasArg) { pc+=2; i+=2; } else { pc+=1; i+=1; }
  }
  // map pc to idx
  let pcToIdx={}; pcs.forEach((p,i)=> pcToIdx[p]=i);
  // now check jumps
  for(let i=0;i<code.length;){
    let op=code[i]; let name=rev[op];
    let hasArg=name && oneArg.has(name);
    if(hasArg && ['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(name)){
      let targetPc=code[i+1];
      let targetIdx=pcToIdx[targetPc];
      console.log(`${profile} jump ${name} at idx ${i/2|0} pc ${pcs[i/2|0]} -> targetPc ${targetPc} idx ${targetIdx} ${targetIdx==null?'BAD':''}`);
      if(targetIdx==null) console.log("  BAD target");
    }
    if(hasArg) i+=2; else i+=1;
  }
  console.log(`${profile} total code len ${code.length} maxPc ${pc}`);
}
let src=`local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
check(src,'FAST');
check(src,'BALANCED');
