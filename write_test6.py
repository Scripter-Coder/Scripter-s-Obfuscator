import pathlib
content = '''import { applyCustomObfuscator } from './custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\Lua Files\\\\luau-windows\\\\luau.exe';
const src='RESULT = 5';
console.log('src', JSON.stringify(src));
try{
  const obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seedOverride:12345});
  console.log('obf len', obf.length);
  fs.writeFileSync('C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_custom_test.lua', obf + '\\nprint("RESULT", RESULT)', 'utf8');
  let r = spawnSync(luauExe, ['C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_custom_test.lua'], {encoding:'utf8'});
  console.log('stdout', JSON.stringify(r.stdout));
  console.log('stderr', JSON.stringify(r.stderr));
} catch(e){ console.log('err', e.message, e.stack)}
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_custom_simple2.mjs')
target.write_text(content, encoding='utf-8')
print('written')
