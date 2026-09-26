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
  return r.stdout.trim();
}
function test(name, src, expected){
  const nativeOut = run(src, 'native_'+name);
  let obf;
  try{
    obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seedOverride:12345});
  } catch(e){ console.log(name, 'obfuscator throw', e.message); return false; }
  const obfOut = run(obf, 'obf_'+name);
  const pass = nativeOut===obfOut && nativeOut===expected;
  console.log(name, pass ? 'PASS' : 'FAIL', 'native', JSON.stringify(nativeOut), 'obf', JSON.stringify(obfOut), 'expected', JSON.stringify(expected));
  return pass;
}
let all=true;
all = test('A', 'local x: number = 5\nprint(x+1)', '6') && all;
all = test('B', 'GLOBAL_READ_TEST = 123\nprint(GLOBAL_READ_TEST)', '123') && all;
all = test('C', 'RESULT_WRITE_TEST = 456\nprint(RESULT_WRITE_TEST)', '456') && all;
all = test('D', 'function add(a,b) return a+b end\nprint(add(2,3))', '5') && all;
all = test('E', 'function makeCounter() local c=0 return function() c=c+1 return c end end\nlocal cnt=makeCounter()\nprint(cnt())\nprint(cnt())', '1\n2') && all;
all = test('F', 'local t={a=1} t.b=2\nprint(t.a+t.b)', '3') && all;
all = test('G', 'local mt={__add=function(a,b) return {val=a.val+b.val} end} local a=setmetatable({val=1},mt) local b=setmetatable({val=2},mt) local c=a+b\nprint(c.val)', '3') && all;
all = test('H', 'local ok,res=pcall(function() error("fail") end)\nprint(ok)\nprint(res:find("fail") and "found" or "not")', 'false\nfound') && all;
all = test('I', 'local co=coroutine.create(function() coroutine.yield(1) return 2 end)\nlocal ok,v=coroutine.resume(co)\nprint(ok, v)\nlocal ok2,v2=coroutine.resume(co)\nprint(ok2, v2)', 'true\t1\ntrue\t2') && all;
console.log(all ? 'ALL PASS' : 'SOME FAIL');
