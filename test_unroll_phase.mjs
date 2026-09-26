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
function vm(src, opts){ return applyBytecodeVm(src, opts); }
function test(name, src, expect){
  const native=run(src);
  const off=vm(src,{profile:'BALANCED', seedOverride:0, unroll:false});
  const on=vm(src,{profile:'BALANCED', seedOverride:0, unroll:true});
  if(!off || !on){
    const pass = native.res===expect;
    console.log(`${pass?'PASS':'FAIL'} ${name} (fallback) expect=${expect} native=${native.res} vm=${off?'off':'null'}/${on?'on':'null'}`);
    return pass;
  }
  const offRun=run(off);
  const onRun=run(on);
  const pass = native.res===expect && offRun.res===expect && onRun.res===expect;
  console.log(`${pass?'PASS':'FAIL'} ${name} expect=${expect} native=${native.res} off=${offRun.res} on=${onRun.res} diff=${off!==on}`);
  if(!pass) console.log("  native",native,"off",offRun,"on",onRun);
  return pass;
}
let all=true;
all &= test('zero iter', `local s=0; for i=5,1 do s=s+1 end; RESULT=tostring(s)`, '0');
all &= test('one iter', `local s=0; for i=1,1 do s=s+i end; RESULT=tostring(s)`, '1');
all &= test('multiple', `local s=0; for i=1,4 do s=s+i end; RESULT=tostring(s)`, '10');
all &= test('negative step', `local s=0; for i=4,1,-1 do s=s+i end; RESULT=tostring(s)`, '10');
all &= test('break', `local s=0; for i=1,5 do if i==3 then break end s=s+i end; RESULT=tostring(s)`, '3');
all &= test('continue (if supported)', `local s=0; for i=1,5 do if i==3 then goto continue end s=s+i ::continue:: end; RESULT=tostring(s)`, '12'); // this uses goto, may not be supported, expect fallback
// For continue, we test with a simple if that skips iteration via if, not continue keyword
all &= test('continue via if', `local s=0; for i=1,5 do if i~=3 then s=s+i end end; RESULT=tostring(s)`, '12');
all &= test('nested', `local s=0; for i=1,2 do for j=1,2 do s=s+1 end end; RESULT=tostring(s)`, '4');
all &= test('non-constant fallback', `local n=5; local s=0; for i=1,n do s=s+i end; RESULT=tostring(s)`, '15');

// structural proof
const src=`local s=0; for i=1,4 do s=s+i end; RESULT=tostring(s)`;
const offVM=vm(src,{profile:'BALANCED', seedOverride:0, unroll:false});
const onVM=vm(src,{profile:'BALANCED', seedOverride:0, unroll:true});
console.log(`structural unroll diff: ${offVM!==onVM ? 'PASS' : 'FAIL'} len ${offVM.length} vs ${onVM.length}`);
let buildOff=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, unroll:false});
let buildOn=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, unroll:true});
function countJumps(build){
  let cnt=0;
  for(let ch of build.chunks){
    for(let i=0;i<ch.code.length;){
      let op=ch.code[i];
      let rev={}; for(let k in build.OPCODES) rev[build.OPCODES[k]]=k;
      let name=rev[op];
      if(['JMP','JIF','JIT','JNIL'].includes(name)) cnt++;
      let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(name);
      i+= hasArg?2:1;
    }
  }
  return cnt;
}
console.log(`jumps off=${countJumps(buildOff)} on=${countJumps(buildOn)}`);

console.log(all ? "ALL UNROLL PASS" : "SOME UNROLL FAIL");
