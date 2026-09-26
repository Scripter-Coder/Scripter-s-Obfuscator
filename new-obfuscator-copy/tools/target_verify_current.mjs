import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import luaparse from 'luaparse';
import {vmBCSetLuaparse,applyBytecodeVm} from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src=`local function makeCounter(start) local n=start return function(x,...) n=n+x; return n, (n%2==0 and 'even' or 'odd'), select('#',...)+n end end local c=makeCounter(10) local a,b,d=c(2,7,8) RESULT=tostring(a)..','..b..','..tostring(d); print(RESULT)`;
const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:123});
fs.writeFileSync('/tmp/obf_target.lua',vm);
fs.writeFileSync('/tmp/native_target.lua',src);
const targets=[
 ['lua52','/mnt/data/runtimes/src/lua-5.2.4/src/lua'],
 ['lua53','/mnt/data/runtimes/src/lua-5.3.6/src/lua'],
 ['lua54','/mnt/data/runtimes/src/lua-5.4.8/src/lua'],
 ['luajit','/mnt/data/runtimes/src/LuaJIT-2.1/src/luajit']
];
for(const [name,bin] of targets){
 for(const kind of ['native','obf']){
  const file=kind==='native'?'/tmp/native_target.lua':'/tmp/obf_target.lua';
  try { const out=execFileSync(bin,[file],{encoding:'utf8',timeout:30000}).trim(); console.log(name,kind,'PASS',out||'(no stdout)'); }
  catch(e){ console.log(name,kind,'FAIL',String(e.stderr||e.message).trim().slice(0,240)); }
 }
}
