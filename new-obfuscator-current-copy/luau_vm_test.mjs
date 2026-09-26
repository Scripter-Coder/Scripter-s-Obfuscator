
import { applyBytecodeVm } from './vm-bytecode.js';
import luaparse from 'luaparse';
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows\\luau.exe';
function run(code,label){
  const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_'+label+'.lua';
  fs.writeFileSync(p, code, 'utf8');
  const r = spawnSync(luauExe, [p], {encoding:'utf8'});
  console.log(label, 'stdout', JSON.stringify(r.stdout), 'stderr', JSON.stringify(r.stderr), 'status', r.status);
}
const src='local x: number = 5\nRESULT = x + 1';
const vm = applyBytecodeVm(src, {target:'luau', profile:'FAST', seedOverride:12345});
console.log('vm len', vm.length);
console.log(vm.slice(0,500));
run(vm, 'vm_simple');
const vm2 = vm + '\nprint("RESULT="..tostring(RESULT))';
fs.writeFileSync('C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_vm_simple2.lua', vm2, 'utf8');
const r2 = spawnSync(luauExe, ['C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_vm_simple2.lua'], {encoding:'utf8'});
console.log('vm RESULT', JSON.stringify(r2.stdout));
