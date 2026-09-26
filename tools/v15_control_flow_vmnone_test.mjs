// tools/v15_control_flow_vmnone_test.mjs
//
// CONTROL_FLOW on a VM(NONE) function performs a GENUINE native-source
// transform: each if/elseif/else chain is rewritten into a state-dispatch loop,
// so branch bodies are no longer lexically nested under the conditional.
//
// Design notes that the tests below lock in:
//
//  * It runs LAST, on the final emitted text (after EXTRACT / REWRITE_NAMECALLS /
//    the upvalue bridge), and re-parses it. An earlier revision planned against
//    pristine AST spans and rendered branch bodies through a callback that
//    applied those transforms. Those transforms change text LENGTH, so slicing a
//    sub-range by its original offsets out of rewritten text tears the text
//    apart. Running last means one coordinate system, no rebase.
//
//  * A chain is flattened EXACTLY ONCE. If a nested chain were also spliced at
//    an outer level, its text would be emitted twice and corrupt the output
//    (observed: four dispatch loops and two copies of a `return` for three
//    chains, producing `endd 1 or (2) while true do ...`).
//
//  * Unsafe constructs FAIL CLOSED for the whole function. `break`, `continue`
//    and `goto` target an enclosing loop or label, so relocating a branch body
//    containing one would silently retarget it. A partial transform is never
//    reported as success.

import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const CF = 'LPH_ATTRIBUTES(VM(NONE), TRANSFORM(CONTROL_FLOW))';
const PROFILES = ['OPAL', 'SECURE'];
const SEEDS = [1, 5, 9, 13];

// [name, source, expectation]  expectation 'ok:<v>' or 'reject'
const APPLY = [
  ['simple if/else', `local function f(n) ${CF} if n>3 then return "big" else return "small" end end RESULT=f(5)`, 'ok:big'],
  ['if/elseif/else', `local function f(n) ${CF} if n>9 then return "a" elseif n>1 then return "mid" else return "c" end end RESULT=f(5)`, 'ok:mid'],
  ['no else branch', `local function f(n) ${CF} if n>3 then return 1 end return 0 end RESULT=tostring(f(5))`, 'ok:1'],
  ['nested conditional x3', `local function f(n) ${CF} if n>0 then if n>1 then if n>2 then return 7 end end end return 0 end RESULT=tostring(f(5))`, 'ok:7'],
  ['nested in else', `local function f(n) ${CF} if n>100 then return 1 else if n>2 then return 8 end end return 0 end RESULT=tostring(f(5))`, 'ok:8'],
  ['nested in then', `local function f(n) ${CF} if n<100 then if n>2 then return 9 end end return 0 end RESULT=tostring(f(5))`, 'ok:9'],
  ['deep nest 4 levels', `local function f(n) ${CF} if n>0 then if n>1 then if n>2 then if n>3 then return 4 end end end end return 0 end RESULT=tostring(f(5))`, 'ok:4'],
  ['short-circuit and', `local function f(a,b) ${CF} if a and b then return 3 end return 0 end RESULT=tostring(f(true,true))`, 'ok:3'],
  ['short-circuit or', `local function f(a,b) ${CF} if a or b then return 4 end return 0 end RESULT=tostring(f(false,true))`, 'ok:4'],
  ['cond with side effect', `local n=0 local function bump() n=n+1 return true end local function f() ${CF} if bump() then return n end return 0 end RESULT=tostring(f())`, 'ok:1'],
  ['cond with call', `local function f(n) ${CF} if tostring(n)=="5" then return 5 end return 0 end RESULT=tostring(f(5))`, 'ok:5'],
  ['comparison in cond', `local function f(a,b) ${CF} if a>b then return "gt" else return "le" end end RESULT=f(5,3)`, 'ok:gt'],
  ['loop-contained if', `local function f(n) ${CF} local s=0 for i=1,n do if i>0 then s=s+i end end return s end RESULT=tostring(f(5))`, 'ok:15'],
  ['if inside loop w/ local', `local function f(n) ${CF} local s=0 for i=1,n do local t=i if t>0 then s=s+t end end return s end RESULT=tostring(f(3))`, 'ok:6'],
  // i=1 odd s=-1 | i=2 even s=1 | i=3 odd s=-2 | i=4 even s=2  (verified on Lua 5.1.5)
  ['loop with if/else', `local function f(n) ${CF} local s=0 for i=1,n do if i%2==0 then s=s+i else s=s-i end end return s end RESULT=tostring(f(4))`, 'ok:2'],
  ['numeric loop only', `local function f(n) ${CF} local s=0 for i=1,n do s=s+i end return s end RESULT=tostring(f(5))`, 'ok:15'],
  ['while loop', `local function f(n) ${CF} local s=0 while n>0 do s=s+n n=n-1 end return s end RESULT=tostring(f(4))`, 'ok:10'],
  ['repeat/until', `local function f(n) ${CF} local s=0 repeat s=s+n n=n-1 until n<=0 return s end RESULT=tostring(f(4))`, 'ok:10'],
  ['no control flow at all', `local function f(n) ${CF} return n*2 end RESULT=tostring(f(4))`, 'ok:8'],
  ['return in both arms', `local function f(n) ${CF} if n>0 then return "p" end return "n" end RESULT=f(1)`, 'ok:p'],
];

