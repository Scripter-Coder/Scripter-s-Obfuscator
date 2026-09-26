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
let src=`local arr = VM_STACKALLOC(3)
arr[1]=10
arr[2]=20
arr[3]=arr[1]+arr[2]
RESULT=tostring(arr[3])
`;
const off=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, stackalloc:false});
const on=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, stackalloc:true});
console.log("stackalloc off vs on diff:", off!==on);
console.log("off", run(off));
console.log("on", run(on));
console.log("native", run(src.replace('VM_STACKALLOC(3)','{0,0,0}')));

// Check that ON does not contain NEWTAB for that allocation
let buildOff=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, stackalloc:false});
let buildOn=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, stackalloc:true});
function countNewTab(build){
  let cnt=0;
  for(let ch of build.chunks){
    for(let i=0;i<ch.code.length;){
      let op=ch.code[i];
      let rev={}; for(let k in build.OPCODES) rev[build.OPCODES[k]]=k;
      let name=rev[op];
      if(name==='NEWTAB') cnt++;
      let hasArg=['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(name);
      i+= hasArg?2:1;
    }
  }
  return cnt;
}
console.log(`NEWTAB off=${countNewTab(buildOff)} on=${countNewTab(buildOn)} (on should be 0 for stackalloc)`);

// Closure capture test
let src2=`local n=5
local arr = VM_STACKALLOC(2)
arr[1]=n
local function foo() return arr[1]+1 end
RESULT=tostring(foo())
`;
console.log("closure stackalloc", run(applyBytecodeVm(src2,{profile:'BALANCED', seedOverride:0, stackalloc:true})));

// Nested frame test
let src3=`local arr = VM_STACKALLOC(2)
arr[1]=1
arr[2]=2
local function bar()
  local arr2 = VM_STACKALLOC(2)
  arr2[1]=arr[1]+10
  arr2[2]=arr[2]+10
  return arr2[1]+arr2[2]
end
RESULT=tostring(bar())
`;
console.log("nested", run(applyBytecodeVm(src3,{profile:'BALANCED', seedOverride:0, stackalloc:true})));
