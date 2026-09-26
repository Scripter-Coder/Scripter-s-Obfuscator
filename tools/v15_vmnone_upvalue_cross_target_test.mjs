// Native differential for the VM(NONE) upvalue bridge across every supplied
// executable. Each program is also run unobfuscated as the reference.
import luaparse from 'luaparse';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const RUNTIMES = {
  lua51: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\lua-5.1.5\\lua-5.1.5\\src\\lua.exe',
  lua52: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.2.4\\src\\lua.exe',
  lua53: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.3.6\\src\\lua.exe',
  lua54: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.4.8\\src\\lua.exe',
  luajit: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\LuaJIT-2.1\\src\\luajit.exe',
  luau: 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\luau-windows\\luau.exe',
};

function runExe(exe, source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-up-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, `${source}\nprint(RESULT)\n`, 'utf8');
  try {
    return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 30000 })).trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function stripAttributes(src) {
  let out = '';
  for (let i = 0; i < src.length;) {
    if (src.startsWith('LPH_ATTRIBUTES', i)) {
      let j = i + 'LPH_ATTRIBUTES'.length;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '(') {
        let depth = 0;
        for (; j < src.length; j++) {
          if (src[j] === '(') depth++;
          else if (src[j] === ')') { depth--; if (depth === 0) { j++; break; } }
        }
        i = j;
        continue;
      }
    }
    out += src[i++];
  }
  return out;
}

const N = 'LPH_ATTRIBUTES(VM(NONE))';
const CASES = [
  ['read', `local function outer() local x=41 local function inner() ${N} return x+1 end return inner() end RESULT=outer()`, '42'],
  ['write', `local function outer() local x=41 local function inner() ${N} x=x+1 return x end inner() return x end RESULT=outer()`, '42'],
  ['multi-capture', `local function o() local a=1 local b=2 local function i() ${N} return a*10+b end return i() end RESULT=o()`, '12'],
  ['sibling-sharing', `local function outer() local c=0 local function inc() ${N} c=c+1 end local function get() ${N} return c end inc() inc() return get() end RESULT=outer()`, '2'],
  ['table-mutation', `local function outer() local t={n=0} local function bump() ${N} t.n=t.n+1 end local function read() ${N} return t.n end bump() bump() bump() return read() end RESULT=outer()`, '3'],
  ['escaping-closure', `local function mk() local x=7 local function f() ${N} return x end return f end local g=mk() RESULT=g()`, '7'],
  ['counter-closure', `local function mk() local n=0 return function() ${N} n=n+1 return n end end local f=mk() f() RESULT=f()`, '2'],
  ['recursion', `local function fact(n) ${N} if n<=1 then return 1 end return n*fact(n-1) end RESULT=fact(5)`, '120'],
  ['param-capture', `local function outer(p) local function inner() ${N} return p+1 end return inner() end RESULT=outer(41)`, '42'],
  ['string-capture', `local function o() local s='hi' local function i() ${N} return s..'!' end return i() end RESULT=o()`, 'hi!'],
  ['three-captures', `local function o() local a=1 local b=2 local c=3 local function i() ${N} return a+b+c end return i() end RESULT=o()`, '6'],
];

let pass = 0;
let total = 0;
const failures = [];
for (const [target, exe] of Object.entries(RUNTIMES)) {
  for (const [name, source, expected] of CASES) {
    total++;
    try {
      const plain = runExe(exe, stripAttributes(source));
      if (plain !== expected) { failures.push(`${target}/${name}: reference returned ${plain}, expected ${expected}`); continue; }
      const artifact = applyBytecodeVm(source, { target, profile: 'BALANCED', seedOverride: 9090, rethrow: true });
      const got = runExe(exe, artifact);
      if (got !== expected) { failures.push(`${target}/${name}: expected ${expected}, got ${got}`); continue; }
      pass++;
    } catch (error) {
      failures.push(`${target}/${name}: ${String((error && error.message) || error).slice(0, 120)}`);
    }
  }
}

for (const failure of failures) console.log('FAIL ' + failure);
console.log(`VM(NONE) upvalue bridge native differential: ${pass}/${total} passed`);
if (failures.length) process.exit(1);
console.log('All six executables verified behaviorally; Luau exact 0.709 identity remains unverified.');
