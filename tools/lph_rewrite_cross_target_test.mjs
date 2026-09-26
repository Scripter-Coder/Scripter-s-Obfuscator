import luaparse from 'luaparse';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const runtimes = {
  lua51: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\lua-5.1.5\\lua-5.1.5\\src\\lua.exe',
  lua52: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.2.4\\src\\lua.exe',
  lua53: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.3.6\\src\\lua.exe',
  lua54: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.4.8\\src\\lua.exe',
  luajit: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\LuaJIT-2.1\\src\\luajit.exe',
  luau: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\luau-windows\\luau.exe',
};

function runExe(exe, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lph-rewrite-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, source, 'utf8');
  try {
    return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 20000 })).trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const common = [
  ['local', 'local x=12 local y=10 print(LPH_REWRITE(x&y))', '8'],
  ['global', 'G=12 print(LPH_REWRITE(G&10))', '8'],
  ['upvalue', 'local function outer() local x=12 local y=10 return LPH_REWRITE(x&y) end print(outer())', '8'],
  ['nested', 'local x=12 local y=10 print(LPH_REWRITE((x&y)+(x|y)))', '22'],
  ['context', 'local x=12 local y=10 print(LPH_REWRITE(x&y,{preset="extreme",budget="large",context={x,y}}))', '8'],
  ['preset-fast', 'local x=12 local y=10 print(LPH_REWRITE(x+y,{preset="fast",budget="small"}))', '22'],
  ['preset-standard', 'local x=12 local y=10 print(LPH_REWRITE(x+y,{preset="standard",budget="medium"}))', '22'],
  ['preset-strong', 'local x=12 local y=10 print(LPH_REWRITE(x+y,{preset="strong",budget="large"}))', '22'],
  ['preset-extreme', 'local x=12 local y=10 print(LPH_REWRITE(x+y,{preset="extreme",budget="large"}))', '22'],
  ['shift-left', 'local x=12 local y=2 print(LPH_REWRITE(x<<y))', '48'],
  ['shift-right', 'local x=12 local y=2 print(LPH_REWRITE(x>>y))', '3'],
  ['unary-not', 'local x=12 print(LPH_REWRITE(~x))', '-13'],
];
const edges = {
  lua32: [
    ['edge-31', 'local x=1 print(LPH_REWRITE(x<<31))', '-2147483648'],
    ['edge-32', 'local x=7 print(LPH_REWRITE(x<<32))', '0'],
    ['edge-negative-shift', 'local x=1 print(LPH_REWRITE(x<<-1))', '0'],
    ['edge-logical-right', 'local x=-1 print(LPH_REWRITE(x>>1))', '2147483647'],
  ],
  lua64: [
    ['edge-64-wrap', 'local x=0x7fffffffffffffff print(LPH_REWRITE(x<<1))', '-2'],
    ['edge-64-right', 'local x=-1 print(LPH_REWRITE(x>>32))', '4294967295'],
  ],
};
let total = 0;
let passed = 0;
for (const [target, exe] of Object.entries(runtimes)) {
  const cases = [...common, ...(target === 'lua53' || target === 'lua54' ? edges.lua64 : edges.lua32)];
  for (const [name, source, expected] of cases) {
    total++;
    const artifact = applyBytecodeVm(source, { target, profile: 'BALANCED', seedOverride: 7331, rethrow: true });
    const output = runExe(exe, artifact);
    const equal = output === expected;
    if (!equal) throw new Error(`${target}/${name}: expected ${expected}, got ${output}`);
    passed++;
  }
  for (const seed of [1, 17, 99]) {
    total++;
    const source = 'local x=12 local y=10 print(LPH_REWRITE(x+y,{preset="strong",budget="large"}))';
    const artifact = applyBytecodeVm(source, { target, profile: 'BALANCED', seedOverride: seed, rethrow: true });
    if (runExe(exe, artifact) !== '22') throw new Error(`${target}/seed-${seed}: mismatch`);
    passed++;
  }
  for (const op of ['/', '%', '^', '//']) {
    total++;
    let rejected = false;
    try { applyBytecodeVm(`local a=8 local b=3 print(LPH_REWRITE(a${op}b))`, { target, profile: 'BALANCED', seedOverride: 5, rethrow: true }); }
    catch (error) { rejected = /LPH_REWRITE|does not support/.test(String(error)); }
    if (!rejected) throw new Error(`${target}/reject-${op}: operator was accepted`);
    passed++;
  }
  if (!['lua53', 'lua54'].includes(target)) {
    total++;
    let rejected = false;
    try { applyBytecodeVm('local a=1 print(a&1)', { target, profile: 'BALANCED', seedOverride: 5, rethrow: true }); }
    catch (error) { rejected = /bitwise|target|parser rejected/.test(String(error)); }
    if (!rejected) throw new Error(`${target}: outside-macro bitwise was accepted`);
    passed++;
  }
}

for (const target of ['lua51', 'lua52', 'luajit', 'luau']) {
  total++;
  let rejected = false;
  try { applyBytecodeVm('local a=1 local b=2 print(LPH_REWRITE(a/b))', { target, profile: 'BALANCED', seedOverride: 5, rethrow: true }); }
  catch (error) { rejected = /does not support|LPH_REWRITE/.test(String(error)); }
  if (!rejected) throw new Error(`${target}: slash was accepted`);
  passed++;
}

const eight = 'local a1=1 local a2=2 local a3=3 local a4=4 local a5=5 local a6=6 local a7=7 local a8=8 print(LPH_REWRITE(a1+a2+a3+a4+a5+a6+a7+a8))';
applyBytecodeVm(eight, { target: 'lua51', profile: 'BALANCED', seedOverride: 2, rethrow: true });
total++; passed++;
const nine = eight.replace('local a8=8 ', 'local a8=8 local a9=9 ') .replace('a7+a8', 'a7+a8+a9');
let nineRejected = false;
try { applyBytecodeVm(nine, { target: 'lua51', profile: 'BALANCED', seedOverride: 2, rethrow: true }); }
catch (error) { nineRejected = /at most 8/.test(String(error)); }
if (!nineRejected) throw new Error('nine-identifier LPH_REWRITE expression was accepted');
total++; passed++;
let contextRejected = false;
try { applyBytecodeVm('print(LPH_REWRITE(1+2,{context={1,2}}))', { target: 'lua51', profile: 'BALANCED', seedOverride: 2, rethrow: true }); }
catch (error) { contextRejected = /identifier names/.test(String(error)); }
if (!contextRejected) throw new Error('numeric context identifiers were accepted');
total++; passed++;

console.log(`LPH_REWRITE cross-target matrix: ${passed}/${total} passed`);
console.log('Luau note: behavioral executable coverage only; exact Luau 0.709 identity remains unverified.');
