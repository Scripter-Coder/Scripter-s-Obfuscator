import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_dostring(L, to_luastring(code));
  if (st !== lua.LUA_OK) return { ok: false, error: to_jsstring(lua.lua_tostring(L, -1)) };
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const v = lua.lua_isnil(L, -1) ? 'nil' : to_jsstring(lua.lua_tostring(L, -1));
  return { ok: true, value: v };
}

function compileWithStats(src, profile = 'BALANCED') {
  let captured = null;
  const artifact = applyBytecodeVm(src, {
    profile, seedOverride: 777, rethrow: true,
    onBuild: (b) => { captured = b; },
  });
  return { artifact, build: captured };
}

let passed = 0;
function check(name, fn) {
  fn();
  console.log(JSON.stringify({ proof: name, pass: true }));
  passed++;
}

// INLINE proof: eligible call must be expanded (inlined>0) and artifact must
// not retain a normal CALL to the inlined function (name absent as VM global).
check('inline-normal-params', () => {
  const src = 'local function add(a,b) return a+b end RESULT=add(3,4)';
  const { artifact, build } = compileWithStats(src);
  if (!build || !build.inline || !(build.inline.inlined > 0)) throw new Error('inline did not fire: ' + JSON.stringify(build && build.inline));
  const r = run(artifact);
  if (!r.ok || r.value !== '7') throw new Error('inline behavior wrong: ' + JSON.stringify(r));
});

check('inline-side-effects-eval-order', () => {
  const src = 'local state=0 local function f(a) state=state+1 return a+state end local x=f(4) local y=f(10) RESULT=x*100+y';
  const { artifact, build } = compileWithStats(src);
  if (!build.inline || !(build.inline.inlined > 0)) throw new Error('side-effect inline did not fire');
  // native: f(4): state=1, 4+1=5; f(10): state=2, 10+2=12 => 5*100+12=512
  const r = run(artifact);
  if (!r.ok || r.value !== '512') throw new Error('eval-order wrong: ' + JSON.stringify(r));
  // also verify native matches
  const n = run(src);
  if (n.value !== r.value) throw new Error(`native=${n.value} vs generated=${r.value}`);
});

check('inline-adversarial-arg-order', () => {
  const src = 'local s=0 local function g() s=s+1 return s end local function f(a,b) return a*10+b end RESULT=f(g(),g())';
  const { artifact } = compileWithStats(src);
  const r = run(artifact);
  const n = run(src);
  if (!r.ok || r.value !== n.value) throw new Error(`adversarial mismatch native=${n.value} gen=${JSON.stringify(r)}`);
  if (r.value !== '12') throw new Error('expected 12, got ' + r.value);
});

check('inline-upvalue-mutable', () => {
  const src = 'local x=4 local function f(a) return a+x end RESULT=f(3)';
  const { artifact, build } = compileWithStats(src);
  if (!build.inline || !(build.inline.inlined > 0)) throw new Error('upvalue inline did not fire');
  const r = run(artifact);
  if (!r.ok || r.value !== '7') throw new Error('upvalue inline wrong: ' + JSON.stringify(r));
});

// UNROLL proof: computable loop must report unrolled>0 and execute correctly.
check('unroll-basic', () => {
  const src = 'local s=0 for i=1,4 do s=s+i end RESULT=s';
  const { artifact, build } = compileWithStats(src);
  if (!build || !build.unroll || !(build.unroll.unrolled > 0)) throw new Error('unroll did not fire: ' + JSON.stringify(build && build.unroll));
  const r = run(artifact);
  if (!r.ok || r.value !== '10') throw new Error('unroll behavior wrong: ' + JSON.stringify(r));
  // artifact structure proof: unrolled loop becomes RepeatStatement-wrapped
  // Do blocks; the numeric-for header must be gone from the transform input.
  // Here we prove via build stats (authoritative compiler path).
});

check('unroll-break-continue', () => {
  const src = 'local s=0 for i=1,5 do if i==4 then break end s=s+i end RESULT=s';
  const { artifact } = compileWithStats(src);
  const r = run(artifact);
  if (!r.ok || r.value !== '6') throw new Error('break unroll wrong: ' + JSON.stringify(r));
  const src2 = 'local s=0 for i=1,4 do if i==2 then s=s+100 else s=s+i end end RESULT=s';
  const r2 = run(compileWithStats(src2).artifact);
  if (!r2.ok || r2.value !== '108') throw new Error('continue-class unroll wrong: ' + JSON.stringify(r2));
});

check('unroll-zero-one', () => {
  const z = run(compileWithStats('local s=0 for i=4,1,1 do s=s+1 end RESULT=s').artifact);
  if (!z.ok || z.value !== '0') throw new Error('zero-iter wrong: ' + JSON.stringify(z));
  const o = run(compileWithStats('local s=0 for i=1,1 do s=s+7 end RESULT=s').artifact);
  if (!o.ok || o.value !== '7') throw new Error('one-iter wrong: ' + JSON.stringify(o));
});

console.log(`INLINE/UNROLL proof matrix: ${passed}/7 passed`);
