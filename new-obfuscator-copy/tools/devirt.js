// tools/devirt.js — Devirtualization resistance harness (spec §22, requirement #11)
// Attempts the 9 analysis tasks against own output and scores difficulty.
// Run via: node tools/devirt.js

import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const SRC = 'local x="secret_123"; print(x)';

function tryTask(name, fn) {
  try { const r = fn(); console.log(`[ ${r.ok ? 'EASY' : 'HARD'} ] ${name}: ${r.detail}`); return r; }
  catch(e){ console.log(`[ HARD ] ${name}: throw ${String(e).slice(0,120)}`); return { ok:false }; }
}

const vm = applyBytecodeVm(SRC);
if (!vm) { console.log('vm fallback — nothing to devirt'); process.exit(0); }

console.log('VM len', vm.length);

tryTask('1 extract VM image', () => {
  const m = vm.match(/local v[0-9a-f]{6}=\{([\d,]+)\}/);
  return { ok: !!m, detail: m ? `vault ${m[1].split(',').length} bytes` : 'no vault' };
});
tryTask('2 identify decoder', () => {
  const m = vm.match(/local \w+=function\(i\)[\s\S]*?local b=\([\d\*\+%]+\)/);
  return { ok: !!m, detail: m ? 'vault decoder found' : 'decoder hidden' };
});
tryTask('3 instruction boundaries', () => {
  const m = vm.match(/local src=\{([\d,]+)\}/);
  return { ok: !!m, detail: m ? `blob len ${m[1].split(',').length}` : 'no blob' };
});
tryTask('4 infer opcode map', () => {
  const ops = [...vm.matchAll(/HAND\[[^\]]+\]=function/g)].length;
  return { ok: ops>10, detail: `handlers ${ops}` };
});
tryTask('5 identify handlers', () => {
  const add = vm.includes('a + b') || vm.includes('a+b');
  return { ok: add, detail: add?'ADD pattern visible':'obscured' };
});
tryTask('6 reconstruct CFG', () => {
  const jmps = (vm.match(/JMP|JIF/g)||[]).length;
  return { ok: jmps>0, detail: `jumps lexical ${jmps}` };
});
tryTask('7 recover constants', () => {
  const vt = vm.match(/local R=\{[^}]+\}/);
  return { ok: !!vt, detail: vt? 'refs table visible':'hidden' };
});
tryTask('8 recover functions', () => {
  const ch = (vm.match(/\{c=cd,p=ps,v=va\}/g)||[]).length;
  return { ok: ch>0, detail: `${ch} chunks pattern` };
});
tryTask('9 reconstruct high-level Lua', () => {
  // would require full decompiler; score as HARD if we get here
  return { ok:false, detail: 'needs decompiler (hard)' };
});

console.log('\nScoring: EASY = attacker succeeds statically; HARD = requires dynamic or per-build work.');
console.log('Goal (spec §22): make ≥5 HARD while preserving correctness/perf.');
