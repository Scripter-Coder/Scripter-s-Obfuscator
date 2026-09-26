import pathlib
content = '''import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import { applyCustomObfuscator } from './custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\Lua Files\\\\luau-windows\\\\luau.exe';
function runVm(src, label){
  const vm = applyBytecodeVm(src, {target:'luau', profile:'FAST', seedOverride:12345, rethrow:true});
  console.log(label, 'vm len', vm.length);
  fs.writeFileSync('C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_'+label+'.lua', vm, 'utf8');
  const r = spawnSync(luauExe, ['C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_'+label+'.lua'], {encoding:'utf8'});
  console.log(label, 'stdout', JSON.stringify(r.stdout), 'stderr', JSON.stringify(r.stderr));
}
function runCustom(src, label){
  const obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seedOverride:12345});
  console.log(label, 'obf len', obf.length);
  fs.writeFileSync('C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_'+label+'.lua', obf, 'utf8');
  const r = spawnSync(luauExe, ['C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_'+label+'.lua'], {encoding:'utf8'});
  console.log(label, 'stdout', JSON.stringify(r.stdout), 'stderr', JSON.stringify(r.stderr));
}
runVm('GLOBAL_READ_TEST = 123\\nprint(GLOBAL_READ_TEST)', 'vm_B');
runCustom('GLOBAL_READ_TEST = 123\\nprint(GLOBAL_READ_TEST)', 'custom_B');
runVm('RESULT = 5\\nprint(RESULT)', 'vm_C');
runCustom('RESULT = 5\\nprint(RESULT)', 'custom_C');
runVm('function add(a,b) return a+b end\\nprint(add(2,3))', 'vm_D');
runCustom('function add(a,b) return a+b end\\nprint(add(2,3))', 'custom_D');
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_debug_bc.mjs')
target.write_text(content, encoding='utf-8')
print('written')
