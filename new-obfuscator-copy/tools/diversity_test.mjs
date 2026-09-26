import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src='local x="secret"; local y=123; print(x,y)';
const builds = [];
for(let i=0;i<3;i++){
  const vm=applyBytecodeVm(src, {profile:'BALANCED'});
  builds.push(vm);
}
console.log('Builds len', builds.map(b=>b.length));
 // opcode maps: extract HAND[xxx] values
function extractOps(vm){
  const ops=[...vm.matchAll(/HAND\[([^\]]+)\]/g)].map(m=>m[1]);
  return new Set(ops);
}
const sets=builds.map(extractOps);
console.log('Opcode handler sets size', sets.map(s=>s.size));
console.log('Sets equal?', sets[0].size===sets[1].size && [...sets[0]].every(v=>sets[1].has(v)) ? 'same values (random but set same size)' : 'different');
 // handler order: extract sequence
function order(vm){
  const m=[...vm.matchAll(/HAND\[([^\]]+)\]=function/g)].map(x=>x[1]);
  return m.join(',');
}
const orders=builds.map(order);
console.log('Handler order same?', orders[0]===orders[1] ? 'same' : 'different (structural diversity)');
 // vault len
function vaultLen(vm){ const m=vm.match(/local v[0-9a-f]{6}=\{([\d,]+)\}/); return m?m[1].split(',').length:0; }
console.log('Vault lens', builds.map(vaultLen));
 // blob len
function blobLen(vm){ const m=vm.match(/local src=\{([\d,]+)\}/); return m?m[1].split(',').length:0; }
console.log('Blob lens', builds.map(blobLen));
 // check diversity: at least one difference across builds
const diverse = builds[0]!==builds[1] && builds[1]!==builds[2];
console.log('Builds unique?', diverse ? 'YES (per-build diversity)' : 'NO');
if(!diverse) process.exit(1);
console.log('Diversity test PASS');
