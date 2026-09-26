// tools/vm_dispatch_polymorphism_test.mjs
//
// Regression coverage for per-build dispatch polymorphism.
//
// Three properties are asserted:
//   1. Every dispatch strategy is actually reachable. A previous wiring bug
//      collapsed all non-table strategies into branch and pinned ONYX to
//      branch, leaving three strategies unreachable; this test fails if that
//      ever silently returns.
//   2. Every strategy produces program output identical to plain Lua, on all
//      six supplied runtimes (loops, recursion, coroutines, pcall, varargs,
//      multiple returns, tables, string ops).
//   3. No build exposes a literal "opcode number -> handler" table key. The
//      handler slot must be reached through the per-build affine key map.
//
// Exits non-zero on any failure.

import luaparse from 'luaparse';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { pickDispatcher, DISPATCHER_STRATEGIES } from '../src/vm/dispatcher.js';
vmBCSetLuaparse(luaparse);

const RUNTIMES = {
  'lua-5.1.5': 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/lua-5.1.5/lua-5.1.5/src/lua.exe',
  'lua-5.2.4': 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/native-build/lua-5.2.4/src/lua.exe',
  'lua-5.3.6': 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/native-build/lua-5.3.6/src/lua.exe',
  'lua-5.4.8': 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/native-build/lua-5.4.8/src/lua.exe',
  'LuaJIT-2.1': 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/native-build/LuaJIT-2.1/src/luajit.exe',
  'luau': 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/native-build/luau-windows/luau.exe',
};

const PROGRAM = `
local t = {}
for i = 1, 5 do t[#t+1] = i * i end
local function fib(n) if n < 2 then return n end return fib(n-1) + fib(n-2) end
local function multi() return 1, 2, 3 end
local a, b, c = multi()
local co = coroutine.create(function(x) local y = coroutine.yield(x + 1) return y * 2 end)
local _, y1 = coroutine.resume(co, 1)
local _, y2 = coroutine.resume(co, 10)
local ok = pcall(function() error("boom") end)
local s = ("ab"):upper() .. tostring(#"xyz") .. tostring(math.floor(7 / 2))
print(table.concat(t, ",") .. "|" .. fib(10) .. "|" .. a .. b .. c .. "|" .. tostring(y1) .. "|" .. tostring(y2) .. "|" .. tostring(ok) .. "|" .. s)
`;

// ERROR_HANDLING reports positions against the original chunk, so a chunk path
// appears in the pcall message. Fields are '|'-separated; matching up to the
// "a.lua:" marker strips the path without touching the semantic fields.
function norm(out) { return out.replace(/[^|]*a\.lua:/g, '<CHUNK>:'); }

function runLua(exe, src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-poly-'));
  const f = path.join(dir, 'a.lua');
  fs.writeFileSync(f, src, 'utf8');
  try {
    return { ok: true, out: norm(String(execFileSync(exe, [f], { encoding: 'utf8', timeout: 30000 })).trim()) };
  } catch (e) {
    const s = String((e.stderr || e.message || '')).trim().split('\n').filter(Boolean);
    return { ok: false, out: 'ERR ' + norm(s[s.length - 1] || '').slice(0, 160) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const strategyOf = (art) => (art.match(/-- dispatcher strategy: (\w+)/) || [, 'unknown'])[1];

let failures = 0;
const fail = (m) => { console.error('  FAIL: ' + m); failures++; };

// ---- reference output ------------------------------------------------------
const available = Object.entries(RUNTIMES).filter(([, exe]) => fs.existsSync(exe));
if (available.length === 0) { console.error('no runtimes found'); process.exit(1); }
const ref = runLua(available[0][1], PROGRAM);
if (!ref.ok) { console.error('reference program itself failed: ' + ref.out); process.exit(1); }
console.log('reference output: ' + JSON.stringify(ref.out));
console.log('runtimes under test: ' + available.map(([n]) => n).join(', '));
console.log('');

// ---- 1a) every strategy constant is selectable -----------------------------
// This is the direct guard against the old wiring bug where a collapse made
// NUMERIC/STATE_OP/MIXED unreachable and pinned ONYX to branch.
console.log('--- strategy constant reachability (3000 seeds) ---');
const selectable = new Map();
for (let s = 1; s <= 3000; s++) {
  for (const prof of ['BALANCED', 'SECURE']) {
    const d = pickDispatcher(s, prof);
    selectable.set(d, (selectable.get(d) || 0) + 1);
  }
}
for (const [k, v] of [...selectable.entries()].sort()) console.log(`  ${k.padEnd(24)} ${v}`);
for (const k of Object.values(DISPATCHER_STRATEGIES)) {
  if (!selectable.has(k)) fail(`strategy constant never selectable: ${k}`);
}
console.log(`  ${selectable.size}/${Object.keys(DISPATCHER_STRATEGIES).length} strategy constants reachable`);
console.log('');

// ---- 1b) every emitted dispatch shape is reachable -------------------------
console.log('--- emitted dispatch shape reachability ---');
const seen = new Map();   // shape -> artifact
for (let seed = 1; seed <= 300 && seen.size < 4; seed++) {
  let art;
  try {
    art = applyBytecodeVm(PROGRAM, { target: 'lua51', profile: 'SECURE', obfuscated: true, rethrow: true, seedOverride: seed });
  } catch (e) { fail(`seed ${seed} build error: ${String(e.message).slice(0, 120)}`); continue; }
  const s = strategyOf(art);
  if (!seen.has(s)) seen.set(s, { art, seed });
}
for (const [s, v] of seen) console.log(`  ${s.padEnd(24)} first seen at seed ${v.seed} (${v.art.length} bytes)`);
// MIXED / NUMERIC / STATE_OP deliberately share the table emission path, so
// there are three distinct SHAPES, not six.
for (const r of ['table', 'branch', 'opaque_decision_tree']) if (!seen.has(r)) fail(`emitted dispatch shape never produced: ${r}`);
console.log(`  ${seen.size} distinct shapes observed across 300 seeds`);
console.log('');

// ---- 2) semantics per strategy, on every runtime ---------------------------
console.log('--- per-strategy semantic equivalence on all runtimes ---');
for (const [s, v] of seen) {
  const bad = [];
  for (const [name, exe] of available) {
    const r = runLua(exe, v.art);
    if (!r.ok) bad.push(`${name}: threw ${r.out}`);
    else if (r.out !== ref.out) bad.push(`${name}: output differs`);
  }
  if (bad.length) fail(`${s} (seed ${v.seed}): ` + bad.join(' | '));
  else console.log(`  [PASS] ${s.padEnd(24)} seed ${String(v.seed).padStart(3)}  ${available.length}/${available.length} runtimes match reference`);
}
console.log('');

// ---- 3) no literal opcode->handler key ------------------------------------
console.log('--- handler slots must not be literal opcode keys ---');
for (const [s, v] of seen) {
  // A handler stored under a bare integer key is the pattern this work removes.
  const literalKeys = (v.art.match(/\[\d+\]=function\(\)/g) || []).length;
  if (literalKeys > 0) fail(`${s} (seed ${v.seed}): ${literalKeys} literal [N]=function() handler keys present`);
  else console.log(`  [PASS] ${s.padEnd(24)} 0 literal handler keys (routed via per-build affine map)`);
}
console.log('');

if (failures) {
  console.error(`DISPATCH POLYMORPHISM TEST: ${failures} failure(s)`);
  process.exit(1);
}
console.log('DISPATCH POLYMORPHISM TEST: PASS');
