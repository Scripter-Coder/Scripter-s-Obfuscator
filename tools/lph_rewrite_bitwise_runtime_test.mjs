import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const runtimes = [
  ['lua53', 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.3.6\\src\\lua.exe'],
  ['lua54', 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.4.8\\src\\lua.exe'],
];
const profiles = ['OPAL', 'ONYX', 'FAST', 'BALANCED', 'SECURE'];
const expressions = [
  ['band', '(a & b)', 5],
  ['bor', '(a | b)', 7],
  ['bxor', '(a ~ b)', 2],
  ['bnot', '(~a)', -6],
  ['shl', '(a << 2)', 20],
  ['shr', '(b >> 1)', 3],
  ['mixed', '((a & b) | (c << 2)) ~ (a >> 1)', 15],
];

function execute(executable, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lph-rewrite-bitwise-'));
  const file = path.join(directory, 'probe.lua');
  fs.writeFileSync(file, source);
  return execFileSync(executable, [file], { encoding: 'utf8' }).trim();
}

let total = 0;
for (const [target, executable] of runtimes) {
  for (const profile of profiles) {
    for (const [name, expression, expected] of expressions) {
      const nativeSource = `local a,b,c=5,7,2; print(${expression})`;
      const rewrittenSource = `local a,b,c=5,7,2; print(LPH_REWRITE(${expression}, {preset="strong", budget="large", context={a,b}}))`;
      const native = execute(executable, nativeSource);
      const artifact = applyBytecodeVm(rewrittenSource, {
        target,
        profile,
        seedOverride: 700 + total,
        rethrow: true,
      });
      const generated = execute(executable, artifact);
      if (native !== String(expected) || generated !== native) {
        throw new Error(`${target}/${profile}/${name}: native=${native}, generated=${generated}, expected=${expected}`);
      }
      console.log(JSON.stringify({ target, profile, case: name, native, rewritten: generated, equal: native === generated }));
      total++;
    }
  }
}
console.log(`LPH_REWRITE bitwise runtime differential: ${total}/${total} passed`);
