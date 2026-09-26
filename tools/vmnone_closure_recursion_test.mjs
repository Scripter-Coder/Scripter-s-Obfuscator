// tools/vmnone_closure_recursion_test.mjs
//
// Regression coverage for VM(NONE) closure creation and recursion.
//
// Two defects were live:
//
//  1. A native (VM(NONE)) body is emitted as loader-level source, outside the
//     lexical scope of its parent. A reference to a VM(NONE) SIBLING was
//     classified as an upvalue capture and rewritten to a cell accessor, which
//     reads a VM cell rather than the loader-level function.
//  2. Native bodies are emitted in source order, so a body calling a sibling
//     declared LATER resolved to a nil global at run time
//     ("attempt to call a nil value"), breaking mutual recursion.
//
// Fixes: sibling names are collected in a pre-pass, excluded from upvalue
// capture classification, and forward-declared as locals ahead of the native
// source so definition order stops mattering.
//
// Note on scope: plain Lua does NOT put a name in scope inside its own
// `local function` body, so `local function a() ... b() ... end` where b is
// declared later is a GLOBAL lookup and fails at run time. That is the
// language's behaviour, and this implementation matches it. Mutual recursion
// must use the canonical `local a,b; a=function..; b=function..` form, which is
// what the cases below exercise.
//
// The real defect this guards against was a sibling reference being classified
// as an upvalue capture and rewritten to a cell accessor (which reads a VM cell
// rather than the loader-level function). That silently produced wrong values
// for the canonical mutual-recursion form.

import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const SEEDS = [1, 3, 5, 9, 13, 21];

// [name, source, expected RESULT]
const CASES = [
  ['nested closure simple',
    'local function outer() LPH_ATTRIBUTES(VM(NONE)) local function inner(x) return x*2 end return inner(21) end RESULT=tostring(outer())', '42'],
  ['nested closure captures upvalue',
    'local function outer() LPH_ATTRIBUTES(VM(NONE)) local k=7 local function inner(x) return x+k end return inner(1) end RESULT=tostring(outer())', '8'],
  ['nested closure mutates upvalue',
    'local function outer() LPH_ATTRIBUTES(VM(NONE)) local k=0 local function bump() k=k+1 end bump() bump() bump() return k end RESULT=tostring(outer())', '3'],
  ['two nested closures',
    'local function outer() LPH_ATTRIBUTES(VM(NONE)) local a=2 local function f() local function g() return a*3 end return g() end return f() end RESULT=tostring(outer())', '6'],
  ['vmnone self recursion',
    'local function fact(n) LPH_ATTRIBUTES(VM(NONE)) if n<=1 then return 1 end return n*fact(n-1) end RESULT=tostring(fact(5))', '120'],
  ['vmnone mutual (canonical form)',
    'local even, odd\neven=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return true end return odd(n-1) end\nodd=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return false end return even(n-1) end\nRESULT=tostring(even(4))', 'true'],
  ['vmnone mutual odd first',
    'local even, odd\nodd=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return false end return even(n-1) end\neven=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return true end return odd(n-1) end\nRESULT=tostring(even(4))', 'true'],
  ['vmnone mutual (mutual names pre-declared)',
    'local even, odd\neven=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return true end return odd(n-1) end\nodd=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return false end return even(n-1) end\nRESULT=tostring(even(4))', 'true'],
  ['vmnone <-> vm mutual',
    'local function a(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "a" end return b(n-1) end\nlocal function b(n) LPH_ATTRIBUTES(VM(OPAL)) if n==0 then return "b" end return a(n-1) end\nRESULT=a(3)', 'b'],
  ['vm <-> vmnone mutual',
    'local a,b\na=function(n) LPH_ATTRIBUTES(VM(OPAL)) if n==0 then return "a" end return b(n-1) end\nb=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "b" end return a(n-1) end\nRESULT=a(3)', 'b'],
  ['three-way vmnone mutual (f(5) -> h)',
    'local f,g,h\nf=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "f" end return g(n-1) end\ng=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "g" end return h(n-1) end\nh=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "h" end return f(n-1) end\nRESULT=f(5)', 'h'],
  ['three-way vmnone mutual (f(4) -> g)',
    'local f,g,h\nf=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "f" end return g(n-1) end\ng=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "g" end return h(n-1) end\nh=function(n) LPH_ATTRIBUTES(VM(NONE)) if n==0 then return "h" end return f(n-1) end\nRESULT=f(4)', 'g'],
  ['vmnone closure returned then called',
    'local function mk() LPH_ATTRIBUTES(VM(NONE)) local function inner(x) return x+100 end return inner end\nRESULT=tostring(mk()(1))', '101'],
];

function runArtifact(art) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_loadbuffer(L, to_luastring(art), null, to_luastring('art'));
  if (st !== lua.LUA_OK) return 'LOADERR';
  const s2 = lua.lua_pcall(L, 0, -1, 0);
  if (s2 !== lua.LUA_OK) return 'RUNERR: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 70);
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const v = lua.lua_tostring(L, -1);
  return v === null || v === undefined ? 'nil' : to_jsstring(v);
}

let failures = 0;
console.log('VM(NONE) CLOSURE / RECURSION REGRESSION');
console.log('='.repeat(72));
console.log(`seeds per case: ${SEEDS.length}   cases: ${CASES.length}`);
console.log('');

for (const [name, src, expected] of CASES) {
  const bad = [];
  for (const profile of ['OPAL', 'SECURE']) {
    for (const seed of SEEDS) {
      let art;
      try {
        art = applyBytecodeVm(src, { target: 'lua51', profile, rethrow: true, seedOverride: seed });
      } catch (e) {
        bad.push(`${profile}/s${seed} build: ${String(e.message).slice(0, 60)}`);
        continue;
      }
      const got = runArtifact(art);
      if (got !== expected) bad.push(`${profile}/s${seed}: got ${got} want ${expected}`);
    }
  }
  if (bad.length) {
    console.error(`  FAIL: ${name}: ${bad.length} mismatch(es) -> ${bad.slice(0, 3).join(' | ')}`);
    failures++;
  } else {
    console.log(`  [PASS] ${name.padEnd(38)} ${SEEDS.length * 2} builds all == ${expected}`);
  }
}

console.log('');
if (failures) {
  console.error(`VM(NONE) CLOSURE/RECURSION TEST: ${failures} failure(s)`);
  process.exit(1);
}
console.log('VM(NONE) CLOSURE/RECURSION TEST: PASS');
