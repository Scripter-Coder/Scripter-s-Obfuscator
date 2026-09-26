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
import fs from 'fs';
fs.writeFileSync('vm_abc.lua', vm);
console.log("written vm_abc.lua, lines", vm.split('\n').length);
console.log(vm.split('\n').slice(230, 250).join('\n'));
