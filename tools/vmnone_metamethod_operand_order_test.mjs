// tools/vmnone_metamethod_operand_order_test.mjs
//
// Regression: operator rewrites must not reorder operands of values that may
// carry a metatable.
//
// Lua's arithmetic/comparison operators dispatch to metamethods, and the
// metamethod receives its arguments in WRITTEN order. So `t + 6` calls
// __add(t, 6) while `6 + t` calls __add(6, t) -- different observable calls.
//
// Three rewrites used to break this:
//   * MBA `comm_swap`   a+b -> b+a
//   * MBA `sub_neg`     a-b -> a+(-b)      (turns __sub into __add)
//   * MBA `sub_not`     a-b -> a+(~b)+1
// plus the pipeline's `reversed` mutation (ADD -> ADD_R), whose opcode was
// emitted with the same body as ADD, so the "reversal" it claimed never
// happened while operand order still varied per build.
//
// Result was silent miscompilation on a large fraction of builds: ~27% of
// seeds failed `tostring(t + 6)` with "attempt to index a number value".
//
// This test sweeps many seeds and requires every seed to agree with plain Lua.

import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

// Each case is [name, source, expectedResult]. `expectedResult` is what plain
// Lua 5.1 semantics produce; the obfuscated build must match on EVERY seed.
const CASES = [
  ['meta add t+6', 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); RESULT=tostring(t+6)', '10'],
  // Reversed form must still dispatch __add(6,t) and therefore still fail,
  // exactly as plain Lua does.
  ['meta add 6+t', 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); RESULT=tostring(6+t)', 'ERROR'],
  ['meta add var', 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); local k=6 RESULT=tostring(t+k)', '10'],
  ['meta add t+t', 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b.x end}); RESULT=tostring(t+t)', '8'],
  ['meta sub t-1', 'local t=setmetatable({x=4},{__sub=function(a,b)return a.x-b end}); RESULT=tostring(t-1)', '3'],
  ['meta mul t*2', 'local t=setmetatable({x=4},{__mul=function(a,b)return a.x*b end}); RESULT=tostring(t*2)', '8'],
  ['meta concat', 'local t=setmetatable({x=4},{__concat=function(a,b)return a.x..b end}); RESULT=tostring(t.."z")', '4z'],
  ['meta lt', 'local t=setmetatable({x=4},{__lt=function(a,b)return a.x<b end}); RESULT=tostring(t<9)', 'true'],
  ['meta eq order', 'local t=setmetatable({x=4},{__eq=function(a,b)return a.x==b.x end}); local u=setmetatable({x=4},{__eq=function(a,b)return a.x==b.x end}); RESULT=tostring(t==u)', 'true'],
  ['meta idx only', 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); RESULT=tostring(t.x)', '4'],
  // Plain arithmetic with no metatable must be untouched by the fix.
  ['plain add', 'local a=2 local b=3 RESULT=tostring(a+b)', '5'],
  ['plain sub', 'local a=9 local b=3 RESULT=tostring(a-b)', '6'],
  ['plain mul', 'local a=9 local b=3 RESULT=tostring(a*b)', '27'],
  ['const add', 'RESULT=tostring(2+3)', '5'],
  ['const sub', 'RESULT=tostring(9-3)', '6'],
];

const SEEDS = 40;
const PROFILES = ['OPAL', 'SECURE'];

function runArtifact(art) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_loadbuffer(L, to_luastring(art), null, to_luastring('art'));
  if (st !== lua.LUA_OK) return 'LOADERR';
  const s2 = lua.lua_pcall(L, 0, -1, 0);
  // An expected ERROR is only distinguishable if we know the run failed. A
  // successful run leaves RESULT set; pcall failure is reported by the caller
  // through a sentinel global.
  lua.lua_getglobal(L, to_luastring('__LPH_FAILED__'));
  const failed = lua.lua_tostring(L, -1);
  lua.lua_settop(L, -2);
  if (s2 !== lua.LUA_OK) return 'ERROR';
  if (failed !== null && failed !== undefined) return 'ERROR';
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const v = lua.lua_tostring(L, -1);
  return v === null || v === undefined ? 'nil' : to_jsstring(v);
}

let failures = 0;
const fail = (m) => { console.error('  FAIL: ' + m); failures++; };

console.log('METAMETHOD OPERAND-ORDER REGRESSION');
console.log('='.repeat(72));
console.log(`seeds per case: ${SEEDS}   profiles: ${PROFILES.join(', ')}`);
console.log('');

for (const [name, src, expected] of CASES) {
  const bad = [];
  for (const profile of PROFILES) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      let art;
      try {
        art = applyBytecodeVm(src, { target: 'lua51', profile, rethrow: true, seedOverride: seed });
      } catch (e) {
        bad.push(`${profile}/s${seed}: build threw ${String(e.message).slice(0, 60)}`);
        continue;
      }
      const got = runArtifact(art);
      if (got !== expected) bad.push(`${profile}/s${seed}: got ${got} want ${expected}`);
    }
  }
  if (bad.length) {
    fail(`${name}: ${bad.length} mismatch(es) -> ${bad.slice(0, 4).join(' | ')}`);
  } else {
    console.log(`  [PASS] ${name.padEnd(16)} ${PROFILES.length * SEEDS} builds all == ${expected}`);
  }
}

console.log('');
if (failures) {
  console.error(`METAMETHOD OPERAND-ORDER TEST: ${failures} failure(s)`);
  process.exit(1);
}
console.log('METAMETHOD OPERAND-ORDER TEST: PASS');
