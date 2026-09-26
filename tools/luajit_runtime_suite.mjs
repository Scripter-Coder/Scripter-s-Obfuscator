import fs from 'node:fs'; import {execFileSync} from 'node:child_process'; import luaparse from 'luaparse'; import {vmBCSetLuaparse, applyBytecodeVm} from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse); const bin='/mnt/data/runtimes/src/LuaJIT-2.1/src/luajit';
const tests={
arithmetic:`RESULT=7*6+5^2-3`,
closures:`local function make(x) return function(y) return x+y end end; local f=make(10); RESULT=f(7)`,
varargs:`local function f(...) local a={...}; return select('#',...),a[1]+a[3] end; local n,s=f(4,8,15); RESULT=n..':'..s`,
multireturn:`local function f() return 3,5,8 end; local a,b,c=f(); RESULT=a..','..b..','..c`,
coroutines:`local co=coroutine.create(function() coroutine.yield('A'); coroutine.yield('B'); return 'C' end); local a=coroutine.resume(co); local _,x=coroutine.resume(co); local _,y=coroutine.resume(co); RESULT=x..y`,
metamethods:`local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end,__index=function()return 9 end}); RESULT=(t+6)..':'..t.missing`,
pcall:`local ok,v=pcall(function() error('E') end); RESULT=tostring(ok)..':'..tostring(v):match('E')`,
bit:`RESULT=bit.band(0xf0,0x3c)`,
ffi:`local ffi=require('ffi'); ffi.cdef[[int abs(int);]]; RESULT=tostring(ffi.C.abs(-17))`,
};
for(const [name,src] of Object.entries(tests)){
 for(const kind of ['native','obf']){
  const file=`/tmp/lj_${name}_${kind}.lua`; const body=kind==='native'?src:applyBytecodeVm(src,{target:'luajit',profile:'BALANCED',seedOverride:9000,rethrow:true}); const code=body+'\nprint(RESULT)'; fs.writeFileSync(file,code);
  try {const out=execFileSync(bin,[file],{encoding:'utf8',timeout:15000}).trim(); console.log(`${name}\t${kind}\tPASS\t${out}`)} catch(e){console.log(`${name}\t${kind}\tFAIL\t${String(e.stderr||e.message).trim().slice(0,400)}`)}
 }
}
