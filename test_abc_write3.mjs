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
for(let i=405;i<480;i++) console.log(`${i+1}: ${lines[i]}`);