// Must fail closed: relocating these would retarget break/continue/goto.
const REJECT = [
  ['break inside branch', `local function f(n) ${CF} local s=0 for i=1,10 do if i==3 then break end s=s+i end return s end RESULT=tostring(f(10))`],
  ['break in else branch', `local function f(n) ${CF} local s=0 for i=1,10 do if i==3 then s=s+1 else break end end return s end RESULT=tostring(f(10))`],
  ['break nested deeper', `local function f(n) ${CF} for i=1,10 do if i>0 then if i==3 then break end end end return 0 end RESULT=tostring(f(10))`],
  ['break deep in chain body', `local function f(n) ${CF} local s=0 for i=1,10 do if i==1 then s=s+1 elseif i==3 then break end s=s+i end return s end RESULT=tostring(f(10))`],
  ['goto in branch', `local function f(n) ${CF} if n>0 then goto done end return 1 ::done:: return 0 end RESULT=tostring(f(5))`],
  ['continue in branch', `local function f(n) ${CF} local s=0 for i=1,10 do if i==3 then continue end s=s+i end return s end RESULT=tostring(f(10))`],
  ['break inside nested function is fine but outer is not', `local function f(n) ${CF} local s=0 for i=1,10 do if i==3 then break end end return s end RESULT=tostring(f(10))`],
];

function runArtifact(art) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_loadbuffer(L, to_luastring(art), null, to_luastring('art'));
  if (st !== lua.LUA_OK) return 'LOADERR';
  const s2 = lua.lua_pcall(L, 0, -1, 0);
  if (s2 !== lua.LUA_OK) return 'RUNERR:' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 60);
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const v = lua.lua_tostring(L, -1);
  return v === null || v === undefined ? 'nil' : to_jsstring(v);
}

let failures = 0;
console.log('CONTROL_FLOW + VM(NONE) NATIVE TRANSFORM PROOF');
console.log('='.repeat(74));
console.log(`transformed cases: ${APPLY.length}   fail-closed cases: ${REJECT.length}   builds per case: ${PROFILES.length * SEEDS.length}`);
console.log('');

console.log('-- must transform and stay correct --');
for (const [name, src, expect] of APPLY) {
  const bad = [];
  for (const profile of PROFILES) {
    for (const seed of SEEDS) {
      let art;
      try { art = applyBytecodeVm(src, { target: 'lua51', profile, rethrow: true, seedOverride: seed }); }
      catch (e) { bad.push(`${profile}/s${seed} rejected: ${String(e.message).slice(0, 60)}`); continue; }
      const got = 'ok:' + runArtifact(art);
      if (got !== expect) bad.push(`${profile}/s${seed}: got ${got} want ${expect}`);
    }
  }
  if (bad.length) { console.error(`  FAIL: ${name}: ${bad.slice(0, 2).join(' | ')}`); failures++; }
  else console.log(`  [PASS] ${name.padEnd(38)} ${PROFILES.length * SEEDS.length} builds == ${expect}`);
}

