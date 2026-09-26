import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src=`RESULT=tostring(nil)`;
const vm=applyBytecodeVm(src);
import fs from 'fs';
fs.writeFileSync('vm_nil.lua', vm);
console.log(vm.split('\n').slice(350,390).join('\n'));
