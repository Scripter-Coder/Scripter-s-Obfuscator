// tools/bench/vm-correctness.mjs
//
// Differential correctness harness for the VM layer.
//
// For every fixture it runs the ORIGINAL source and the EMITTED VM layer in
// the same Lua host (fengari) and compares the captured `print` transcript.
// The VM layer is emitted once per (fixture x profile x seed) so a build is
// sampled repeatedly instead of once.
//
// Usage:
//   node tools/bench/vm-correctness.mjs                # default matrix
//   node tools/bench/vm-correctness.mjs --seeds 5      # 5 builds per case
//   node tools/bench/vm-correctness.mjs --quiet
import { readFileSync } from 'fs';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const a = argv[i + 1];
  return a && !a.startsWith('--') ? a : 'true';
};
const SEEDS = parseInt(opt('seeds', '3'), 10);
const QUIET = opt('quiet', 'false') === 'true';
const ONLY = opt('only', null);

const PROFILES = (opt('profiles', 'FAST,BALANCED,SECURE') || '').split(',').filter(Boolean);

const PRELUDE = `
__OUT = {}
local function __p(...)
  local n = select("#", ...)
  local p = {}
  for i = 1, n do p[i] = tostring((select(i, ...))) end
  __OUT[#__OUT + 1] = table.concat(p, "\\t")
end
print = __p
`;

function runLua(src) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_dostring(L, to_luastring(PRELUDE + src + '\n__RESULT__ = table.concat(__OUT, "\\n")'));
  if (st !== lua.LUA_OK) {
    return { err: to_jsstring(lua.lua_tostring(L, -1)).slice(0, 300) };
  }
  lua.lua_getglobal(L, to_luastring('__RESULT__'));
  const raw = lua.lua_tostring(L, -1);
  return { out: raw ? to_jsstring(raw) : '' };
}

// ---------------------------------------------------------------------------
// Fixtures. Each must be self-contained, deterministic, and print a transcript
// that pins down the semantics it exercises.
// ---------------------------------------------------------------------------
const CASES = [
  ['arith', `
local a, b = 7, 3
print(a + b, a - b, a * b, a / b, a % b, a ^ b, -a)
print(a == b, a ~= b, a < b, a <= b, a > b, a >= b)
print(not a, not false, #"hello")
`],
  ['strings', `
local s = "hello world"
print(#s, s:upper(), s:sub(1, 5), s:rep(2, "|"))
print("a" .. "b" .. "c", ("x"):byte(), string.format("%d-%s", 5, "z"))
local t = {}
for i = 1, 5 do t[i] = ("n%d"):format(i) end
print(#t, table.concat(t, ","))
`],
  ['tables', `
local t = { 10, 20, 30, x = 1, ["y z"] = 2 }
t[4] = 40
t.x = t.x + 10
print(#t, t[1], t.x, t["y z"])
local k = {}
k[t] = "self"
print(k[t])
local nested = { a = { b = { c = 99 } } }
print(nested.a.b.c)
for i = 1, #t do io_out = (io_out or "") .. i end
`],
  ['locals_scopes', `
local x = 1
do local x = 2 do local x = 3 print(x) end print(x) end
print(x)
local function outer()
  local a = 10
  local function mid()
    local function inner() return a + 1 end
    return inner()
  end
  return mid()
end
print(outer())
`],
  ['closures_upvalues', `
local function counter()
  local n = 0
  return function() n = n + 1 return n end
end
local c1, c2 = counter(), counter()
print(c1(), c1(), c2())
local fns = {}
for i = 1, 3 do fns[i] = function() return i end end
print(fns[1](), fns[2](), fns[3]())
`],
  ['control_flow', `
local acc = {}
for i = 1, 6 do
  if i % 2 == 0 then acc[#acc + 1] = "e" .. i
  elseif i == 3 then acc[#acc + 1] = "three"
  else acc[#acc + 1] = i end
end
print(table.concat(acc, " "))
local i2 = 0
while i2 < 4 do i2 = i2 + 1 if i2 == 3 then break end end
print("while", i2)
local j = 0
repeat j = j + 2 until j >= 6
print("repeat", j)
for i = 1, 10 do if i > 3 then break end end
print("break", i)
`],
  ['numeric_for', `
local out = {}
for i = 10, 1, -2 do out[#out + 1] = i end
print(table.concat(out, ","))
-- %g, not tostring: 5.3 prints 2.0 where 5.1 prints 2, and both sides run
-- under the same host here, so the fixture must not assert float spelling.
for i = 1.5, 3, 0.5 do out[#out + 1] = string.format("%g", i) end
print(table.concat(out, " "))
`],
  ['generic_for', `
local acc = {}
for i, v in ipairs({ "a", "b", "c" }) do acc[#acc + 1] = i .. v end
print(table.concat(acc, " "))
local keys = {}
for k, v in pairs({ a = 1, b = 2 }) do keys[#keys + 1] = k end
table.sort(keys)
print(table.concat(keys, ","))
local t = { 1, 2, 3, x = "y" }
local n = 0
for _ in next, t do n = n + 1 end
print("next", n)
`],
  ['varargs_multret', `
local function count(...)
  return select("#", ...), ...
end
print(count())
print(count(1, nil, 3))
local function pass(...) return count(...) end
print(pass("a", "b"))
local function multi() return 1, 2, 3 end
local x, y, z = multi()
print(x, y, z)
local t = { multi() }
print(#t, t[1])
local t2 = { multi(), multi() }
print(#t2)
print(multi(), multi())
`],
  ['calls_methods', `
local obj = { n = 5 }
function obj:get(k) return (k or "n") .. self.n end
function obj.plain(a, b) return a - b end
print(obj:get(), obj:get("k"))
print(obj.plain(9, 4))
local t = { sub = { deep = function() return "deep" end } }
print(t.sub.deep())
local fns = { print }
fns[1]("via table")
`],
  ['recursion', `
local function fact(n) if n <= 1 then return 1 end return n * fact(n - 1) end
print(fact(10))
local function fib(n) if n < 2 then return n end return fib(n - 1) + fib(n - 2) end
print(fib(15))
local a, b
a = function(x) if x == 0 then return 0 end return b(x - 1) end
b = function(x) if x == 0 then return 1 end return a(x - 1) end
print(a(9))
`],
  ['numerics', `
print(1 + 2 * 3 - 4 / 2, (1 + 2) * 3, 2 ^ 3 ^ 2)
print(7 % 3, -7 % 3, 7.5 % 2)
print(tonumber("42") + 1, tostring(3.5), math.floor(3.7), math.max(1, 9, 4))
print(10 / 4, math.tointeger and math.tointeger(10 / 4) or "no-tointeger")
`],
  ['nested_data', `
local function build(depth)
  if depth == 0 then return nil end
  return { depth = depth, child = build(depth - 1), list = { 1, 2, depth } }
end
local root = build(4)
local sum, node = 0, root
while node do sum = sum + node.depth node = node.child end
print(sum, root.list[3], root.child.child.depth)
local big = {}
for i = 1, 50 do big[i] = { i = i, s = "v" .. i } end
local t = 0
for i = 1, 50 do t = t + big[i].i end
print(t)
`],
];

