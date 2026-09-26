import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src='local a=1; print(a)';
const vm1=applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 12345});
const vm2=applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 12345});
const vm3=applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 54321});
console.log('same seed identical?', vm1===vm2 ? 'YES' : 'NO (should be YES)');
console.log('different seed differs?', vm1!==vm3 ? 'YES' : 'NO');
if(vm1!==vm2) {console.log('FAIL reproducibility'); process.exit(1);}
if(vm1===vm3) {console.log('FAIL variance'); process.exit(1);}
console.log('Seed test PASS');
