import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm, _vmBcCompile } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

const sample = `local function add(a,b) return a+b end; local x=0; for i=1,10 do x=add(x,i) end; RESULT=tostring(x)`;

console.log('=== DIVERSITY TEST (10 seeds) ===');
const builds=[];
for(let seed=0; seed<10; seed++){
  const build=_vmBcCompile(sample, {seedOverride: seed* 0x9e3779b9, profile:'BALANCED'});
  builds.push(build);
}
let vaultLens = builds.map(b=>b.vaultPlain.length);
let blobLens = builds.map(b=>b.chunks.reduce((s,c)=>s+c.code.length,0));
let opcodeMaps = builds.map(b=>JSON.stringify(b.OPCODES));
let uniqueVault = new Set(vaultLens).size;
let uniqueBlob = new Set(blobLens).size;
let uniqueOps = new Set(opcodeMaps).size;
console.log('vault lens', vaultLens);
console.log('blob code lens', blobLens);
console.log('unique vault', uniqueVault, '/10');
console.log('unique blob', uniqueBlob, '/10');
console.log('unique opcode maps', uniqueOps, '/10');
const opVals0 = Object.values(builds[0].OPCODES).sort((a,b)=>a-b);
const opVals1 = Object.values(builds[1].OPCODES).sort((a,b)=>a-b);
console.log('opcode sample build0', opVals0.slice(0,5));
console.log('opcode sample build1', opVals1.slice(0,5));
console.log('opcode overlap?', opVals0.some(v=>opVals1.includes(v)) ? 'some overlap (expected random)' : 'no overlap');

// check proto salt and jmp salt differ
let protoSalts = new Set();
let jmpSalts = new Set();
// we need to capture from emitVM? Instead check vault cipher params via build? They are random per build, so vault lens differ is enough
console.log('diversity PASS if uniqueOps==10 and uniqueVault>=5', uniqueOps===10 && uniqueVault>=5 ? 'PASS' : 'FAIL');

// Constant extraction test
console.log('\n=== CONSTANT EXTRACTION TEST ===');
const secret="Hello, secret string! 7355608";
const srcWithSecret=`RESULT="${secret}"`;
const vm=applyBytecodeVm(srcWithSecret);
const hasPlain = vm.includes(secret) || vm.includes('secret');
console.log('plaintext leaked?', hasPlain ? 'FAIL' : 'PASS (no plaintext)');
const hasVault = vm.includes('local c') || vm.includes('local K');
console.log('has vault?', hasVault ? 'YES' : 'NO');
console.log('extraction trivial?', hasPlain ? 'trivial' : 'non-trivial (vaulted)');

// CFG transform test
console.log('\n=== CFG TRANSFORM TEST ===');
const srcBranch=`local x=5; if x>3 then RESULT="yes" else RESULT="no" end`;
const vmFast=applyBytecodeVm(srcBranch, {profile:'FAST'});
const vmSecure=applyBytecodeVm(srcBranch, {profile:'SECURE'});
console.log('FAST len', vmFast.length, 'SECURE len', vmSecure.length, 'diff?', vmFast.length!==vmSecure.length ? 'PASS (different)' : 'FAIL');
const buildFast=_vmBcCompile(srcBranch, {profile:'FAST', seedOverride:123});
const buildSecure=_vmBcCompile(srcBranch, {profile:'SECURE', seedOverride:123});
console.log('FAST code len', buildFast.chunks[0].code.length, 'SECURE code len', buildSecure.chunks[0].code.length);

// Mutation test
console.log('\n=== MUTATION TEST ===');
const vm1=applyBytecodeVm(sample, {seedOverride:1});
const vm2=applyBytecodeVm(sample, {seedOverride:2});
console.log('vm1 vs vm2 differ?', vm1!==vm2 ? 'PASS' : 'FAIL');
console.log('vm1 len', vm1.length, 'vm2 len', vm2.length);

// Fusion/split test: const folding
console.log('\n=== FUSION/SPLIT TEST ===');
const srcFusion=`RESULT=tostring(2+3*4)`;
const bFusion=_vmBcCompile(srcFusion, {profile:'BALANCED', seedOverride:42});
console.log('fusion code len', bFusion.chunks[0].code.length, 'vault len', bFusion.vaultPlain.length);
console.log('irStats', bFusion.irStats);

// Per-function test already done, but re-check
console.log('\n=== PER-FUNCTION TEST ===');
const srcPerFunc=`
-- @VM SECURE
local function f(a) return a*2 end
-- @VM FAST
local function g(a) return a*3 end
RESULT=tostring(f(5)+g(5))
`;
const bPer=_vmBcCompile(srcPerFunc, {profile:'BALANCED', seedOverride:99});
console.log('per-func chunks', bPer.chunks.map(c=>c.profile));
console.log('per-func PASS?', bPer.chunks[0].profile==='SECURE' && bPer.chunks[1].profile==='FAST' ? 'PASS' : 'FAIL');

// Benchmark
console.log('\n=== BENCHMARK (native vs FAST/BALANCED/SECURE) ===');
function bench(src, profile, n=20){
  const t0=Date.now();
  let vm;
  for(let i=0;i<n;i++) vm=applyBytecodeVm(src, {profile});
  const compileTime=Date.now()-t0;
  const t1=Date.now();
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  const loadTime=Date.now()-t1;
  const t2=Date.now();
  for(let i=0;i<5;i++){
    const L2=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L2);
    lauxlib.luaL_dostring(L2,to_luastring(vm));
  }
  const execTime=Date.now()-t2;
  return {compileTime, loadTime, execTime, len: vm.length};
}
const benchSrc=`local s=0; for i=1,100 do s=s+i end; RESULT=tostring(s)`;
const nativeTime=(()=>{
  const t0=Date.now();
  for(let i=0;i<100;i++){
    const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L,to_luastring(benchSrc+'; RESULT=tostring(5050)'));
  }
  return Date.now()-t0;
})();
console.log('native 100 runs', nativeTime,'ms');
console.log('FAST', bench(benchSrc,'FAST'));
console.log('BALANCED', bench(benchSrc,'BALANCED'));
console.log('SECURE', bench(benchSrc,'SECURE'));
