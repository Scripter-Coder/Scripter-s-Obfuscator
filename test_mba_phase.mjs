import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
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
let src=`local a=5; local b=3; RESULT=tostring((a+b)*2)`;
const off=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:1, mba:false});
const on=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:1, mba:true});
console.log("MBA off vs on diff:", off!==on, "len",off.length, on.length);
console.log("off run",run(off));
console.log("on run",run(on));
console.log("native",run(src));

// Test numeric edge cases
let cases=[
  `local a=0; local b=5; RESULT=tostring(a+b)`,
  `local a=10; local b=0; RESULT=tostring(a*b)`,
  `local a=5; RESULT=tostring(a*2)`,
  `local a=8; local b=3; RESULT=tostring(a-b)`,
  `local a=2; RESULT=tostring(a^2)`,
  `local a=5; RESULT=tostring(-(-a))`,
];
for(let c of cases){
  const native=run(c);
  const vmOff=applyBytecodeVm(c,{profile:'BALANCED', seedOverride:42, mba:false});
  const vmOn=applyBytecodeVm(c,{profile:'BALANCED', seedOverride:42, mba:true});
  const offR=run(vmOff);
  const onR=run(vmOn);
  const pass = native.res===offR.res && native.res===onR.res;
  console.log(`${pass?'PASS':'FAIL'} ${c.slice(0,30)} native=${native.res} off=${offR.res} on=${onR.res}`);
}

// Test seed deterministic and strength
const src2=`local x=10; local y=20; RESULT=tostring(x+y)`;
const vm1=applyBytecodeVm(src2,{profile:'SECURE', seedOverride:123, mba:true});
const vm2=applyBytecodeVm(src2,{profile:'SECURE', seedOverride:123, mba:true});
const vm3=applyBytecodeVm(src2,{profile:'SECURE', seedOverride:124, mba:true});
console.log(`seed determinism same=${vm1===vm2} diff=${vm1!==vm3}`);

// Test target honesty: bitwise should not be used for lua51
const srcBit=`local a=5; RESULT=tostring(a+1)`;
console.log("target",applyBytecodeVm(srcBit,{profile:'BALANCED', seedOverride:0, mba:true, target:'lua51'}) ? "ok" : "null");
