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
function runExpectFailure(exe, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-crash-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, source, 'utf8');
  try { execFileSync(exe, [file], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }); return false; }
  catch (error) { return /LPH_CRASH/.test(String(error.stderr || '') + String(error.stdout || '') + String(error.message || '')); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
let pass = 0;
for (const [target, exe] of Object.entries(runtimes)) {
  const source = 'error=function() return "swallowed" end LPH_CRASH()';
  const artifact = applyBytecodeVm(source, { target, profile: 'BALANCED', seedOverride: 733, rethrow: true });
  if (!runExpectFailure(exe, artifact)) throw new Error(`${target}: LPH_CRASH was swallowed`);
  pass++;
}
console.log(`LPH_CRASH cross-target termination matrix: ${pass}/${Object.keys(runtimes).length} passed`);
console.log('Each supplied executable terminated with the LPH_CRASH marker; Luau exact 0.709 identity remains unverified.');