console.log('');
console.log('-- must fail closed (never silently pass) --');
for (const [name, src] of REJECT) {
  let accepted = 0, total = 0, sample = '';
  for (const profile of PROFILES) {
    for (const seed of SEEDS) {
      total++;
      try { applyBytecodeVm(src, { target: 'lua51', profile, rethrow: true, seedOverride: seed }); accepted++; }
      catch (e) { sample = String(e.message).slice(0, 80); }
    }
  }
  if (accepted) { console.error(`  FAIL: ${name}: accepted in ${accepted}/${total} builds (silent skip)`); failures++; }
  else console.log(`  [PASS] ${name.padEnd(38)} rejected ${total}/${total}  "${sample.slice(0, 46)}..."`);
}

console.log('');
console.log('-- CONTROL_FLOW still correct on virtualized functions --');
const VIRT = [
  ['OPAL numeric for', 'OPAL', `local function f(n) LPH_ATTRIBUTES(VM(OPAL), TRANSFORM(CONTROL_FLOW)) local s=0 for i=1,n do s=s+i end return s end RESULT=tostring(f(5))`, '15'],
  ['OPAL while', 'OPAL', `local function f(n) LPH_ATTRIBUTES(VM(OPAL), TRANSFORM(CONTROL_FLOW)) local s=0 while n>0 do s=s+n n=n-1 end return s end RESULT=tostring(f(4))`, '10'],
  ['ONYX if/else', 'SECURE', `local function f(n) LPH_ATTRIBUTES(VM(ONYX), TRANSFORM(CONTROL_FLOW)) if n>3 then return "big" else return "small" end end RESULT=f(5)`, 'big'],
  ['ONYX for + break', 'SECURE', `local function f(n) LPH_ATTRIBUTES(VM(ONYX), TRANSFORM(CONTROL_FLOW)) local s=0 for i=1,n do if i==2 then break end s=s+i end return s end RESULT=tostring(f(4))`, '1'],
  ['ONYX short-circuit', 'SECURE', `local function f(n) LPH_ATTRIBUTES(VM(ONYX), TRANSFORM(CONTROL_FLOW)) local s=0 for i=1,n do if i>1 and i<4 then s=s+i end end return s end RESULT=tostring(f(5))`, '5'],
];
for (const [name, profile, src, want] of VIRT) {
  const bad = [];
  for (const seed of SEEDS) {
    let art;
    try { art = applyBytecodeVm(src, { target: 'lua51', profile, rethrow: true, seedOverride: seed }); }
    catch (e) { bad.push(`s${seed} rejected: ${String(e.message).slice(0, 50)}`); continue; }
    const got = runArtifact(art);
    if (got !== want) bad.push(`s${seed}: got ${got} want ${want}`);
  }
  if (bad.length) { console.error(`  FAIL: virtualized ${name}: ${bad.slice(0, 2).join(' | ')}`); failures++; }
  else console.log(`  [PASS] ${('virtualized ' + name).padEnd(38)} ${SEEDS.length} builds == ${want}`);
}

console.log('');
console.log('-- the rejection is transform-specific --');
const NATIVE_OK = [
  ['EXTRACT on VM(NONE)', 'local C = LPH_ENCSTR("hi") local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT)) return C end RESULT=f()'],
  ['REWRITE_NAMECALLS on VM(NONE)', 'local t = {m=function(self,x) return x*2 end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(REWRITE_NAMECALLS)) return t:m(4) end RESULT=tostring(f())'],
  ['CONTROL_FLOW+EXTRACT on VM(NONE)', `local C = LPH_ENCSTR("hi") local function f(n) LPH_ATTRIBUTES(VM(NONE), TRANSFORM(CONTROL_FLOW, EXTRACT)) if n>0 then return C end return "x" end RESULT=f(1)`],
];
for (const [name, src] of NATIVE_OK) {
  let accepted = 0, total = 0;
  for (const profile of PROFILES) {
    for (const seed of SEEDS) {
      total++;
      try { applyBytecodeVm(src, { target: 'lua51', profile, rethrow: true, seedOverride: seed }); accepted++; }
      catch (e) { /* not accepted */ }
    }
  }
  if (accepted !== total) { console.error(`  FAIL: ${name}: only ${accepted}/${total} accepted`); failures++; }
  else console.log(`  [PASS] ${name.padEnd(38)} accepted ${total}/${total}`);
}

console.log('');
if (failures) {
  console.error(`CONTROL_FLOW + VM(NONE) TEST: ${failures} failure(s)`);
  process.exit(1);
}
console.log('CONTROL_FLOW + VM(NONE) TEST: PASS');
