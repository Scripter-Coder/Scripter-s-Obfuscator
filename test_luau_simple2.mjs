import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows\\luau.exe';
function run(code,label){
  const p = 'C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Obfuscator-s Website\\tmp_'+label+'.lua';
  fs.writeFileSync(p, code, 'utf8');
  const r = spawnSync(luauExe, [p], {encoding:'utf8'});
  console.log(label, 'stdout', JSON.stringify(r.stdout), 'stderr', JSON.stringify(r.stderr), 'status', r.status);
}
// Test via new-obfuscator's vm-bytecode directly
import { applyBytecodeVm, vmBCSetLuaparse } from 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/new-obfuscator/vm-bytecode.js';
import luaparse from 'luaparse';
vmBCSetLuaparse(luaparse);
const src='local x: number = 5\nRESULT = x + 1';
console.log('src', src);
try{
  const vm = applyBytecodeVm(src, {target:'luau', profile:'FAST', seedOverride:12345});
  console.log('vm', vm ? vm.length : null, vm ? vm.slice(0,200) : 'null');
  if(vm){
    run(vm, 'vm_simple2');
    const vm2 = vm + '\nprint("RESULT="..tostring(RESULT))';
    run(vm2, 'vm_simple2_result');
  }
} catch(e){ console.log('err', e.message, e.stack) }
