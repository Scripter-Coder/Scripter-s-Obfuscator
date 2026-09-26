import { applyCustomObfuscator } from './custom-obfuscator.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/luau.exe';
function run(code,label){
  const p = 'C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/new-obfuscator-current-copy/tmp_full_'+label+'.lua';
  fs.writeFileSync(p, code, 'utf8');
  const r = spawnSync(luauExe, [p], {encoding:'utf8'});
  if(r.error) return 'ERR '+r.error.message;
  if(r.status!==0) return 'ERR stdout:'+r.stdout+' stderr:'+r.stderr+' status:'+r.status;
  return r.stdout.trim();
}
function test(name, src){
  const nativeOut = run(src, 'native_'+name);
  let obf;
  try{ obf = applyCustomObfuscator(src, {target:'luau', profile:'FAST', seed:12345}); } catch(e){ console.log(name, 'throw', e.message, e.stack?.slice(0,500)); return false; }
  const obfOut = run(obf, 'obf_'+name);
  const pass = nativeOut===obfOut;
  console.log(name, pass?'PASS':'FAIL', 'native', JSON.stringify(nativeOut), 'obf', JSON.stringify(obfOut));
  if(!pass){
    console.log('SRC', src.slice(0,500));
    console.log('OBF snippet', obf.slice(0,1000));
  }
  return pass;
}
test('arith','print(1+2*3); print(10/2); print(2^3); print(7%3)');
test('global_rw','x=10; print(x); x=20; print(x); y=x+5; print(y); _G and print(_G.print and "has _G.print" or "no")');
test('continue_simple','for i=1,5 do if i==3 then continue end print(i) end');
test('compound','local x=5; x+=1; print(x); x-=2; print(x); x*=3; print(x); x/=2; print(x)');
test('closures','local function make(n) return function(x) return x+n end end; local f=make(5); print(f(10))');
test('tables','local t={a=1,b=2}; print(t.a+t.b); t.c=3; print(t.c); local u={1,2,3}; print(#u); print(u[2])');
test('metamethod','local t=setmetatable({}, {__add=function(a,b) return a.v+b.v end}); t.v=10; local s=setmetatable({v=5}, getmetatable(t)); local r=t+s; print(r)');
test('metamethod2','local mt={__index=function(_,k) return k.."!" end}; local t=setmetatable({}, mt); print(t.foo)');
test('coroutine','local co=coroutine.create(function() coroutine.yield(1); coroutine.yield(2); return 3 end); local ok,v=coroutine.resume(co); print(v); ok,v=coroutine.resume(co); print(v); ok,v=coroutine.resume(co); print(v)');