function main() {
  let pass = 0, fail = 0;
  const failures = [];
  const cases = ONLY ? CASES.filter((c) => c[0] === ONLY) : CASES;
  if (!cases.length) { console.error('no fixture named ' + ONLY); process.exit(1); }
  for (const [name, src] of cases) {
    const ref = runLua(src);
    if (ref.err !== undefined) {
      failures.push({ name, why: 'fixture itself fails to run: ' + ref.err });
      fail++;
      continue;
    }
    luaparse.parse(src);
    for (const profile of PROFILES) {
      for (let s = 0; s < SEEDS; s++) {
        const seed = 1000 + s * 7919;
        const label = `${name}/${profile}/seed${seed}`;
        let vm;
        try {
          vm = applyBytecodeVm(src, { profile, rethrow: true, seedOverride: seed, hardenOff: process.env.SC_NOHARDEN==='1', scrambleOff: process.env.SC_NOSCRAMBLE==='1' });
        } catch (e) {
          failures.push({ name: label, why: 'emit threw: ' + e.message });
          fail++;
          continue;
        }
        if (vm === null) { failures.push({ name: label, why: 'emit returned null' }); fail++; continue; }
        const got = runLua(vm);
        if (got.err !== undefined) {
          failures.push({ name: label, why: 'runtime error: ' + got.err });
          fail++;
        } else if (got.out !== ref.out) {
          failures.push({
            name: label,
            why: 'output mismatch\n  expected: ' + JSON.stringify(ref.out.slice(0, 400)) +
                 '\n  actual:   ' + JSON.stringify(got.out.slice(0, 400)),
          });
          fail++;
        } else {
          pass++;
          if (!QUIET) console.log('  ok  ' + label);
        }
      }
    }
  }
  console.log(`\nvm-correctness: ${pass} passed, ${fail} failed`);
  for (const f of failures) console.log('  FAIL ' + f.name + ': ' + f.why);
  process.exit(fail ? 1 : 0);
}
main();