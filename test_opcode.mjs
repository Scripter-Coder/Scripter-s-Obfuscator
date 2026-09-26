import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src = `local a=1; print(a)`;
let buildInfo=null;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride:12345, onBuild(b){ buildInfo=b; }});
console.log("OPCODES", buildInfo.OPCODES);
console.log("chunks", buildInfo.chunks.map(c=>({code:c.code.slice(0,20), maxReg:c.maxReg, params:c.params})));
console.log("vm snippet", vm.slice(0,2000));
