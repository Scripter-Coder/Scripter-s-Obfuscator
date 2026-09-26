import { applyCustomObfuscator } from './custom-obfuscator.js';
import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows\\luau.exe';
function run(code,label){
  const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\tmp_'+label+'.lua';
  fs.writeFileSync(p, code, 'utf8');
  const r = spawnSync(luauExe, [p], {encoding:'utf8'});
  return {out: r.stdout.replace(/\r\n/g, "\n").trim(), err: r.stderr, status: r.status};
}
function test(name, src, expected){
  const native = run(src, 'native_'+name);
  let obf;
  try{ obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seed:12345}); } catch(e){ console.log(name, 'obf throw', e.message); return false; }
  const obfd = run(obf, 'obf_'+name);
  const pass = native.out===obfd.out && native.out===expected;
  console.log(name, pass ? 'PASS' : 'FAIL', 'native', JSON.stringify(native.out), 'obf', JSON.stringify(obfd.out), 'expected', JSON.stringify(expected));
  if(!pass){
    console.log('native err', JSON.stringify(native.err));
    console.log('obf err', JSON.stringify(obfd.err));
  }
  return pass;
}
let all=true;
all = test('arith', 'local x: number = 5\nprint(x+1)', '6') && all;
all = test('func', 'function add(a:number,b:number):number return a+b end\nprint(add(2,3))', '5') && all;
all = test('closure', 'function makeCounter(): ()->number local c=0 return function():number c+=1 return c end end\nlocal cnt=makeCounter()\nprint(cnt())\nprint(cnt())', '1\n2') && all;
all = test('table', 'local t={a=1} t.b=2\nprint(t.a+t.b)', '3') && all;
all = test('loop_cont', 'for i=1,5 do\n  if i==3 then continue end\n  print(i)\nend', '1\n2\n4\n5') && all;
all = test('compound', 'local x=5\nx+=2\nprint(x)', '7') && all;
all = test('recursion', 'function fact(n:number):number if n<=1 then return 1 else return n*fact(n-1) end end\nprint(fact(5))', '120') && all;
all = test('varargs', 'function sum(...:number):number local s=0 for _,v in ipairs({...}) do s+=v end return s end\nprint(sum(1,2,3))', '6') && all;
all = test('multiret', 'function ret(): (number,number) return 1,2 end\nlocal a,b=ret()\nprint(a+b)', '3') && all;
all = test('metamethod', 'local mt={__add=function(a,b) return {val=a.val+b.val} end} local a=setmetatable({val=1},mt) local b=setmetatable({val=2},mt) local c=a+b\nprint(c.val)', '3') && all;
all = test('pcall', 'local ok,err=pcall(function() error("fail") end)\nprint(ok)\nprint(err:find("fail") and "found" or "not")', 'false\nfound') && all;
all = test('coroutine', 'local co=coroutine.create(function() coroutine.yield(1) return 2 end)\nlocal ok,v=coroutine.resume(co)\nprint(ok, v)\nlocal ok2,v2=coroutine.resume(co)\nprint(ok2, v2)', 'true\t1\ntrue\t2') && all;
all = test('tailcall', 'function f(n:number):number if n==0 then return 0 else return f(n-1) end end\nprint(f(5))', '0') && all;
console.log(all ? 'ALL COMPREHENSIVE PASS' : 'SOME FAIL');
