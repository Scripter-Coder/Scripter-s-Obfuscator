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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-stackalloc-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, source + '\nprint(RESULT)', 'utf8');
  try { return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 20000 })).trim(); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const cases = [
  ['VM capture write/read', 'local a=LPH_STACKALLOC(2) a[1]=4 local function f() a[1]=9 return a[1] end RESULT=f()', '9'],
  ['VM NONE capture read', 'local a=LPH_STACKALLOC(2) a[1]=4 local function f() LPH_ATTRIBUTES(VM(NONE)) return a[1] end RESULT=f()', '4'],
  ['VM NONE capture length', 'local a=LPH_STACKALLOC(2) local function f() LPH_ATTRIBUTES(VM(NONE)) return # a end RESULT=f()', '2'],
  ['VM NONE proxy methods', 'local a=LPH_STACKALLOC(3) a[1]=4 a[2]=5 local function f() LPH_ATTRIBUTES(VM(NONE)) local x,y=a:unpack(1,2) local t=a:pack() a:clear(1,1) return x+y..\":\"..t.n..\":\"..tostring(a[1]) end RESULT=f()', '9:3:nil'],
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
console.log(`STACKALLOC cross-target capture/proxy matrix: ${pass}/${cases.length * Object.keys(runtimes).length} passed`);
console.log('VM/NONE length lowering is host-bridge based for Lua 5.1/LuaJIT; Luau exact 0.709 identity remains unverified.');
