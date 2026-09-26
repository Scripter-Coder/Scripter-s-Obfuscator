import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
let src=`local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
let vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:0});
let lines=vm.split("\n");
console.log(lines.slice(115,135).join("\n"));
console.log("--- line numbers ---");
lines.forEach((l,i)=>{ if(i>=115 && i<135) console.log(i+1, l.slice(0,120))});
