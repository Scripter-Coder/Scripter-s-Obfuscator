import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const sample = `
local function add(a,b) return a+b end
local s=0
for i=1,10 do s=add(s,i) end
RESULT=tostring(s)
`;

console.log('=== BUILD DIVERSITY 20 ===');
const builds = [];
for(let i=0;i<20;i++) builds.push(_vmBcCompile(sample, {seedOverride: i*0x9e3779b9, profile:'BALANCED'}));
const vaultLens = builds.map(b=>b.vaultPlain.length + 0); // vaultPlain without decoy is deterministic for tiny sample
const blobLens = builds.map(b=>b.chunks[0].code.length);
const opMaps = builds.map(b=>JSON.stringify(Object.values(b.OPCODES).sort((a,b)=>a-b)));
const constPools = builds.map(b=>b.constPool ? b.constPool.VP.a+','+b.constPool.VP.b : 'none');
const variants = builds.map(b=>b.vmVariant ? b.vmVariant.name : 'none');
const encs = builds.map(b=>b.encFormat||'none');
const dispatch = builds.map(b=>b.dispatcher||'none');
console.log('unique opcode maps', new Set(opMaps).size,'/20');
console.log('unique vault VP a+b', new Set(constPools).size,'/20');
console.log('unique vmVariant', new Set(variants).size,'/20', [...new Set(variants)]);
console.log('unique encFormat', new Set(encs).size,'/20', [...new Set(encs)]);
console.log('unique dispatcher', new Set(dispatch).size,'/20', [...new Set(dispatch)]);
console.log('sample opcodes build0', Object.values(builds[0].OPCODES).slice(0,5).join(','));
console.log('sample opcodes build1', Object.values(builds[1].OPCODES).slice(0,5).join(','));

// same seed -> byte-identical
const a = applyBytecodeVm(sample, {seedOverride: 12345, profile:'BALANCED'});
const b = applyBytecodeVm(sample, {seedOverride: 12345, profile:'BALANCED'});
console.log('same seed identical?', a===b ? 'YES' : 'NO', 'len',a.length);
// different seed -> materially different
const c = applyBytecodeVm(sample, {seedOverride: 54321, profile:'BALANCED'});
console.log('different seed materially different?', a!==c && a.length!==c.length || a.slice(0,500)!==c.slice(0,500) ? 'YES' : 'NO');

// Require meaningful structural differences: at least opcode maps distinct, encFormat or dispatcher varies
const meaningful = new Set(opMaps).size===20 && (new Set(encs).size>1 || new Set(dispatch).size>1);
console.log('meaningful structural differences?', meaningful ? 'YES' : 'PARTIAL (only opcode maps var)');

// Serialized image comparison: full vm strings
const vmStrs = builds.map((_,i)=>applyBytecodeVm(sample, {seedOverride:i*0x9e3779b9, profile:'BALANCED'}));
console.log('unique vm strings', new Set(vmStrs).size,'/20');
