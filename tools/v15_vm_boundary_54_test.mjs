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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-54-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, source + '\nprint(RESULT)', 'utf8');
  try { return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 20000 })).trim(); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const cases = [];
for (let i = 0; i < 12; i++) {
  const n = i + 2;
  cases.push({ name: `none-${i}`, source: `local function n(x) LPH_ATTRIBUTES(VM(NONE)) return x+${i} end RESULT=tostring(n(${n}))`, expected: String(n + i) });
}
for (let i = 0; i < 12; i++) {
  const n = i + 2;
  cases.push({ name: `none-opal-${i}`, source: `local function n(x) LPH_ATTRIBUTES(VM(NONE)) return x+1 end local function o(x) LPH_ATTRIBUTES(VM(OPAL)) return n(x)*2 end RESULT=tostring(o(${n}))`, expected: String((n + 1) * 2) });
}
for (let i = 0; i < 12; i++) {
  const n = i + 2;
  cases.push({ name: `opal-none-${i}`, source: `local function o(x) LPH_ATTRIBUTES(VM(OPAL)) return x+1 end local function n(x) LPH_ATTRIBUTES(VM(NONE)) return o(x)*2 end RESULT=tostring(n(${n}))`, expected: String((n + 1) * 2) });
}
for (let i = 0; i < 8; i++) {
  const n = i + 2;
  cases.push({ name: `nested-${i}`, source: `local function a(x) LPH_ATTRIBUTES(VM(NONE)) return x+1 end local function b(x) LPH_ATTRIBUTES(VM(ONYX)) return a(x)*2 end local function c(x) LPH_ATTRIBUTES(VM(NONE)) return b(x)+3 end RESULT=tostring(c(${n}))`, expected: String((n + 1) * 2 + 3) });
}
for (let i = 0; i < 10; i++) {
  const n = i + 2;
  if (i % 2 === 0) {
    cases.push({ name: `pcall-${i}`, source: `local function n(fn) LPH_ATTRIBUTES(VM(NONE)) local ok,v=pcall(fn) return tostring(ok)..":"..tostring(v) end local function v() LPH_ATTRIBUTES(VM(OPAL)) return ${n} end RESULT=n(v)`, expected: `true:${n}` });
  } else {
    cases.push({ name: `xpcall-${i}`, source: `local function n(fn) LPH_ATTRIBUTES(VM(NONE)) local ok,v=xpcall(fn,function(e)return e end) return tostring(ok)..":"..tostring(v) end local function v() LPH_ATTRIBUTES(VM(ONYX)) return ${n} end RESULT=n(v)`, expected: `true:${n}` });
  }
}
if (cases.length !== 54) throw new Error(`corpus construction produced ${cases.length}`);
let pass = 0;
for (const [target, exe] of Object.entries(runtimes)) {
  for (const c of cases) {
    const artifact = applyBytecodeVm(c.source, { target, profile: 'BALANCED', seedOverride: 6100 + pass, rethrow: true });
    const output = runExe(exe, artifact);
    if (output !== c.expected) throw new Error(`${target}/${c.name}: expected ${c.expected}, got ${output}`);
    pass++;
  }
}
console.log(`V15 54-case VM-boundary corpus: ${pass}/${cases.length * Object.keys(runtimes).length} passed`);
console.log('Each executable executed all 54 boundary cases; Luau exact 0.709 identity remains unverified.');
