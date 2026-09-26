import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const src = `local a = 2+3; print(a)`;
const build = _vmBcCompile(src, {profile:'BALANCED', seedOverride:123});
console.log("chunks", build.chunks[0].code);
console.log("irStats", build.irStats);
console.log("vault", build.vaultPlain.slice(0,20));
console.log("OPCODES NUMK", build.OPCODES['NUMK'], "ADD", build.OPCODES['ADD']);

// Also test without optimizer: disable folding by using a src that doesn't fold
const src2 = `local a = 2+3*4; print(a)`;
const build2 = _vmBcCompile(src2, {profile:'BALANCED', seedOverride:123});
console.log("src2 code", build2.chunks[0].code.slice(0,20));
console.log("src2 irStats", build2.irStats);

// Test that optimizer actually folds: 2+3 should be folded to 5
// The code should have fewer instructions if folded
const src3 = `local a = 2+3; local b = a*2; print(b)`;
const build3 = _vmBcCompile(src3, {profile:'BALANCED', seedOverride:123});
console.log("src3 code len", build3.chunks[0].code.length, "irStats", build3.irStats);
