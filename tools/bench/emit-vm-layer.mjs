// Emit the raw VM layer only (no outer loader encryption) for deob.py benchmarking.
import { readFileSync, writeFileSync } from 'fs';
import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const [, , inPath, outPath, ...rest] = process.argv;
const opts = {};
for (const a of rest) {
  const eq = a.indexOf('=');
  opts[a.slice(2, eq)] = a.slice(eq + 1);
}
const src = readFileSync(inPath, 'utf8');
const o = {
  profile: opts.profile || 'SECURE',
  rethrow: true,
  seedOverride: opts.seed ? Number(opts.seed) : undefined
};
const t0 = Date.now();
const vmSrc = applyBytecodeVm(src, o);
writeFileSync(outPath, vmSrc, 'utf8');
console.log('emitted', vmSrc.length, 'chars in', Date.now() - t0, 'ms');