import luaparse from 'luaparse';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const SRC = 'print("a + e + c")';
const strong = `local function main()
  LPH_ATTRIBUTES(VM(ONYX), PRESET(SECURE), MBA(STRONG))
  local msg = LPH_ENCSTR("a + e + c", 0x5EEDBEEF, 0x5EEDBEEF)
  print(msg)
end
main()`;

const RUNTIMES = {
  'lua-5.1.5': 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\lua-5.1.5\\lua-5.1.5\\src\\lua.exe',
  'lua-5.2.4': 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.2.4\\src\\lua.exe',
  'lua-5.3.6': 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.3.6\\src\\lua.exe',
  'lua-5.4.8': 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.4.8\\src\\lua.exe',
  'LuaJIT-2.1': 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\LuaJIT-2.1\\src\\luajit.exe',
  'luau': 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\luau-windows\\luau.exe',
};

let build = null;
const artifact = applyBytecodeVm(strong, {
  target: 'lua51', profile: 'SECURE', seedOverride: 1337, rethrow: true,
  onBuild: (b) => { build = b; },
});

console.log('source bytes :', strong.length);
console.log('artifact bytes:', artifact.length);
console.log('blowup        :', (artifact.length / strong.length).toFixed(1) + 'x');
console.log('plaintext "a + e + c" present:', artifact.includes('a + e + c'));
console.log('');

for (const [name, exe] of Object.entries(RUNTIMES)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obf-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, artifact, 'utf8');
  let out;
  try {
    out = String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 30000 })).trim();
  } catch (e) {
    out = 'FAILED: ' + String(e.message || e).slice(0, 60);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(name.padEnd(12), '->', out);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obf-keep-'));
const outFile = path.join(dir, 'obfuscated.lua');
fs.writeFileSync(outFile, artifact, 'utf8');
console.log('\nartifact written to:', outFile);
console.log('--- first 12 lines of artifact ---');
console.log(artifact.split('\n').slice(0, 12).join('\n').slice(0, 900));
