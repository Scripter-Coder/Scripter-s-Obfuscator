import pathlib
content = '''import { applyCustomObfuscator } from './custom-obfuscator.js';
import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\Lua Files\\\\luau-windows\\\\luau.exe';
function run(code,label){
  const p = 'C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_'+label+'.lua';
  fs.writeFileSync(p, code, 'utf8');
  const r = spawnSync(luauExe, [p], {encoding:'utf8'});
  return r.stdout.trim();
}
function testObf(name, src){
  const nativeOut = run(src, 'native_'+name);
  let obf;
  try{ obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seed:12345}); } catch(e){ console.log(name, 'obfuscator throw', e.message); return; }
  const obfOut = run(obf, 'obf_'+name);
  console.log(name, 'native', JSON.stringify(nativeOut), 'obf', JSON.stringify(obfOut), nativeOut===obfOut ? 'PASS' : 'FAIL');
}
// Simple continue
testObf('cont_simple', 'for i=1,5 do\\n  if i==3 then continue end\\n  print(i)\\nend');
// Continue inside if
testObf('cont_if', 'for i=1,5 do\\n  if i%2==0 then continue end\\n  print(i)\\nend');
// Nested loops
testObf('cont_nested', 'for i=1,2 do\\n  for j=1,3 do\\n    if j==2 then continue end\\n    print(i..","..j)\\n  end\\nend');
// Compound local
testObf('compound_local', 'local x=5\\nx+=1\\nprint(x)');
// Compound global
testObf('compound_global', 'x=5\\nx+=1\\nprint(x)');
// Compound table field
testObf('compound_field', 'local t={x=5}\\nt.x+=1\\nprint(t.x)');
// Compound indexed
testObf('compound_index', 'local t={5}\\nt[1]+=1\\nprint(t[1])');
// Type annotation + compound
testObf('compound_type', 'local x: number = 5\\nx+=2\\nprint(x)');
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_cont.mjs')
target.write_text(content, encoding='utf-8')
print('written')
