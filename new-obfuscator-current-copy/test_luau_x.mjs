import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows\\luau.exe';
const src='local x: number = 5\nRESULT = x + 1';
console.log('src', JSON.stringify(src));
try{
  const vm = applyBytecodeVm(src, {target:'luau', profile:'FAST', seedOverride:12345, rethrow:true});
  console.log('vm len', vm.length);
  fs.writeFileSync('C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_test2.lua', vm + '\nprint("RESULT", RESULT)\nprint("getfenv", getfenv(0).RESULT)', 'utf8');
  let r = spawnSync(luauExe, ['C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_test2.lua'], {encoding:'utf8'});
  console.log('stdout', JSON.stringify(r.stdout));
  console.log('stderr', JSON.stringify(r.stderr));
} catch(e){ console.log('err', e.message, e.stack)}
