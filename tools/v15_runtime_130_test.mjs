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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v15-130-'));
  const file = path.join(dir, 'case.lua');
  fs.writeFileSync(file, source, 'utf8');
  try { return String(execFileSync(exe, [file], { encoding: 'utf8', timeout: 20000 })).trim(); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const cases = [];
const add = (name, source, expected) => cases.push({ name, source, expected });
for (let i = 0; i < 20; i++) {
  const a = i + 2, b = i + 3;
  add(`arith-${i}`, `local a=${a} local b=${b} RESULT=tostring(a+b)`, String(a + b));
}
for (let i = 0; i < 15; i++) {
  const n = i + 1;
  add(`string-table-${i}`, `local t={${n},"x${i}"} RESULT=tostring(t[1])..":"..t[2]`, `${n}:x${i}`);
}
for (let i = 0; i < 15; i++) {
  const n = i + 1;
  add(`closure-${i}`, `local function make(x) return function() return x+${n} end end RESULT=tostring(make(${n})())`, String(n * 2));
}
for (let i = 0; i < 15; i++) {
  const n = i + 3;
  add(`control-${i}`, `local s=0 for i=1,${n} do if i%2==0 then s=s+i else s=s+1 end end RESULT=tostring(s)`, String((() => { let s=0; for (let i=1;i<=n;i++) s += i%2===0 ? i : 1; return s; })()));
}
for (let i = 0; i < 15; i++) {
  const n = i + 1;
  add(`vararg-${i}`, `local function f(...) local a,b=... return (a or 0)+(b or 0)+select("#",...) end RESULT=tostring(f(${n},${n + 1}))`, String(n + n + 1 + 2));
}
const bitCases = [
  ['band', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a&b))', '8'],
  ['bor', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a|b))', '14'],
  ['bxor', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a~b))', '6'],
  ['bnot', 'local a=12 RESULT=tostring(LPH_REWRITE(~a))', '-13'],
  ['shl', 'local a=12 local b=2 RESULT=tostring(LPH_REWRITE(a<<b))', '48'],
  ['shr', 'local a=12 local b=2 RESULT=tostring(LPH_REWRITE(a>>b))', '3'],
  ['nested', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE((a&b)+(a|b)))', '22'],
  ['context', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a&b,{preset="extreme",budget="large",context={a,b}}))', '8'],
  ['fast', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a+b,{preset="fast",budget="small"}))', '22'],
  ['standard', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a+b,{preset="standard",budget="medium"}))', '22'],
  ['strong', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a+b,{preset="strong",budget="large"}))', '22'],
  ['extreme', 'local a=12 local b=10 RESULT=tostring(LPH_REWRITE(a+b,{preset="extreme",budget="large"}))', '22'],
  ['global', 'G=12 RESULT=tostring(LPH_REWRITE(G&10))', '8'],
  ['upvalue', 'local function o() local a=12 local b=10 return LPH_REWRITE(a&b) end RESULT=tostring(o())', '8'],
  ['edge-left', 'local a=1 RESULT=tostring(LPH_REWRITE(a<<31))', '-2147483648'],
  ['edge-zero', 'local a=7 RESULT=tostring(LPH_REWRITE(a<<32))', '0'],
  ['edge-right', 'local a=-1 RESULT=tostring(LPH_REWRITE(a>>1))', '2147483647'],
  ['edge-negative', 'local a=1 RESULT=tostring(LPH_REWRITE(a<<-1))', '0'],
  ['unary', 'local a=12 RESULT=tostring(LPH_REWRITE(-a))', '-12'],
  ['mul', 'local a=12 local b=2 RESULT=tostring(LPH_REWRITE(a*b))', '24'],
];
for (const [name, source, expected] of bitCases) add(`rewrite-${name}`, source, expected);
for (let i = 0; i < 10; i++) add(`enc-${i}`, `RESULT=LPH_ENCSTR("v${i}")..":"..tostring(LPH_ENCNUM(${i + 10}))`, `v${i}:${i + 10}`);
for (let i = 0; i < 10; i++) add(`precheck-${i}`, `LPH_PRECHECK(function() return ${i + 1} end,${i + 1}) RESULT="ok"`, 'ok');
for (let i = 0; i < 10; i++) {
  if (i % 2 === 0) add(`stack-${i}`, `local a=LPH_STACKALLOC(3) a[1]=${i + 1} a[2]=${i + 2} local t=a:pack() RESULT=tostring(a[1]+a[2])..":"..tostring(t.n)`, `${(i + 1) + (i + 2)}:3`);
  else add(`stack-${i}`, `local a=LPH_STACKALLOC(3) a[1]=${i + 1} a[2]=${i + 2} local x,y=a:unpack() RESULT=tostring(x+y)`, `${(i + 1) + (i + 2)}`);
}
if (cases.length !== 130) throw new Error(`corpus construction produced ${cases.length}`);
let pass = 0;
for (const [target, exe] of Object.entries(runtimes)) {
  for (const c of cases) {
    const artifact = applyBytecodeVm(c.source, { target, profile: 'BALANCED', seedOverride: 9000 + pass, rethrow: true });
    const output = runExe(exe, artifact + '\nprint(RESULT)');
    let expected = c.expected;
    if (target === 'lua53' || target === 'lua54') {
      if (c.name === 'rewrite-edge-left') expected = '2147483648';
      if (c.name === 'rewrite-edge-right') expected = '9223372036854775807';
      if (c.name === 'rewrite-edge-zero') expected = '30064771072';
    }
    if (output !== expected) throw new Error(`${target}/${c.name}: expected ${expected}, got ${output}`);
    pass++;
  }
}
console.log(`V15 130-case cross-target corpus: ${pass}/${cases.length * Object.keys(runtimes).length} passed`);
console.log('Runtime case count per executable: 130; Luau exact 0.709 identity remains unverified.');
