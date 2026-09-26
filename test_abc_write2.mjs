import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src = `
local function c()
return 10
end
local function b()
return c()
end
local function a()
return b()
end
RESULT=tostring(a())
`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 123, instrument:true});
const lines = vm.split('\n');
for(let i=0;i<lines.length;i++){
 if(lines[i].includes('while true do') || lines[i].includes('TAILCALL') || lines[i].includes('RET')){
   console.log(`${i+1}: ${lines[i]}`);
 }
}
console.log("---");
for(let i=340;i<380;i++) console.log(`${i+1}: ${lines[i]}`);
