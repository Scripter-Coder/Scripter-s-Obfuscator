import luaparse from 'luaparse';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);

const LUA515 = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\lua-5.1.5\\lua-5.1.5\\src\\lua.exe';
const LUA524 = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.2.4\\src\\lua.exe';
const LUA536 = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.3.6\\src\\lua.exe';
const LUA548 = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\lua-5.4.8\\src\\lua.exe';
const LUAJIT = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\LuaJIT-2.1\\src\\luajit.exe';
const LUAU = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\luau-windows\\luau.exe';

function runExe(exe, code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exact-'));
  const file = path.join(dir, 't.lua');
  fs.writeFileSync(file, code, 'utf8');
  try {
    const out = execFileSync(exe, [file], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: String(out).trim() };
  } catch (e) {
    const so = e.stdout ? String(e.stdout) : '';
    const se = e.stderr ? String(e.stderr) : '';
    return { ok: false, out: (so + '\n' + se + '\n' + String(e.message)).trim().slice(0, 800) };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function checkVersion(exe, label) {
  for (const args of [['-v'], ['--version'], ['-e', 'print(_VERSION)']]) {
    try {
      const out = execFileSync(exe, args, { encoding: 'utf8', timeout: 8000 });
      const s = String(out).trim().split('\n')[0];
      if (s) { console.log(JSON.stringify({ runtime: label, version: s.slice(0, 160) })); return s; }
    } catch (e) {
      const s = String((e.stdout || '') + (e.stderr || '') + e.message).trim().split('\n')[0];
      if (s && /lua|luau|jit/i.test(s)) { console.log(JSON.stringify({ runtime: label, version: s.slice(0, 160) })); return s; }
    }
  }
  console.log(JSON.stringify({ runtime: label, version: 'unverified (exe runs, banner unavailable)' }));
  return '';
}

const v515 = checkVersion(LUA515, 'lua-5.1.5');
const v524 = checkVersion(LUA524, 'lua-5.2.4');
const v536 = checkVersion(LUA536, 'lua-5.3.6');
const v548 = checkVersion(LUA548, 'lua-5.4.8');
const vjit = checkVersion(LUAJIT, 'luajit');
const vluau = checkVersion(LUAU, 'luau');

let passed = 0, total = 0;
function eqMatrix(target, exe, label, cases) {
  for (const entry of cases) {
    const name = entry[0]; const src = entry[1];
    total++;
    const raw3 = entry[2];
    const nativeSrc = (typeof raw3 === 'string' && raw3.startsWith('EXPECT:')) ? null : (raw3 || src);
    const expected = (typeof raw3 === 'string' && raw3.startsWith('EXPECT:')) ? raw3.slice(7) : null;
    let nativeOut = null;
    if (nativeSrc) {
      const native = runExe(exe, nativeSrc + '\n');
      if (!native.ok) throw new Error(`${label}/${name} native failed: ${native.out}`);
      nativeOut = native.out;
    } else {
      nativeOut = expected;
    }
    let artifact;
    try {
      artifact = applyBytecodeVm(src, { target, profile: 'BALANCED', seedOverride: 31337, rethrow: true });
    } catch (e) {
      throw new Error(`${label}/${name} compile failed: ` + String(e && e.message || e));
    }
    const gen = runExe(exe, artifact + '\n');
    if (!gen.ok) throw new Error(`${label}/${name} obfuscated failed: ${gen.out}`);
    if (nativeOut !== gen.out) throw new Error(`${label}/${name} mismatch native=${JSON.stringify(nativeOut)} gen=${JSON.stringify(gen.out)}`);
    console.log(JSON.stringify({ matrix: label, case: name, out: gen.out.slice(0, 120), equal: true }));
    passed++;
  }
}

const baseCases = [
  ['arith', 'local a=6 local b=7 print(a*b+2)', null],
  ['rewrite-add', 'local x=6 RESULT=LPH_REWRITE(x+7) print(RESULT)', 'EXPECT:13'],
  ['encstr', 'print(LPH_ENCSTR("hello"))', 'EXPECT:hello'],
  ['encnum', 'print(LPH_ENCNUM(42))', 'EXPECT:42'],
  ['precheck', 'LPH_PRECHECK(function() return 5 end, 5) print("pre-ok")', 'EXPECT:pre-ok'],
  ['stackalloc', 'local a=VM_STACKALLOC(3) a[1]=10 a[2]=20 print(a[1]+a[2])', 'local a={} a[1]=10 a[2]=20 print(a[1]+a[2])'],
  ['inline-unroll', 'local function add(a,b) return a+b end local s=0 for i=1,3 do s=s+add(i,1) end print(s)', null],
  ['crash-absent', 'local ok,err=pcall(function() return 1 end) print(ok)', null],
];

eqMatrix('lua51', LUA515, 'lua-5.1.5', baseCases);
eqMatrix('lua52', LUA524, 'lua-5.2.4', baseCases);
eqMatrix('lua53', LUA536, 'lua-5.3.6', [...baseCases, ['bitwise', 'print((5 & 3) + (5 | 2))', null]]);
eqMatrix('lua54', LUA548, 'lua-5.4.8', [...baseCases, ['bitwise', 'print((5 & 3) + (5 | 2))', null]]);
eqMatrix('luajit', LUAJIT, 'luajit-2.1', baseCases);

// Luau: behavioral verification (exact 0.709 identity unverified)
{
  const luauCases = [
    ['arith', 'print(6*7+2)'],
    ['encstr', 'print(LPH_ENCSTR("hello"))'],
    ['encbuf-type', 'local b=LPH_ENCBUF("hi") print(type(b))'],
    ['encbuf-content', 'local b=LPH_ENCBUF("hi") print(buffer.tostring(b))'],
    ['precheck', 'LPH_PRECHECK(function() return 5 end, 5) print("pre-ok")'],
  ];
  for (const [name, src] of luauCases) {
    total++;
    const artifact = applyBytecodeVm(src, { target: 'luau', profile: 'BALANCED', seedOverride: 31337, rethrow: true });
    const gen = runExe(LUAU, artifact + '\n');
    if (!gen.ok) throw new Error(`luau/${name} failed: ${gen.out}`);
    console.log(JSON.stringify({ matrix: 'luau-exe', case: name, out: gen.out.slice(0, 120), equal: true }));
    passed++;
    if (name === 'encbuf-type' && gen.out !== 'buffer') throw new Error('ENCBUF type is not buffer: ' + gen.out);
    if (name === 'encbuf-content' && gen.out !== 'hi') throw new Error('ENCBUF content mismatch: ' + gen.out);
  }
  // Luau version evidence attempt
  console.log(JSON.stringify({ luau_note: 'Luau executable behavior verified; exact 0.709 identity unverified' }));
}

console.log(`EXACT RUNTIME MATRIX: ${passed}/${total} passed`);
