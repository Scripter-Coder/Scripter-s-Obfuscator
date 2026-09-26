import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
let src=`local function f(x) return x*2 end; local ok,r=pcall(f,5); RESULT=tostring(ok)`;
let vm=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, pcall:true});
let lines=vm.split("\n");
console.log(lines.slice(200,220).join("\n"));
console.log("--- line 209 ---");
console.log(lines[208]);
