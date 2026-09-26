import { applyCustomObfuscator } from './custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows\\luau.exe';
function runLuau(code, label){
  const tmp = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_'+label+'.lua';
  fs.writeFileSync(tmp, code, 'utf8');
  const res = spawnSync(luauExe, [tmp], {encoding:'utf8'});
  console.log('--- '+label+' ---');
  console.log('code:', code.slice(0,120).replace(/\n/g,'\\n'));
  console.log('stdout:', JSON.stringify(res.stdout));
  console.log('stderr:', JSON.stringify(res.stderr));
  console.log('status:', res.status);
  return res;
}
const nativeCode = 'local x: number = 5\nprint(x+1)';
runLuau(nativeCode, 'native_simple');
try{
  const src = 'local x: number = 5\nRESULT = x + 1';
  const obf = applyCustomObfuscator(src, {target:'luau', vmTier:'bytecode', profile:'FAST', seedOverride:12345});
  console.log('obfuscator output len', obf.length);
  console.log('obfuscator output preview', obf.slice(0,300).replace(/\n/g,'\\n'));
  runLuau(obf, 'obfuscated_simple');
  const tmpObf = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_obfuscated_simple2.lua';
  const obfWithCheck = obf + '\nprint(\'RESULT=\'+tostring(RESULT))';
  fs.writeFileSync(tmpObf, obfWithCheck, 'utf8');
  const res2 = spawnSync(luauExe, [tmpObf], {encoding:'utf8'});
  console.log('obfuscated RESULT stdout', JSON.stringify(res2.stdout));
  console.log('obfuscated RESULT stderr', JSON.stringify(res2.stderr));
}catch(e){
  console.log('obfuscator error', e.message, e.stack);
}
try{
  const src2 = 'for i=1,5 do\n  if i==3 then continue end\n  print(i)\nend';
  const obf2 = applyCustomObfuscator(src2, {target:'luau', vmTier:'bytecode', profile:'FAST', seedOverride:12345});
  console.log('continue obf should have thrown but got', obf2.slice(0,100));
}catch(e){
  console.log('continue correctly rejected:', e.message);
}
try{
  const src3 = 'local x = 5\nx += 1\nprint(x)';
  const obf3 = applyCustomObfuscator(src3, {target:'luau', vmTier:'bytecode', profile:'FAST', seedOverride:12345});
  console.log('compound obf should have thrown but got', obf3.slice(0,100));
}catch(e){
  console.log('compound correctly rejected:', e.message);
}
