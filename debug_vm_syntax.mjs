import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src=`local function add(x) return x+10 end; print(add(5))`;
const vm=applyBytecodeVm(src, {profile:'BALANCED'});
import fs from 'fs';
fs.writeFileSync('debug_vm.lua', vm);
console.log('wrote debug_vm.lua len', vm.length);
try {
  luaparse.parse(vm, {luaVersion:'5.1'});
  console.log('parse ok');
} catch(e){
  console.log('parse err', e.message);
  console.log(e);
}
