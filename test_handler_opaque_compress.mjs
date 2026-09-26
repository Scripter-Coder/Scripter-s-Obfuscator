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
let src=`local a=5; local b=3; RESULT=tostring(a+b)`;
// Handler decomposition OFF vs ON (via profile)
// FAST has monolithic, SECURE has decomposed
let off=applyBytecodeVm(src,{profile:'FAST', seedOverride:0});
let on=applyBytecodeVm(src,{profile:'SECURE', seedOverride:2});
console.log("handler decomposition diff:", off!==on, off.length, on.length);
// Check that SECURE has helpers (with seed 2 it should be decomposed2)
let vmSec2=applyBytecodeVm(src,{profile:'SECURE', seedOverride:2});
console.log("SECURE has helper (seed2):", vmSec2.includes('prepareCall') || vmSec2.includes('callHelper') ? "PASS" : "FAIL");
console.log("FAST no helper:", !off.includes('prepareCall') && !off.includes('callHelper') ? "PASS" : "FAIL");

// Opaque dispatch OFF vs ON
let off2=applyBytecodeVm(src,{profile:'FAST', seedOverride:0});
let on2=applyBytecodeVm(src,{profile:'SECURE', seedOverride:0});
console.log("opaque dispatch diff:", off2!==on2);
// Check that SECURE has state var (with seed that gives numeric dispatch)
let vmOn=applyBytecodeVm(src,{profile:'SECURE', seedOverride:1});
console.log("opaque has stateVar (seed1):", vmOn.includes('_st') || vmOn.includes('stateVar') || vmOn.includes('numeric_state') || vmOn.includes('_st') ? "PASS" : "FAIL (check manually)");
// Try another seed
let vmOn2=applyBytecodeVm(src,{profile:'SECURE', seedOverride:0});
console.log("opaque has stateVar (seed0):", vmOn2.includes('_st') ? "PASS" : "FAIL (seed0 is branch)");

// Test 20 seeds diversity for opaque
let seen=new Set();
for(let i=0;i<20;i++){
  let vm=applyBytecodeVm(src,{profile:'SECURE', seedOverride:i});
  seen.add(vm.slice(0,200));
}
console.log("opaque 20 seeds diversity:", seen.size>5 ? "PASS "+seen.size : "FAIL "+seen.size);

// Compression
let srcBig=`local s=0; for i=1,100 do s=s+i end; RESULT=tostring(s)`;
let offC=applyBytecodeVm(srcBig,{profile:'BALANCED', seedOverride:0, compress:false});
let onC=applyBytecodeVm(srcBig,{profile:'BALANCED', seedOverride:0, compress:true});
console.log("compression off vs on diff:", offC!==onC, offC.length, onC.length);
console.log("compressed smaller:", onC.length < offC.length ? "PASS" : "FAIL (may be larger for small src)");
console.log("compressed run off", run(offC));
console.log("compressed run on", run(onC));

// Corrupted payload rejection
let vmComp=applyBytecodeVm(srcBig,{profile:'SECURE', seedOverride:0, compress:true});
// Corrupt the blob by flipping a byte in the src array
let corrupted=vmComp.replace(/local src=\{([^}]+)\}/, (m, nums)=>{
  let arr=nums.split(',').map(Number);
  arr[0]=(arr[0]+1)%256;
  return `local src={${arr.join(',')}}`;
});
let resCorrupt=run(corrupted);
console.log("corrupted rejection:", resCorrupt.ok===false ? "PASS" : "FAIL (should error) ", resCorrupt.err?.slice(0,100));

// Benchmark
let t0=Date.now();
applyBytecodeVm(srcBig,{profile:'SECURE', seedOverride:0, compress:false});
let dtOff=Date.now()-t0;
t0=Date.now();
applyBytecodeVm(srcBig,{profile:'SECURE', seedOverride:0, compress:true});
let dtOn=Date.now()-t0;
console.log(`benchmark compress off ${dtOff}ms on ${dtOn}ms`);

// Check no plaintext leakage
let vmPlain=applyBytecodeVm(`local x="secret123"`,{profile:'BALANCED', seedOverride:0});
console.log("no plaintext leakage:", !vmPlain.includes('secret123') ? "PASS" : "FAIL");

// Check no f(unpack) for VM->VM
let vmCall=applyBytecodeVm(`local function f(a) return a*2 end; local function g(b) return f(b) end; RESULT=tostring(g(5))`,{profile:'BALANCED', seedOverride:0});
console.log("no f(unpack) for VM->VM:", vmCall.includes('f(unpack') ? "FAIL" : "PASS");
