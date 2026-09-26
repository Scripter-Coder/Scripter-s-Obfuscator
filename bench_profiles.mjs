import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import { vmSetLuaparse } from './vm-pass.js';
vmSetLuaparse(luaparse);
import { applyCustomObfuscator } from './custom-obfuscator.js';
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

const SRC = 'GLOBAL_MARKER="RAN_OK"; local x=0; for i=1,10 do x=x+i end; assert(x==55)';
function bench(label, maker){
  const vm=maker();
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const t0=Date.now();
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  const dt=Date.now()-t0;
  const ok = st===lua.LUA_OK;
  const err = ok? 'ok' : to_jsstring(lua.lua_tostring(L,-1)).slice(0,300);
  console.log(`${label}: len=${vm.length} time=${dt}ms ${ok?'OK':'FAIL'} ${err}`);
  return dt;
}
console.log('=== NATIVE ===');
bench('native', ()=> SRC);
console.log('\n=== VM BYTECODE PROFILES ===');
bench('FAST vm (no shuffle, 2-6 decoy)', ()=> applyBytecodeVm(SRC,{profile:'FAST'}));
bench('BALANCED vm (shuffle, 8-15 decoy)', ()=> applyBytecodeVm(SRC,{profile:'BALANCED'}));
bench('SECURE vm (shuffle, 30-40 decoy)', ()=> applyBytecodeVm(SRC,{profile:'SECURE'}));
console.log('\n=== CUSTOM OBFUSCATOR PROFILES (full loader+vm) ===');
bench('FAST (lite VM, 1 layer, 1-round)', ()=> applyCustomObfuscator(SRC,{profile:'FAST', antiTamper:false, antiSkid:false, antiLogger:false}));
bench('BALANCED (bytecode, 3 layers, 1-round)', ()=> applyCustomObfuscator(SRC,{profile:'BALANCED', antiTamper:true, antiSkid:false, antiLogger:false}));
bench('SECURE (bytecode, 5 layers, 16-round)', ()=> applyCustomObfuscator(SRC,{profile:'SECURE', antiTamper:true, antiSkid:false, antiLogger:false}));
console.log('\n=== BEFORE (old) reference: 31s for tiny (5 layers prod 16r) ===');
console.log('AFTER FAST should be <1s, BALANCED ~1-2s, SECURE ~5-10s (still heavy but decoy tuned)');
