import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src = `local a=1; print(a)`;
const build = _vmBcCompile(src, {profile:'BALANCED', seedOverride:123});
console.log("chunks", build.chunks.length, build.chunks[0].code.slice(0,20), "maxReg", build.chunks[0].maxReg);
console.log("OPCODES", build.OPCODES['NUMK'], build.OPCODES['LNEW'], build.OPCODES['GLOB'], build.OPCODES['CALL']);

// Simulate blob encoding as in emitVM
function rndInt(a,b){ return a; } // dummy
const BP = {a:10,b:20,c:30};
let blob=[];
for(let ci=0;ci<build.chunks.length;ci++){
  let ch=build.chunks[ci];
  blob.push(ch.params.length %256, Math.floor(ch.params.length/256)%256);
  for(let pi=0;pi<ch.params.length;pi++) blob.push(ch.params[pi]%256, Math.floor(ch.params[pi]/256)%256);
  blob.push(ch.vararg?1:0);
  blob.push((ch.maxReg||0)%256, Math.floor((ch.maxReg||0)/256)%256);
  let nCode=ch.code.length;
  blob.push(nCode%256, Math.floor(nCode/256)%256, Math.floor(nCode/65536)%256, Math.floor(nCode/16777216)%256);
  for(let wi=0;wi<nCode;wi++){ let w=ch.code[wi]; blob.push(w%256, Math.floor(w/256)%256, Math.floor(w/65536)%256, Math.floor(w/16777216)%256); }
}
console.log("blob len", blob.length, blob.slice(0,40));
// Simulate decode
let BL = blob.slice(); // without encryption for test
let CH=[];
let rp=1; // 1-based
while(rp<=BL.length){
  let np = BL[rp-1] + BL[rp]*256; rp+=2;
  let ps=[]; for(let j=0;j<np;j++){ ps.push(BL[rp-1]+BL[rp]*256); rp+=2; }
  let va = (BL[rp-1]==1); rp+=1;
  let mr = BL[rp-1]+BL[rp]*256; rp+=2;
  let nc = BL[rp-1]+BL[rp]*256+BL[rp+1]*65536+BL[rp+2]*16777216; rp+=4;
  let cd=[]; for(let j=0;j<nc;j++){ cd.push(BL[rp-1]+BL[rp]*256+BL[rp+1]*65536+BL[rp+2]*16777216); rp+=4; }
  CH.push({c:cd,p:ps,v:va,maxReg:mr});
  console.log("decoded chunk", CH.length, "np",np,"mr",mr,"nc",nc,"cd0",cd.slice(0,5));
  if(CH.length>5) break;
}
