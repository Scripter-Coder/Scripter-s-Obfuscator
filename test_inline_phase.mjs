import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,800)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, res: res?to_jsstring(res):'nil'};
}
function vm(src, opts){
  return applyBytecodeVm(src, opts);
}
function testCase(name, src, check){
  const native=run(src);
  const off=vm(src,{profile:'BALANCED', seedOverride:0, inline:false});
  const on=vm(src,{profile:'BALANCED', seedOverride:0, inline:true});
  const offRun=run(off);
  const onRun=run(on);
  const diff = off !== on;
  const ok = native.ok===offRun.ok && native.ok===onRun.ok && native.res===offRun.res && native.res===onRun.res && check(native,offRun,onRun);
  console.log(`${ok?'PASS':'FAIL'} ${name} native=${native.res} off=${offRun.res} on=${onRun.res} diff=${diff} lenOff=${off.length} lenOn=${on.length}`);
  if(!ok) console.log("  native",native,"off",offRun,"on",onRun);
  return ok;
}

let allPass=true;
allPass &= testCase('normal', `
local function add(a,b) return a+b end
RESULT=tostring(add(2,3))
`, (n,o,on)=>true);

allPass &= testCase('closure', `
local n=5
local function foo(a) return n+a end
RESULT=tostring(foo(3))
`, (n,o,on)=> n.res==='8');

allPass &= testCase('multi return', `
local function foo() return 1,2,3 end
local a,b,c=foo()
RESULT=a..b..c
`, (n)=> n.res==='123');

allPass &= testCase('varargs', `
local function foo(...) local t={...} return t[1]+t[2] end
RESULT=tostring(foo(2,3))
`, (n)=> n.res==='5');

allPass &= testCase('nested', `
local function inner(a) return a+1 end
local function outer(b) return inner(b)*2 end
RESULT=tostring(outer(5))
`, (n)=> n.res==='12');

allPass &= testCase('recursive fallback', `
local function fact(n) if n<=1 then return 1 else return n*fact(n-1) end end
RESULT=tostring(fact(5))
`, (n)=> n.res==='120');

// structural proof: OFF vs ON should differ when inline applicable
const srcInline=`local function add(a,b) return a+b end
RESULT=tostring(add(2,3))`;
const offVM=vm(srcInline,{profile:'BALANCED', seedOverride:42, inline:false});
const onVM=vm(srcInline,{profile:'BALANCED', seedOverride:42, inline:true});
console.log(`structural diff inline: ${offVM!==onVM ? 'PASS diff' : 'FAIL no diff'} len ${offVM.length} vs ${onVM.length}`);
if(offVM===onVM) allPass=false;

// also check that CALL disappears: count occurrences of CALL opcode in chunk?
// We can check via _vmBcCompile
let buildOff=_vmBcCompile(srcInline,{profile:'BALANCED', seedOverride:42, inline:false});
let buildOn=_vmBcCompile(srcInline,{profile:'BALANCED', seedOverride:42, inline:true});
function countCalls(build){
  let cnt=0;
  for(let ch of build.chunks){
    for(let i=0;i<ch.code.length;){
      let op=ch.code[i];
      let rev={}; for(let k in build.OPCODES) rev[build.OPCODES[k]]=k;
      let name=rev[op];
      if(name==='CALL' || name==='CALLM') cnt++;
      let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(name);
      i+= hasArg?2:1;
    }
  }
  return cnt;
}
console.log(`calls off=${countCalls(buildOff)} on=${countCalls(buildOn)} (should be fewer when inlined)`);

console.log(allPass ? "ALL INLINE PASS" : "SOME INLINE FAIL");
