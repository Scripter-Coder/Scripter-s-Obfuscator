import { applyCustomObfuscator } from './custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmSetLuaparse(luaparse);
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
console.log('src', src);
try{
  const obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seedOverride:12345});
  console.log('obf len', obf.length);
  console.log(obf.slice(0,300));
  run(obf, 'custom_simple');
  const obf2 = obf + '\nprint("RESULT="..tostring(RESULT))';
  const p2 = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_custom_simple2.lua';
  fs.writeFileSync(p2, obf2, 'utf8');
  const r2 = spawnSync(luauExe, [p2], {encoding:'utf8'});
  console.log('custom RESULT', JSON.stringify(r2.stdout), JSON.stringify(r2.stderr));
} catch(e){ console.log('err', e.message, e.stack) }
