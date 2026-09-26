// Native/generated differential for REWRITE_NAMECALLS across every supplied
// executable. Each case is compiled for the target, run by the real
// interpreter, and compared against the same program run unobfuscated.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-nc-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, `${source}\nprint(RESULT)\n`, 'utf8');
  try {
    return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 30000 })).trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const CASES = [
  ['vm-none-basic', 'G={tag="T", m=function(self,v) return self.tag..":"..tostring(v) end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return G:m(7) end RESULT=f()', 'T:7'],
  ['vm-none-chain', 'G={b={tag="C", m=function(self) return self.tag end}} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return G.b:m() end RESULT=f()', 'C'],
  ['vm-none-zeroarg', 'G={tag="Z", m=function(self) return self.tag end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return G:m() end RESULT=f()', 'Z'],
  ['vm-none-multiarg', 'G={tag="M", m=function(self,a,b) return self.tag..a..b end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return G:m(1,2) end RESULT=f()', 'M12'],
  ['vm-none-selfmutation', 'G={n=0, m=function(self,v) self.n=self.n+v return self.n end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) G:m(5) G:m(6) return G.n end RESULT=f()', '11'],
  ['vm-none-metamethod', 'G=setmetatable({tag="M"},{__index=function(_,k) return function(self) return self.tag..k end end}) local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return G:z() end RESULT=f()', 'Mz'],
  ['vm-opal', 'local o={tag="T", m=function(self,v) return self.tag..":"..tostring(v) end} local function f() LPH_ATTRIBUTES(TRANSFORM(REWRITE_NAMECALLS)) return o:m(7) end RESULT=f()', 'T:7'],
  ['vm-onyx', 'local o={tag="T", m=function(self,v) return self.tag..":"..tostring(v) end} local function f() LPH_ATTRIBUTES(VM(ONYX), TRANSFORM(REWRITE_NAMECALLS)) return o:m(7) end RESULT=f()', 'T:7'],
  ['vm-none-order', 'G={m=function(self,v) return v end} local n=0 local function mk(v) n=n*10+v return v end local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) G:m(mk(2)) end f() RESULT=tostring(n)', '2'],
  ['vm-none-loop', 'G={tag="L", m=function(self,v) return self.tag..v end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) local r="" for i=1,3 do r=r..G:m(i) end return r end RESULT=f()', 'L1L2L3'],
  ['vm-none-callvalue-untouched', 'G=setmetatable({},{__call=function(_,a) return a*2 end}) local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return G(21) end RESULT=f()', '42'],
  ['with-extract', 'G={tag="E", m=function(self,v) return self.tag..tostring(v) end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(CONSTANTS), REWRITE_NAMECALLS)) return G:m(5) end RESULT=f()', 'E5'],
];

// Documented combination that is deliberately bounded: CONTROL_FLOW is an IR
// transform with no native-source implementation, so pairing it with
// VM(NONE) must fail closed rather than silently emit untransformed code.
const BOUNDED = [
  ['control-flow-on-vm-none', 'G={tag="C", m=function(self,v) return self.tag..v end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(CONTROL_FLOW, REWRITE_NAMECALLS)) return G:m("X") end RESULT=f()', /not implemented for VM\(NONE\)/],
];


// Removes a balanced LPH_ATTRIBUTES(...) call so the same program can be run
// unobfuscated as the differential reference.
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

let pass = 0;
let total = 0;
const failures = [];
for (const [target, exe] of Object.entries(RUNTIMES)) {
  for (const [name, source, expected] of CASES) {
    total++;
    try {
      // Differential: the expected value must also hold without obfuscation.
      const plain = runExe(exe, stripAttributes(source));
      if (plain !== expected) {
        failures.push(`${target}/${name}: unobfuscated reference returned ${plain}, expected ${expected}`);
        continue;
      }
      const artifact = applyBytecodeVm(source, { target, profile: target === 'luau' ? 'BALANCED' : 'BALANCED', seedOverride: 3131, rethrow: true });
      const got = runExe(exe, artifact);
      if (got !== expected) {
        failures.push(`${target}/${name}: expected ${expected}, got ${got}`);
        continue;
      }
      pass++;
    } catch (error) {
      failures.push(`${target}/${name}: ${String((error && error.message) || error).slice(0, 120)}`);
    }
  }
}

for (const [name, source, pattern] of BOUNDED) {
  let rejected = false;
  try {
    applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', rethrow: true });
  } catch (error) {
    rejected = pattern.test(String((error && error.message) || error));
  }
  if (!rejected) {
    failures.push(`${name}: expected a fail-closed rejection, got acceptance`);
  } else {
    console.log(`BOUNDED ${name}: rejected as documented (no silent miscompile)`);
  }
}

for (const failure of failures) console.log('FAIL ' + failure);
console.log(`REWRITE_NAMECALLS native differential: ${pass}/${total} passed`);
if (failures.length) process.exit(1);
console.log('All six executables verified behaviorally; Luau exact 0.709 identity remains unverified.');
