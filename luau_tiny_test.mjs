import { applyCustomObfuscator } from 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/new-obfuscator/custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/new-obfuscator/vm-pass.js';
import { vmBCSetLuaparse } from 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/new-obfuscator/vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
const luauExe = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows\\luau.exe';
import { spawnSync } from 'child_process';
function runLuau(code, label){
  const tmp = `C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Obfuscator-s Website\\tmp_${label}.lua`;
  fs.writeFileSync(tmp, code, 'utf8');
  const res = spawnSync(luauExe, [tmp], {encoding:'utf8'});
  console.log(`--- ${label} ---`);
  console.log('code:', code.slice(0,120).replace(/\n/g,'\\n'));
  console.log('stdout:', JSON.stringify(res.stdout));
  console.log('stderr:', JSON.stringify(res.stderr));
  console.log('status:', res.status);
  return res;
}
// Native test
const nativeCode = `local x: number = 5\nprint(x+1)`;
runLuau(nativeCode, 'native_simple');
// Obfuscated test via new obfuscator
try{
  const src = `local x: number = 5\nRESULT = x + 1`;
  const obf = applyCustomObfuscator(src, {target:'luau', vmTier:'bytecode', profile:'FAST', seedOverride:12345});
  console.log('obfuscator output len', obf.length);
  console.log('obfuscator output preview', obf.slice(0,300).replace(/\n/g,'\\n'));
  // Write obfuscated to file and run
  runLuau(obf, 'obfuscated_simple');
  // Also test via VM that it sets RESULT
  const tmpObf = `C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Obfuscator-s Website\\tmp_obfuscated_simple.lua`;
  // Append check for RESULT
  const obfWithCheck = obf + "\nprint('RESULT='..tostring(RESULT))";
  fs.writeFileSync(tmpObf, obfWithCheck, 'utf8');
  const res2 = spawnSync(luauExe, [tmpObf], {encoding:'utf8'});
  console.log('obfuscated RESULT stdout', JSON.stringify(res2.stdout));
  console.log('obfuscated RESULT stderr', JSON.stringify(res2.stderr));
}catch(e){
  console.log('obfuscator error', e.message, e.stack);
}
// Test continue handling (should fail with current backend)
try{
  const src2 = `for i=1,5 do\n  if i==3 then continue end\n  print(i)\nend`;
  const obf2 = applyCustomObfuscator(src2, {target:'luau', vmTier:'bytecode', profile:'FAST', seedOverride:12345});
  console.log('continue obf should have thrown but got', obf2.slice(0,100));
}catch(e){
  console.log('continue correctly rejected:', e.message);
}
// Test compound
try{
  const src3 = `local x = 5\nx += 1\nprint(x)`;
  const obf3 = applyCustomObfuscator(src3, {target:'luau', vmTier:'bytecode', profile:'FAST', seedOverride:12345});
  console.log('compound obf should have thrown but got', obf3.slice(0,100));
}catch(e){
  console.log('compound correctly rejected:', e.message);
}
