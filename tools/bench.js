// tools/bench.js — Performance benchmarks (spec §25, requirement #8)
// Measures compile/output/VM-exec for FAST/BALANCED/SECURE vs native. Run via: node tools/bench.js
import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import { vmSetLuaparse, applyVmPass } from '../vm-pass.js';
vmSetLuaparse(luaparse);
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring } = fengari;

const SRC_TINY = 'GLOBAL_MARKER="RAN_OK"; local x=0; for i=1,10 do x=x+i end; assert(x==55)';
const SRC_MED = 'local t={}; for i=1,50 do t[i]=i*i end; local s=0; for _,v in ipairs(t) do s=s+v end; assert(s==42925)';

function timeVM(src) {
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const t0=Date.now();
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  const dt=Date.now()-t0;
  return { st, dt };
}

function benchOne(name, makeSrc) {
  const vm = makeSrc();
  const r = timeVM(vm);
  console.log(`${name}: len=${vm.length} time=${r.dt}ms st=${r.st}`);
  return { name, len: vm.length, time: r.dt, st: r.st };
}

console.log('=== NATIVE (fengari baseline) ===');
benchOne('native tiny', ()=> SRC_TINY);
console.log('\n=== VM BYTECODE ONLY ===');
benchOne('vm tiny', ()=> applyBytecodeVm(SRC_TINY));
benchOne('vm med', ()=> applyBytecodeVm(SRC_MED));
console.log('\n=== CUSTOM OBFUSCATOR (profiles via _debug/fast) ===');
benchOne('FAST tiny (1R debug)', ()=> applyCustomObfuscator(SRC_TINY,{intensity:1,antiTamper:false,antiSkid:false,antiLogger:false,_debug:true}));
benchOne('BALANCED tiny (3R debug)', ()=> applyCustomObfuscator(SRC_TINY,{intensity:3,antiTamper:false,antiSkid:false,antiLogger:false,_debug:true}));
benchOne('SECURE tiny (5R prod)', ()=> applyCustomObfuscator(SRC_TINY,{intensity:5,antiTamper:true,antiSkid:false,antiLogger:false}));
console.log('\n=== LITE VM-PASS ===');
benchOne('lite tiny', ()=> applyVmPass(SRC_TINY));

console.log('\nDone. FAST should be < 500ms for tiny; SECURE will be slower — tune layers/cipherRounds.');
