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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-extract-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, source + '\nprint(RESULT)', 'utf8');
  try { return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 20000 })).trim(); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const cases = [
  ['VM NONE constants', 'local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(CONSTANTS))) return 40+2 end RESULT=f()', '42'],
  ['VM NONE globals and constants', 'G=40 local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(GLOBALS, CONSTANTS))) return G+2 end RESULT=f()', '42'],
  ['VM OPAL constants', 'local function f() LPH_ATTRIBUTES(VM(OPAL), TRANSFORM(EXTRACT(CONSTANTS))) return 6*7 end RESULT=f()', '42'],
  ['default EXTRACT', 'G=9 local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT)) return G+3 end RESULT=f()', '12'],
];
let pass = 0;
for (const [target, exe] of Object.entries(runtimes)) {
  for (const [name, source, expected] of cases) {
    const artifact = applyBytecodeVm(source, { target, profile: 'BALANCED', seedOverride: 8123, rethrow: true });
    const output = runExe(exe, artifact);
    if (output !== expected) throw new Error(`${target}/${name}: expected ${expected}, got ${output}`);
    pass++;
  }
}
console.log(`TRANSFORM(EXTRACT) cross-target matrix: ${pass}/${cases.length * Object.keys(runtimes).length} passed`);
console.log('VM/NONE and VM bytecode paths were both exercised; Luau exact 0.709 identity remains unverified.');
